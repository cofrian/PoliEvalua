import type { SupabaseClient } from "@supabase/supabase-js";

// Registro de auditoría. Nunca bloquea la acción si falla.
export async function logAudit(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  entity: string,
  entityId: string | null,
  payload?: Record<string, unknown>,
) {
  const { error } = await supabase.from("audit_log").insert({
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    payload: payload ?? null,
  });
  if (error) console.error("No se pudo registrar la auditoría:", error.message);
}
