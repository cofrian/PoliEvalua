"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { AuthActionState } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clearAttempts,
  clientIp,
  isBlocked,
  recordAttempt,
} from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";

const accessSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Escribe tu nombre completo.")
    .max(100, "El nombre es demasiado largo."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Introduce un correo electrónico válido."),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "La contraseña no puede superar los 72 caracteres."),
  role: z.enum(["judge", "mentor"], {
    error: "Elige si participas como juez o como mentor.",
  }),
  accessCode: z.string().trim(),
  inviteToken: z.string().trim().optional(),
}).refine((data) => data.inviteToken || data.accessCode, {
  message: "Introduce el código de acceso.",
  path: ["accessCode"],
});

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function sameCode(a: string, b: string) {
  const left = Buffer.from(a.toUpperCase());
  const right = Buffer.from(b.toUpperCase());
  return left.length === right.length && timingSafeEqual(left, right);
}

function isAdminCode(code: string) {
  const adminCode = process.env.ADMIN_ACCESS_CODE?.trim();
  return Boolean(adminCode) && sameCode(code, adminCode!);
}

async function validateAccessCode(
  admin: ReturnType<typeof createAdminClient>,
  accessCode: string,
  email: string,
  inviteToken?: string,
): Promise<
  | {
      ok: true;
      eventId: string;
      adminAccess: boolean;
      invitationId?: string;
      invitationRole?: string;
    }
  | { ok: false; state: AuthActionState }
> {
  if (inviteToken) {
    const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
    const { data: invitation, error } = await admin
      .from("event_invitations")
      .select("id, event_id, email, role, expires_at, accepted_at, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    const invalid =
      error ||
      !invitation ||
      invitation.accepted_at ||
      invitation.revoked_at ||
      new Date(invitation.expires_at) <= new Date() ||
      (invitation.email && invitation.email.toLowerCase() !== email);
    if (invalid) {
      return {
        ok: false,
        state: {
          status: "error",
          message: "La invitación no es válida, ha caducado o pertenece a otro correo.",
        },
      };
    }
    return {
      ok: true,
      eventId: invitation.event_id,
      adminAccess: false,
      invitationId: invitation.id,
      invitationRole: invitation.role,
    };
  }

  if (isAdminCode(accessCode)) {
    const { data: legacyEvent, error } = await admin
      .from("events")
      .select("id")
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (error || !legacyEvent) {
      return {
        ok: false,
        state: {
          status: "error",
          message: "No se ha encontrado el espacio de administración.",
        },
      };
    }
    return { ok: true, eventId: legacyEvent.id, adminAccess: true };
  }

  const { data: event, error } = await admin
    .from("events")
    .select("id")
    .eq("signup_code", accessCode.toUpperCase())
    .eq("signup_open", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("No se pudo validar el código:", error.message);
    return {
      ok: false,
      state: {
        status: "error",
        message: "No se ha podido validar el código. Inténtalo de nuevo.",
      },
    };
  }
  if (!event) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "Código incorrecto.",
        fieldErrors: { accessCode: ["Código incorrecto."] },
      },
    };
  }
  return { ok: true, eventId: event.id, adminAccess: false };
}

