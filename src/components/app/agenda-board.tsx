import { ArrowDown, ArrowUp, Radio } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import { ActionForm } from "@/components/app/action-form";
import { moveSlotAction } from "@/app/(app)/admin/actions";
import {
  byRoom,
  scheduleRoom,
  timeFormat,
  type AgendaSlot,
} from "@/lib/app/agenda";

export type BoardSlot = AgendaSlot & { team: { name: string; number: number | null } };

const statusStyles = {
  pending: "border-border",
  live: "border-destructive bg-destructive/5",
  done: "border-border text-muted-foreground",
  skipped: "border-border text-muted-foreground line-through",
} as const;

/**
 * Agenda por salas con la hora prevista (retrasos incluidos). Cada perfil ve
 * acciones distintas: la gestión reordena, el jurado entra en la sala.
 */
export function AgendaBoard({
  slots,
  canReorder = false,
  canRunRoom = false,
  highlightTeamId,
}: {
  slots: BoardSlot[];
  canReorder?: boolean;
  canRunRoom?: boolean;
  highlightTeamId?: string | null;
}) {
  const t = useTranslations("agenda");
  if (!slots.length) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {byRoom(slots).map(([room, roomSlots]) => {
        const scheduled = scheduleRoom(roomSlots);
        const delay = scheduled.find((slot) => slot.status === "pending")?.delayMinutes ?? 0;
        return (
          <section className="space-y-2" key={room}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-xl">{room}</h3>
              <div className="flex items-center gap-3 text-sm">
                {delay ? (
                  <span className="font-semibold text-amber-700 dark:text-orange-400">
                    {t("roomDelay", { minutes: delay })}
                  </span>
                ) : null}
                {canRunRoom ? (
                  <Link
                    className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 font-semibold text-primary-foreground"
                    href={`/sala?room=${encodeURIComponent(room)}`}
                  >
                    <Radio aria-hidden="true" className="size-4" /> {t("openRoom")}
                  </Link>
                ) : null}
              </div>
            </div>
            <ol className="space-y-2">
              {scheduled.map((slot, index) => (
                <li
                  className={`flex items-center gap-3 rounded-lg border bg-white p-3 text-sm dark:bg-card ${statusStyles[slot.status]} ${
                    highlightTeamId === slot.team_id ? "ring-2 ring-primary" : ""
                  }`}
                  key={slot.id}
                >
                  <span className="w-12 shrink-0 font-mono font-semibold">
                    {slot.expectedStart ? timeFormat.format(slot.expectedStart) : "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      #{slot.team.number} · {slot.team.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`status.${slot.status}`)} · {slot.duration_minutes} min
                      {slot.delayMinutes && slot.status === "pending" ? ` · ${t("plannedBefore", { time: timeFormat.format(new Date(slot.starts_at!)) })}` : ""}
                    </span>
                  </span>
                  {slot.status === "live" ? (
                    <span className="flex items-center gap-1 text-xs font-bold text-destructive">
                      <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-destructive" /> {t("live")}
                    </span>
                  ) : null}
                  {canReorder && slot.status === "pending" ? (
                    <span className="flex shrink-0 gap-1">
                      <ActionForm action={moveSlotAction}>
                        <input name="id" type="hidden" value={slot.id} />
                        <input name="direction" type="hidden" value="up" />
                        <button
                          aria-label={t("moveUp", { name: slot.team.name })}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                          disabled={index === 0}
                          type="submit"
                        >
                          <ArrowUp className="size-4" />
                        </button>
                      </ActionForm>
                      <ActionForm action={moveSlotAction}>
                        <input name="id" type="hidden" value={slot.id} />
                        <input name="direction" type="hidden" value="down" />
                        <button
                          aria-label={t("moveDown", { name: slot.team.name })}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                          disabled={index === scheduled.length - 1}
                          type="submit"
                        >
                          <ArrowDown className="size-4" />
                        </button>
                      </ActionForm>
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
