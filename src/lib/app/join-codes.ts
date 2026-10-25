import "server-only";

import { randomInt } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Roles a los que se puede entrar con código. */
export const JOINABLE_ROLES = ["judge", "mentor", "student", "viewer"] as const;
export type JoinableRole = (typeof JOINABLE_ROLES)[number];

const ROLE_WORD: Record<JoinableRole, string> = {
  judge: "JURADO",
  mentor: "MENTOR",
  student: "PARTICIPANTE",
  viewer: "CONSULTA",
};

// Sin 0/O ni 1/I para que se pueda dictar en clase.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/** «teacher» y «reviewer» son nombres antiguos de jurado. */
export function asJoinableRole(role: string): JoinableRole | null {
  const normalized = role === "teacher" || role === "reviewer" ? "judge" : role;
  return (JOINABLE_ROLES as readonly string[]).includes(normalized) ? (normalized as JoinableRole) : null;
}

/** BASE-ROL-XXXX: legible, pero el sufijo aleatorio impide deducir el de otro rol. */
export function generateJoinCode(base: string, role: JoinableRole) {
  const suffix = Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  const prefix = base.trim().toUpperCase().slice(0, 40);
  return `${prefix}-${ROLE_WORD[role]}-${suffix}`;
}

/** Crea (o sustituye) el código de cada rol. Reintenta si choca con otro espacio. */
export async function setJoinCodes(admin: SupabaseClient, eventId: string, base: string, roles: string[]) {
  const wanted = [...new Set(roles.map(asJoinableRole).filter((role): role is JoinableRole => Boolean(role)))];
  for (const role of wanted) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { error } = await admin
        .from("event_join_codes")
        .upsert({ event_id: eventId, role, code: generateJoinCode(base, role), created_at: new Date().toISOString() });
      if (!error) break;
      if (error.code !== "23505") throw error;
    }
  }
}
