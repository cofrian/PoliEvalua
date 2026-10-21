import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { BoardSlot } from "@/components/app/agenda-board";

type TeamRelation = { name: string; number: number | null };

/** Turnos del espacio con el nombre del grupo, en orden de sala y posición. */
export async function loadAgenda(supabase: SupabaseClient, eventId: string): Promise<BoardSlot[]> {
  const { data } = await supabase
    .from("presentation_slots")
    .select(
      "id, team_id, room, position, starts_at, duration_minutes, status, started_at, ended_at, team:teams(name, number)",
    )
    .eq("event_id", eventId)
    .order("room")
    .order("position");

  return (data ?? []).map((slot) => {
    const relation = slot.team as unknown as TeamRelation | TeamRelation[] | null;
    const team = (Array.isArray(relation) ? relation[0] : relation) ?? { name: "Grupo", number: null };
    return { ...slot, team } as BoardSlot;
  });
}