// El servidor valida primero el código privado del evento. Si el correo todavía
// no existe, crea una cuenta confirmada con la contraseña elegida. Las cuentas
// existentes solo pueden entrar con su contraseña actual.
export async function accessAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = accessSchema.safeParse({
    fullName: value(formData, "fullName"),
    email: value(formData, "email"),
    password: value(formData, "password"),
    role: value(formData, "role"),
    accessCode: value(formData, "accessCode"),
    inviteToken: value(formData, "inviteToken"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { fullName, email, password, role, accessCode, inviteToken } = parsed.data;
  const values = { fullName, email, role, accessCode };
  const admin = createAdminClient();
  const ipKey = `ip:${await clientIp()}`;
  const emailKey = `email:${email}`;
  const tooMany: AuthActionState = {
    status: "error",
    message:
      "Demasiados intentos. Espera unos minutos antes de volver a probar.",
  };

  // Antifuerza bruta 1: límite de códigos de evento incorrectos por IP.
  if (await isBlocked(admin, "bad_code", [ipKey])) return tooMany;
  const target = await validateAccessCode(admin, accessCode, email, inviteToken);
  if (!target.ok) {
    if (
      target.state.fieldErrors?.accessCode &&
      !(await recordAttempt(admin, "bad_code", [ipKey]))
    ) {
      return tooMany;
    }
    return target.state;
  }

  if (await isBlocked(admin, "bad_password", [emailKey, ipKey])) {
    return tooMany;
  }

  // La cuenta la crea el servidor, nunca la API pública. Al marcar el correo
  // como confirmado no se envía ningún mensaje y no hace falta configurar SMTP.
  const { data: createdUser, error: createError } =
    await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
      app_metadata: { created_by_server: true },
    });
  if (createError && createError.code !== "email_exists") {
    console.error("No se pudo crear la cuenta:", createError.message);
    return {
      status: "error",
      values,
      message: "No se ha podido crear el acceso. Inténtalo de nuevo.",
    };
  }

  // El trigger crea todos los perfiles desactivados. Solo esta ruta del
  // servidor, después de validar el código del evento, activa uno nuevo.
  if (!createError && createdUser.user) {
    const { error: activationError } = await admin
      .from("profiles")
      .update({ disabled: false, role })
      .eq("id", createdUser.user.id);

    if (activationError) {
      console.error("No se pudo activar el perfil:", activationError.message);
      return {
        status: "error",
        values,
        message:
          "No se ha podido activar el acceso. Contacta con la organización.",
      };
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    if (!(await recordAttempt(admin, "bad_password", [emailKey, ipKey])))
      return tooMany;
    return {
      status: "error",
      values,
      message: "Correo o contraseña incorrectos.",
      fieldErrors: { password: ["Comprueba la contraseña."] },
    };
  }
  await clearAttempts(admin, "bad_password", [emailKey, ipKey]);
  await admin.rpc("prune_auth_attempts");

  const userId = data.user.id;
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("disabled")
    .eq("id", userId)
    .maybeSingle();

  if (profileError || !profile || profile.disabled) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: profile?.disabled
        ? "Cuenta desactivada, contacta con el admin."
        : "No se ha podido comprobar tu acceso. Inténtalo de nuevo.",
    };
  }

  // El rol pertenece al espacio, no al perfil global. Un código normal nunca
  // cambia una membresía existente (y tampoco reactiva una desactivada).
  const membershipRole = target.adminAccess ? "owner" : role;
  const membershipWrite = target.invitationId
    ? await admin.rpc("accept_event_invitation", {
        p_token_hash: createHash("sha256").update(inviteToken!).digest("hex"),
        p_user_id: userId,
        p_email: email,
      })
    : target.adminAccess
    ? await admin.from("event_members").upsert(
        {
          event_id: target.eventId,
          user_id: userId,
          role: membershipRole,
          status: "active",
        },
        { onConflict: "event_id,user_id" },
      )
    : await admin.from("event_members").upsert(
        {
          event_id: target.eventId,
          user_id: userId,
          role: membershipRole,
          status: "active",
        },
        { onConflict: "event_id,user_id", ignoreDuplicates: true },
      );

  if (membershipWrite.error) {
    console.error(
      "No se pudo asignar el acceso al espacio:",
      membershipWrite.error.message,
    );
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "No se ha podido conceder el acceso al espacio.",
    };
  }

  const { data: membership } = await admin
    .from("event_members")
    .select("status")
    .eq("event_id", target.eventId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!membership || membership.status !== "active") {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "Tu acceso a este espacio está desactivado. Contacta con su gestor.",
    };
  }

  // Se conserva el rol global únicamente como dato de compatibilidad durante
  // la migración; las autorizaciones nuevas usan event_members.
  if (!target.adminAccess && !createError && createdUser.user) {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", userId);
    if (roleError) {
      console.error(
        "No se pudo actualizar el rol de compatibilidad:",
        roleError.message,
      );
    }
  }

  const cookieStore = await cookies();
  cookieStore.set("active_event_id", target.eventId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/equipos");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
