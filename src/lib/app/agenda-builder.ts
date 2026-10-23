import "server-only";

import { adminMessage } from "@/lib/app/admin-messages";
import { logAudit } from "@/lib/app/audit";
import type { getSession } from "@/lib/app/session";

type Session = Awaited<ReturnType<typeof getSession>>;

export type AgendaInput = {
  rooms: string[];
  /** Hora de Valencia, «2026-11-05T09:30». */
  start: string;
  duration: number;
  gap: number;
  order: "number" | "random";
};

/** Convierte «2026-11-05T09:30» (hora de Valencia) a un instante UTC. */
function madridLocalToUtc(value: string) {
  const asUtc = new Date(`${value}:00Z`);
  if (Number.isNaN(asUtc.getTime())) return null;
  const madrid = new Date(asUtc.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const utc = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (madrid.getTime() - utc.getTime()));
}

/**
 * Genera la agenda completa: reparte los grupos entre las salas (por número o
 * al azar) y calcula la hora de cada turno. Sustituye la agenda anterior. La
 * usan el formulario de Admin → Agenda y el asistente.
 */
export async function buildAgenda(session: Session, input: AgendaInput) {
  const { supabase, user, event, words } = session;
  const start = madridLocalToUtc(input.start);
  if (!start) return { ok: false, message: await adminMessage("agendaStart") };
  const rooms = [...new Set(input.rooms.map((room) => room.trim()).filter(Boolean))].slice(0, 20);
  if (!rooms.length) return { ok: false, message: await adminMessage("agendaInvalid") };

  const { data: teams } = await supabase
    .from("teams")
    .select("id, number")
    .eq("event_id", event.id)
    .order("number");
  if (!teams?.length) return { ok: false, message: await adminMessage("agendaNoTeams", { units: words.unitsLower }) };

  const ordered = input.order === "random" ? [...teams].sort(() => Math.random() - 0.5) : teams;
  const step = (input.duration + input.gap) * 60_000;
  const rows = ordered.map((team, index) => {
    const position = Math.floor(index / rooms.length);
    return {
      event_id: event.id,
      team_id: team.id,
      room: rooms[index % rooms.length],
      position,
      starts_at: new Date(start.getTime() + position * step).toISOString(),
      duration_minutes: input.duration,
    };
  });

  const { error: deleteError } = await supabase.from("presentation_slots").delete().eq("event_id", event.id);
  if (deleteError) return { ok: false, message: await adminMessage("agendaReplaceFailed") };
  const { error } = await supabase.from("presentation_slots").insert(rows);
  if (error) return { ok: false, message: await adminMessage("agendaSaveFailed") };

  await logAudit(supabase, event.id, user.id, "generar_agenda", "presentation_slots", null, {
    rooms,
    slots: rows.length,
  });
  return { ok: true, message: await adminMessage("agendaCreated", { slots: rows.length, rooms: rooms.length }) };
}
