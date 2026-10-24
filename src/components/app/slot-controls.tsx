"use client";

import { Pause, Play, SkipForward, Square } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { SlotStatus } from "@/lib/app/agenda";
import { createClient } from "@/lib/supabase/client";

function format(seconds: number) {
  const sign = seconds < 0 ? "-" : "";
  const value = Math.abs(seconds);
  return `${sign}${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

/**
 * Cronómetro y estado del turno en la sala. Avisa al quedar 2 minutos y al
 * pasarse de tiempo; el estado se guarda en el servidor para que la agenda y
 * el alumnado lo vean en directo.
 */
export function SlotControls({
  slotId,
  status,
  startedAt,
  durationMinutes,
}: {
  slotId: string;
  status: SlotStatus;
  startedAt: string | null;
  durationMinutes: number;
}) {
  const router = useRouter();
  const t = useTranslations("slot");
  const supabase = useMemo(() => createClient(), []);
  const [pending, startTransition] = useTransition();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (status !== "live") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status]);

  const elapsed = status === "live" && startedAt ? Math.floor((now - new Date(startedAt).getTime()) / 1000) : 0;
  const remaining = durationMinutes * 60 - elapsed;
  const tone =
    status !== "live"
      ? "text-muted-foreground"
      : remaining < 0
        ? "text-destructive"
        : remaining <= 120
          ? "text-amber-700 dark:text-orange-400"
          : "text-foreground";

  function setStatus(next: SlotStatus) {
    startTransition(async () => {
      const { error } = await supabase.rpc("set_slot_status", { target_slot: slotId, next_status: next });
      if (error) {
        toast.error(t("updateError"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div aria-live="polite" className={`font-mono text-5xl font-bold tabular-nums ${tone}`} role="timer">
        {status === "live" ? format(remaining) : format(durationMinutes * 60)}
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "pending" || status === "skipped" ? (
          <Button className="h-11 px-5 font-bold" disabled={pending} onClick={() => setStatus("live")}>
            <Play className="size-4" /> {t("start")}
          </Button>
        ) : null}
        {status === "live" ? (
          <>
            <Button className="h-11 px-5 font-bold" disabled={pending} onClick={() => setStatus("done")}>
              <Square className="size-4" /> {t("finish")}
            </Button>
            <Button className="h-11" disabled={pending} onClick={() => setStatus("pending")} variant="outline">
              <Pause className="size-4" /> {t("reset")}
            </Button>
          </>
        ) : null}
        {status === "pending" ? (
          <Button className="h-11" disabled={pending} onClick={() => setStatus("skipped")} variant="ghost">
            <SkipForward className="size-4" /> {t("skip")}
          </Button>
        ) : null}
      </div>
      {status === "live" && remaining <= 120 && remaining >= 0 ? (
        <p className="w-full text-sm font-semibold text-amber-700 dark:text-orange-400" role="status">
          {t("twoMinutes")}
        </p>
      ) : null}
      {status === "live" && remaining < 0 ? (
        <p className="w-full text-sm font-semibold text-destructive" role="status">
          {t("timeUp")}
        </p>
      ) : null}
    </div>
  );
}
