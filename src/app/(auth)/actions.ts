"use server";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import type { AuthActionState } from "@/lib/auth/types";
import { clearAttempts, clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Los mensajes de zod son claves de auth.errors; se traducen al devolverlos.
const emailSchema = z.string().trim().toLowerCase().email("email");
const passwordSchema = z
  .string()
  .min(8, "passwordMin")
  .max(72, "passwordMax");

const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  inviteToken: z.string().trim().optional(),
});

const registerSchema = loginSchema.extend({
  fullName: z
    .string()
    .trim()
    .min(2, "nameMin")
    .max(100, "nameMax"),
});

async function authT() {
  return getTranslations("auth.errors");
}

type AuthT = Awaited<ReturnType<typeof authT>>;

function translateFieldErrors(errors: Record<string, string[] | undefined>, t: AuthT) {
  return Object.fromEntries(
    Object.entries(errors).map(([field, keys]) => [field, (keys ?? []).map((key) => t(key as never))]),
  );
}

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

async function setActiveSpace(eventId: string) {
  const cookieStore = await cookies();
  cookieStore.set("active_event_id", eventId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

async function acceptInvitation(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  email: string,
  inviteToken?: string,
) {
  if (!inviteToken) return { ok: true as const, eventId: null };

  const { data, error } = await admin.rpc("accept_event_invitation", {
    p_token_hash: createHash("sha256").update(inviteToken).digest("hex"),
    p_user_id: userId,
    p_email: email,
  });
  const result = Array.isArray(data) ? data[0] : null;

  if (error || !result?.accepted_event_id) {
    return {
      ok: false as const,
      message: (await authT())("invitation"),
    };
  }

  await setActiveSpace(result.accepted_event_id);
  return { ok: true as const, eventId: result.accepted_event_id as string };
}

async function hasActiveProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
) {
  const { data: profile, error } = await admin
    .from("profiles")
    .select("disabled")
    .eq("id", userId)
    .maybeSingle();
  return !error && Boolean(profile) && !profile?.disabled;
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = await authT();
  const parsed = loginSchema.safeParse({
    email: value(formData, "email"),
    password: value(formData, "password"),
    inviteToken: value(formData, "inviteToken"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: t("checkFields"),
      fieldErrors: translateFieldErrors(parsed.error.flatten().fieldErrors, t),
    };
  }

  const { email, password, inviteToken } = parsed.data;
  const values = { email };
  const admin = createAdminClient();
  const supabase = await createClient();
  const ipKey = `ip:${await clientIp()}`;
  const emailKey = `email:${email}`;

  if (await isBlocked(admin, "bad_password", [emailKey, ipKey])) {
    return {
      status: "error",
      message: t("tooMany"),
      values,
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    await recordAttempt(admin, "bad_password", [emailKey, ipKey]);
    return {
      status: "error",
      message: t("wrongCredentials"),
      fieldErrors: { password: [t("checkPassword")] },
      values,
    };
  }

  if (!(await hasActiveProfile(admin, data.user.id))) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: t("disabled"),
      values,
    };
  }

  const invitation = await acceptInvitation(admin, data.user.id, email, inviteToken);
  if (!invitation.ok) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: invitation.message, values };
  }

  await clearAttempts(admin, "bad_password", [emailKey, ipKey]);
  await admin.rpc("prune_auth_attempts");
  redirect("/espacios");
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const t = await authT();
  const parsed = registerSchema.safeParse({
    fullName: value(formData, "fullName"),
    email: value(formData, "email"),
    password: value(formData, "password"),
    inviteToken: value(formData, "inviteToken"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: t("checkFields"),
      fieldErrors: translateFieldErrors(parsed.error.flatten().fieldErrors, t),
    };
  }

  const { fullName, email, password, inviteToken } = parsed.data;
  const values = { fullName, email };
  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
    app_metadata: { created_by_server: true },
  });

  if (createError || !created.user) {
    return {
      status: "error",
      message:
        createError?.code === "email_exists"
          ? t("exists")
          : t("createFailed"),
      values,
    };
  }

  const { error: activationError } = await admin
    .from("profiles")
    .update({ disabled: false })
    .eq("id", created.user.id);

  if (activationError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return {
      status: "error",
      message: t("activateFailed"),
      values,
    };
  }

  const supabase = await createClient();
  const { data: session, error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError || !session.user) {
    return {
      status: "error",
      message: t("signInFailed"),
      values,
    };
  }

  const invitation = await acceptInvitation(admin, session.user.id, email, inviteToken);
  if (!invitation.ok) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: invitation.message, values };
  }

  redirect("/espacios");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
