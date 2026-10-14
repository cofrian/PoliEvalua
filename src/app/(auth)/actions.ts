"use server";

import { randomBytes, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { AuthActionState } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
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

// Sin contraseñas para el usuario: cada acceso válido genera una contraseña
// aleatoria de un solo uso en el servidor y abre la sesión con ella.
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
  const admin = createAdminClient();
  const asAdmin = isAdminCode(accessCode);

  if (!asAdmin) {
    const { data: event, error: eventError } = await admin
      .from("events")
      .select("id")
      .eq("signup_code", accessCode.toUpperCase())
      .eq("signup_open", true)
      .limit(1)
      .maybeSingle();

    if (eventError) {
      console.error("No se pudo validar el código:", eventError.message);
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
  }

  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });
  if (listError) {
    console.error("No se pudo buscar el usuario:", listError.message);
    return { status: "error", message: "No se ha podido entrar. Inténtalo de nuevo." };
  }

  const password = randomBytes(32).toString("base64url");
  const existing = list.users.find((user) => user.email?.toLowerCase() === email);
  let userId: string;

  if (existing) {
    const { data: profile } = await admin
      .from("profiles")
      .select("disabled")
      .eq("id", existing.id)
      .maybeSingle();

    if (profile?.disabled) {
      return { status: "error", message: "Cuenta desactivada, contacta con el admin." };
    }

    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
    });
    if (error) {
      return { status: "error", message: "No se ha podido entrar. Inténtalo de nuevo." };
    }
    userId = existing.id;
  } else {
    const { data: created, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) {
      return { status: "error", message: "No se ha podido crear el acceso. Inténtalo de nuevo." };
    }
    userId = created.user.id;

    // El trigger crea el perfil como juez; aplicamos el rol elegido.
    if (!asAdmin && role !== "judge") {
      await admin.from("profiles").update({ role }).eq("id", userId);
    }
  }

  // Con el código de admin la cuenta pasa a ser admin. Si alguien vuelve a
  // entrar con el código normal, conserva el rol que ya tenía.
  if (asAdmin) {
    await admin.from("profiles").update({ role: "admin" }).eq("id", userId);
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (signInError) {
    return { status: "error", message: "No se ha podido entrar. Inténtalo de nuevo." };
  }

  redirect("/equipos");
}

export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
