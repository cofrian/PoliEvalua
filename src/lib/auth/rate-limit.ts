import "server-only";

import { headers } from "next/headers";

import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;
export type AttemptKind =
  | "assistant"
  | "transcription"
  | "bad_code"
  | "bad_password";

// Cuántos intentos se permiten en cada ventana antes de bloquear.
export const LIMITS: Record<AttemptKind, { max: number; minutes: number }> = {
  assistant: { max: 20, minutes: 10 }, // protege la cuota del proveedor de IA
  transcription: { max: 10, minutes: 60 }, // audios procesados por usuario e IP
  bad_code: { max: 10, minutes: 15 }, // códigos de evento incorrectos por IP
  bad_password: { max: 5, minutes: 15 }, // contraseñas incorrectas por email o IP
};

export async function clientIp() {
  const list = await headers();
  return (
    list.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    list.get("x-real-ip") ||
    "desconocida"
  );
}

// true si alguna de las claves ya ha agotado sus intentos.
export async function isBlocked(
  admin: Admin,
  kind: AttemptKind,
  keys: string[],
) {
  const { max, minutes } = LIMITS[kind];
  const since = new Date(Date.now() - minutes * 60_000).toISOString();

  for (const key of keys) {
    const { count, error } = await admin
      .from("auth_attempts")
      .select("id", { count: "exact", head: true })
      .eq("key", key)
      .eq("kind", kind)
      .gte("created_at", since);
    // Si no se puede comprobar, se bloquea: mejor un falso bloqueo que dejar pasar.
    if (error || (count ?? 0) >= max) return true;
  }
  return false;
}

export async function recordAttempt(
  admin: Admin,
  kind: AttemptKind,
  keys: string[],
) {
  const { error } = await admin
    .from("auth_attempts")
    .insert(keys.map((key) => ({ key, kind })));
  return !error;
}

export async function clearAttempts(
  admin: Admin,
  kind: AttemptKind,
  keys: string[],
) {
  const { error } = await admin
    .from("auth_attempts")
    .delete()
    .eq("kind", kind)
    .in("key", keys);
  return !error;
}
