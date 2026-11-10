"use client";

import { ArrowDown, ArrowUp, CornerDownRight, Radio } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SlotStatus } from "@/lib/app/agenda";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type QueueSlot = {
  id: string;
  status: SlotStatus;
  team: { name: string; number: number | null };
  time: string | null;
};

/**
 * Cola de la sala: el jurado ve todos los turnos, entra en cualquiera (también
 * en uno saltado o ya hecho) y cambia el orden sobre la marcha.
 */
export function RoomQueue({
  room,
  slots,
  currentId,
}: {
  room: string;
  slots: QueueSlot[];
  currentId: string;
}) {
  const t = useTranslations("roomQueue");
  const tStatus = useTranslations("agenda");
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [pending, startTransition] = useTransition();
  const liveIndex = slots.findIndex((slot) => slot.status === "live");
  const currentIndex = slots.findIndex((slot) => slot.id === currentId);
  // "A continuación" = justo detrás del que expone (o del seleccionado).
  const anchor = liveIndex >= 0 ? liveIndex : currentIndex;

  function move(id: string, index: number) {
    startTransition(async () => {
      const { error } = await supabase.rpc("move_slot", { target_slot: id, new_index: index });
      if (error) {
        toast.error(t("moveError"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <section aria-labelledby="room-queue-title" className="space-y-2">
      <h2 className="font-display text-lg" id="room-queue-title">
        {t("title")}
      </h2>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <ol className="space-y-1.5">
        {slots.map((slot, index) => {
          const selected = slot.id === currentId;
          const nextIndex = anchor < index ? anchor + 1 : anchor;
          return (
            <li
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2 py-1.5 text-sm",
                selected ? "border-primary bg-primary/10" : "border-border",
                slot.status === "live" && !selected && "border-destructive",
              )}
              key={slot.id}
            >
              <Link
                aria-current={selected ? "true" : undefined}
                className="min-w-0 flex-1 truncate font-semibold hover:underline"
                href={`/sala?room=${encodeURIComponent(room)}&slot=${slot.id}`}
              >
                {slot.status === "live" ? (
                  <Radio aria-hidden="true" className="mr-1 inline size-3.5 text-destructive" />
                ) : null}
                {slot.team.number ? `#${slot.team.number} · ` : ""}
                {slot.team.name}
              </Link>
              <span
                className={cn(
                  "shrink-0 text-xs text-muted-foreground",
                  slot.status === "skipped" && "font-semibold text-amber-700 dark:text-orange-400",
                )}
              >
                {slot.time ? `${slot.time} · ` : ""}
                {tStatus(`status.${slot.status}`)}
              </span>
              {slot.status !== "live" && anchor >= 0 && index !== anchor + 1 && index !== anchor ? (
                <Button
                  aria-label={t("putNext", { name: slot.team.name })}
                  className="size-8"
                  disabled={pending}
                  onClick={() => move(slot.id, nextIndex)}
                  size="icon"
                  title={t("putNext", { name: slot.team.name })}
                  variant="ghost"
                >
                  <CornerDownRight className="size-4" />
                </Button>
              ) : null}
              <Button
                aria-label={t("up", { name: slot.team.name })}
                className="size-8"
                disabled={pending || index === 0}
                onClick={() => move(slot.id, index - 1)}
                size="icon"
                variant="ghost"
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                aria-label={t("down", { name: slot.team.name })}
                className="size-8"
                disabled={pending || index === slots.length - 1}
                onClick={() => move(slot.id, index + 1)}
                size="icon"
                variant="ghost"
              >
                <ArrowDown className="size-4" />
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
