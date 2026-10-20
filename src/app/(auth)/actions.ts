"use server";

import { timingSafeEqual } from "node:crypto";
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
  role: z.enum(["judge", "mentor"], {
    error: "Elige si participas como juez o como mentor.",
  }),
  accessCode: z.string().trim().min(1, "Introduce el código de acceso."),
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
): Promise<AuthActionState | null> {
  if (isAdminCode(accessCode)) return null;

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
      status: "error",
      message: "No se ha podido validar el código. Inténtalo de nuevo.",
    };
  }
  if (!event) {
    return {
      status: "error",
      message: "Código incorrecto.",
      fieldErrors: { accessCode: ["Código incorrecto."] },
    };
  }
  return null;
}

// Acceso en dos pasos. El código del evento solo prueba que puedes entrar al
// evento; la identidad se prueba con el código de un solo uso que Supabase
// envía al correo. Así nadie puede entrar con la cuenta de otra persona.
export async function accessAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const parsed = accessSchema.safeParse({
    fullName: value(formData, "fullName"),
    email: value(formData, "email"),
    role: value(formData, "role"),
    accessCode: value(formData, "accessCode"),
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: "Revisa los campos marcados.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { fullName, email, role, accessCode } = parsed.data;
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
  const codeError = await validateAccessCode(admin, accessCode);
  if (codeError) {
    if (
      codeError.fieldErrors?.accessCode &&
      !(await recordAttempt(admin, "bad_code", [ipKey]))
    ) {
      return tooMany;
    }
    return codeError;
  }

  const otp = value(formData, "otp").replace(/\s/g, "");
  const supabase = await createClient();

  // Paso 1: enviar el código al correo.
  if (!otp) {
    // Antifuerza bruta 2: pocos correos por dirección y por IP.
    if (await isBlocked(admin, "otp_sent", [emailKey, ipKey])) return tooMany;
    // Se registra antes de enviar: si el registro de seguridad no está
    // disponible, no se permite continuar sin límite de intentos.
    if (!(await recordAttempt(admin, "otp_sent", [emailKey, ipKey])))
      return tooMany;

    // La cuenta la crea el servidor, nunca la API pública (registro desactivado).
    // Si ya existe, Supabase devuelve email_exists y seguimos con ella.
    const { data: createdUser, error: createError } =
      await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: fullName },
        app_metadata: { created_by_server: true },
      });
    if (createError && createError.code !== "email_exists") {
      console.error("No se pudo crear la cuenta:", createError.message);
      return {
        status: "error",
        message: "No se ha podido crear el acceso. Inténtalo de nuevo.",
      };
    }

    // El trigger crea todos los perfiles desactivados. Solo esta ruta del
    // servidor, después de validar el código del evento, puede activar uno
    // recién creado. Una cuenta ya existente conserva su estado.
    if (!createError && createdUser.user) {
      const { error: activationError } = await admin
        .from("profiles")
        .update({ disabled: false, role })
        .eq("id", createdUser.user.id);

      if (activationError) {
        console.error("No se pudo activar el perfil:", activationError.message);
        return {
          status: "error",
          message:
            "No se ha podido activar el acceso. Contacta con la organización.",
        };
      }
    }

    const skipEmailInLocalE2e =
      process.env.NODE_ENV !== "production" &&
      process.env.E2E_TEST_MODE === "true" &&
      email.endsWith("@test.local");

    if (!skipEmailInLocalE2e) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (error) {
        console.error("No se pudo enviar el código:", error.message);
        return {
          status: "error",
          message:
            "No se ha podido enviar el código. Espera un minuto y vuelve a probar.",
        };
      }
    }
    // Un código nuevo da intentos nuevos para ese correo.
    await clearAttempts(admin, "bad_otp", [emailKey]);
    return {
      status: "otp_sent",
      values,
      message: `Te hemos enviado un código a ${email}. Escríbelo para entrar.`,
    };
  }

  // Paso 2: comprobar el código del correo.
  // Antifuerza bruta 3: 5 fallos y hay que pedir un código nuevo.
  if (await isBlocked(admin, "bad_otp", [emailKey, ipKey])) {
    return {
      status: "error",
      values,
      message: "Demasiados códigos incorrectos. Pide un código nuevo.",
    };
  }
  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "email",
  });
  if (error || !data.user) {
    if (!(await recordAttempt(admin, "bad_otp", [emailKey, ipKey])))
      return tooMany;
    return {
      status: "otp_sent",
      values,
      message: "El código del correo no es válido o ha caducado.",
      fieldErrors: { otp: ["Código incorrecto o caducado."] },
    };
  }
  await clearAttempts(admin, "bad_otp", [emailKey]);
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

  // Con el código de admin la cuenta pasa a ser admin. Para el código normal,
  // el rol solo se fijó al crear la cuenta; las cuentas existentes conservan
  // el suyo aunque se marque otra opción en este acceso.
  if (isAdminCode(accessCode)) {
    const { error: roleError } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", userId);
    if (roleError) {
      console.error(
        "No se pudo asignar el rol de administrador:",
        roleError.message,
      );
      await supabase.auth.signOut({ scope: "local" });
      return {
        status: "error",
        message: "No se ha podido conceder el acceso de admin.",
      };
    }
  }

  redirect("/equipos");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
