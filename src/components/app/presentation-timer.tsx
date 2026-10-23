"use client";

import { Pause, Play, RotateCcw, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PRESETS = [5, 10, 15, 20];

/**
 * Cronómetro de la exposición: cuenta atrás que se pone en ámbar el último
 * minuto y en rojo al pasarse. Funciona sin agenda; cada jurado lleva el suyo.
 */
export function PresentationTimer({ defaultMinutes = 10 }: { defaultMinutes?: number }) {
  const t = useTranslations("timer");
  const [minutes, setMinutes] = useState(defaultMinutes);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const total = elapsed + (startedAt === null ? 0 : now - startedAt);
  const left = minutes * 60_000 - total;
  const over = left < 0;
  const seconds = Math.floor(Math.abs(left) / 1000);
  const label = `${over ? "+" : ""}${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

  function toggle() {
    if (startedAt === null) {
      const at = Date.now();
      setNow(at);
      setStartedAt(at);
    } else {
      setElapsed(total);
      setStartedAt(null);
    }
  }

  return (
    <div
      aria-label={t("title")}
      className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3 dark:bg-card"
      role="group"
    >
      <Timer aria-hidden="true" className="size-5 text-muted-foreground" />
      <span
        aria-label={t("left")}
        aria-live="off"
        className={cn(
          "min-w-20 font-mono text-3xl font-bold tabular-nums",
          over ? "text-destructive" : left <= 60_000 ? "text-orange-500" : "text-foreground",
        )}
        role="timer"
      >
        {label}
      </span>
      <Button onClick={toggle} type="button" variant={startedAt === null ? "default" : "outline"}>
        {startedAt === null ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        {startedAt === null ? (total ? t("resume") : t("start")) : t("pause")}
      </Button>
      <Button
        aria-label={t("reset")}
        onClick={() => {
          setElapsed(0);
          setStartedAt(null);
        }}
        size="icon"
        type="button"
        variant="ghost"
      >
        <RotateCcw aria-hidden="true" />
      </Button>
      <label className="ml-auto flex items-center gap-2 text-sm text-muted-foreground">
        {t("duration")}
        <select
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
          onChange={(event) => setMinutes(Number(event.target.value))}
          value={minutes}
        >
          {[...new Set([...PRESETS, defaultMinutes])].sort((a, b) => a - b).map((value) => (
            <option key={value} value={value}>
              {value} min
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
