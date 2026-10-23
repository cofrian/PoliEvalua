"use server";

import { createClient } from "@/lib/supabase/server";

const KINDS = new Set(["admin", "judge", "student", "viewer"]);

/**
 * Apunta en la cuenta que ya se ha visto el tutorial de ese perfil, para que no
 * vuelva a salir solo (tampoco en otro dispositivo). Se guarda en los metadatos
 * de Supabase Auth: no hace falta tabla.
 */
export async function markTourSeenAction(kind: string) {
  if (!KINDS.has(kind)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const seen = (user.user_metadata?.tour_seen ?? {}) as Record<string, boolean>;
  if (seen[kind]) return;
  await supabase.auth.updateUser({ data: { tour_seen: { ...seen, [kind]: true } } });
}
