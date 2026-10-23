// Agenda de exposiciones: horas previstas que tienen en cuenta los retrasos
// reales de cada sala. Un turno no puede empezar antes de que acabe el
// anterior, así que el retraso se arrastra hacia los siguientes.

export type SlotStatus = "pending" | "live" | "done" | "skipped";

export type AgendaSlot = {
  id: string;
  team_id: string;
  room: string;
  position: number;
  starts_at: string | null;
  duration_minutes: number;
  status: SlotStatus;
  started_at: string | null;
  ended_at: string | null;
};

export type ScheduledSlot<T extends AgendaSlot = AgendaSlot> = T & {
  /** Hora estimada de inicio (null si la sala no tiene horario). */
  expectedStart: Date | null;
  /** Minutos de retraso respecto a lo planificado (0 si va en hora o adelantado). */
  delayMinutes: number;
};

const MINUTE = 60_000;

export function scheduleRoom<T extends AgendaSlot>(slots: T[], now = new Date()): ScheduledSlot<T>[] {
  const ordered = [...slots].sort((a, b) => a.position - b.position);
  let cursor: number | null = null;

  return ordered.map((slot) => {
    const planned = slot.starts_at ? new Date(slot.starts_at).getTime() : null;
    let start: number | null;

    if (slot.started_at) {
      start = new Date(slot.started_at).getTime();
    } else if (planned === null && cursor === null) {
      start = null;
    } else {
      start = Math.max(planned ?? 0, cursor ?? 0);
      // Lo pendiente nunca está previsto en el pasado.
      if (slot.status === "pending") start = Math.max(start, now.getTime());
    }

    if (slot.status === "skipped") {
      return { ...slot, expectedStart: start === null ? null : new Date(start), delayMinutes: 0 };
    }

    if (start !== null) {
      const end = slot.ended_at
        ? new Date(slot.ended_at).getTime()
        : Math.max(start + slot.duration_minutes * MINUTE, slot.status === "live" ? now.getTime() : 0);
      cursor = end;
    }

    const delayMinutes =
      planned !== null && start !== null ? Math.max(0, Math.round((start - planned) / MINUTE)) : 0;
    return { ...slot, expectedStart: start === null ? null : new Date(start), delayMinutes };
  });
}

/** Agrupa por sala respetando el orden en que aparecen. */
export function byRoom<T extends AgendaSlot>(slots: T[]) {
  const rooms = new Map<string, T[]>();
  for (const slot of slots) rooms.set(slot.room, [...(rooms.get(slot.room) ?? []), slot]);
  return [...rooms.entries()];
}

export const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Madrid",
});

