"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import type { AuthActionState } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Introduce un correo electrónico válido.");

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Introduce tu contraseña."),
});

const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Escribe tu nombre completo.")
    .max(100, "El nombre es demasiado largo."),
  email: emailSchema,
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(128, "La contraseña es demasiado larga."),
  eventCode: z.string().trim().min(1, "Introduce el código del evento."),
  role: z.enum(["judge", "mentor"], {
    error: "Elige si participas como juez o como mentor.",
  }),
});

const recoverSchema = z.object({
  email: emailSchema,
});

const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "La contraseña debe tener al menos 8 caracteres.")
      .max(128, "La contraseña es demasiado larga."),
    passwordConfirmation: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirmation"],
  });

function value(formData: FormData, key: string) {
  const field = formData.get(key);
  return typeof field === "string" ? field : "";
}

function invalidForm(error: z.ZodError): AuthActionState {
  return {
    status: "error",
    message: "Revisa los campos marcados.",
    fieldErrors: error.flatten().fieldErrors,
  };
}

function configuredAdminEmails() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function loginAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = loginSchema.safeParse({
    email: value(formData, "email"),
    password: value(formData, "password"),
  });

  if (!parsed.success) {
    return invalidForm(parsed.error);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    return {
      status: "error",
      message: "Correo o contraseña incorrectos.",
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("disabled")
    .eq("id", data.user.id)
    .maybeSingle();

  if (!profile || profile.disabled) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "Cuenta desactivada, contacta con el admin.",
    };
  }

  redirect("/equipos");
}

export async function registerAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = registerSchema.safeParse({
    fullName: value(formData, "fullName"),
    email: value(formData, "email"),
    password: value(formData, "password"),
    eventCode: value(formData, "eventCode"),
    role: value(formData, "role"),
  });

  if (!parsed.success) {
    return invalidForm(parsed.error);
  }

  const admin = createAdminClient();
  const normalizedCode = parsed.data.eventCode.toUpperCase();
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id")
    .eq("signup_code", normalizedCode)
    .eq("signup_open", true)
    .limit(1)
    .maybeSingle();

  if (eventError) {
    console.error("No se pudo validar el código del evento:", eventError.message);
    return {
      status: "error",
      message: "No se ha podido validar el código. Inténtalo de nuevo.",
    };
  }

  if (!event) {
    return {
      status: "error",
      message: "Código incorrecto.",
      fieldErrors: { eventCode: ["Código incorrecto."] },
    };
  }

  const makeAdmin = configuredAdminEmails().has(parsed.data.email);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
    app_metadata: { make_admin: makeAdmin },
  });

  if (createError) {
    const duplicateAccount =
      createError.message.toLowerCase().includes("already") ||
      createError.message.toLowerCase().includes("registered");

    return {
      status: "error",
      message: duplicateAccount
        ? "Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña."
        : "No se ha podido crear la cuenta. Inténtalo de nuevo.",
    };
  }

  // El trigger handle_new_user crea el perfil como juez; aplicamos el rol
  // elegido (juez o mentor). Los correos de ADMIN_EMAILS siguen siendo admin.
  if (!makeAdmin && parsed.data.role !== "judge") {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: parsed.data.role })
      .eq("id", created.user.id);

    if (roleError) {
      console.error("No se pudo asignar el rol elegido:", roleError.message);
    }
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (signInError) {
    redirect("/login?created=1");
  }

  redirect("/equipos");
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = recoverSchema.safeParse({
    email: value(formData, "email"),
  });

  if (!parsed.success) {
    return invalidForm(parsed.error);
  }

  const supabase = await createClient();
  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ).replace(/\/$/, "");

  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    {
      redirectTo: `${siteUrl}/auth/callback?next=/nueva-contrasena`,
    },
  );

  if (error) {
    console.error("No se pudo solicitar el cambio de contraseña:", error.message);
  }

  return {
    status: "success",
    message:
      "Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña.",
  };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = newPasswordSchema.safeParse({
    password: value(formData, "password"),
    passwordConfirmation: value(formData, "passwordConfirmation"),
  });

  if (!parsed.success) {
    return invalidForm(parsed.error);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      status: "error",
      message: "El enlace ha caducado. Solicita uno nuevo.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    return {
      status: "error",
      message: "No se ha podido actualizar la contraseña. Solicita un enlace nuevo.",
    };
  }

  redirect("/equipos?password=updated");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
