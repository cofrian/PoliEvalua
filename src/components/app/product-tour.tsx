"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";

import { markTourSeenAction } from "@/app/(app)/tour-actions";
import {
  AgendaScene,
  AiScene,
  DeliverablesScene,
  DoneScene,
  PeopleScene,
  RubricScene,
  ScoreScene,
  WelcomeScene,
} from "@/components/app/tour-illustrations";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type TourKind = "admin" | "judge" | "student" | "viewer";

export const tourCookie = (kind: TourKind) => `tour_seen_${kind}`;

/** Evento con el que el menú de usuario vuelve a abrir el tutorial. */
export const OPEN_TOUR_EVENT = "evalua:open-tour";

const SLIDES: Record<TourKind, { key: string; Scene: ComponentType }[]> = {
  admin: [
    { key: "welcome", Scene: WelcomeScene },
    { key: "rubric", Scene: RubricScene },
    { key: "people", Scene: PeopleScene },
    { key: "live", Scene: ScoreScene },
    { key: "ai", Scene: AiScene },
    { key: "done", Scene: DoneScene },
  ],
  judge: [
    { key: "welcome", Scene: WelcomeScene },
    { key: "groups", Scene: PeopleScene },
    { key: "score", Scene: ScoreScene },
    { key: "ai", Scene: AiScene },
    { key: "done", Scene: DoneScene },
  ],
  student: [
    { key: "welcome", Scene: WelcomeScene },
    { key: "deliverables", Scene: DeliverablesScene },
    { key: "rubric", Scene: RubricScene },
    { key: "agenda", Scene: AgendaScene },
    { key: "done", Scene: DoneScene },
  ],
  viewer: [
    { key: "welcome", Scene: WelcomeScene },
    { key: "groups", Scene: PeopleScene },
    { key: "agenda", Scene: AgendaScene },
    { key: "done", Scene: DoneScene },
  ],
};

async function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = (await import("canvas-confetti")).default;
  const colors = ["#FFD100", "#59CBE8", "#E8432E", "#3F4444"];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.65 }, colors, zIndex: 100 });
  setTimeout(() => confetti({ particleCount: 50, spread: 110, origin: { y: 0.6 }, colors, zIndex: 100 }), 250);
}

/**
 * Tutorial de bienvenida con ilustraciones animadas, distinto para cada
 * perfil. Sale solo la primera vez y se puede volver a ver desde el menú.
 */
export function ProductTour({
  kind,
  autoOpen,
  spaceName,
  units,
  evaluator,
}: {
  kind: TourKind;
  autoOpen: boolean;
  spaceName: string;
  units: string;
  evaluator: string;
}) {
  const t = useTranslations("tour");
  const slides = SLIDES[kind];
  const [open, setOpen] = useState(autoOpen);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const primary = useRef<HTMLButtonElement>(null);
  const last = index === slides.length - 1;

  const close = useCallback(() => {
    setOpen(false);
    // La cookie vale al instante (aunque se recargue enseguida); la cuenta, en
    // cualquier dispositivo.
    document.cookie = `${tourCookie(kind)}=1; max-age=31536000; path=/; samesite=lax`;
    void markTourSeenAction(kind);
  }, [kind]);

  const go = useCallback(
    (next: number) => {
      if (next < 0 || next >= slides.length) return;
      setDirection(next > index ? 1 : -1);
      setIndex(next);
    },
    [index, slides.length],
  );

  useEffect(() => {
    const reopen = () => {
      setIndex(0);
      setDirection(1);
      setOpen(true);
    };
    window.addEventListener(OPEN_TOUR_EVENT, reopen);
    return () => window.removeEventListener(OPEN_TOUR_EVENT, reopen);
  }, []);

  useEffect(() => {
    if (!open) return;
    primary.current?.focus();
    if (last) void celebrate();
  }, [open, index, last]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") go(index + 1);
      if (event.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, index, go, close]);

  if (!open) return null;
  const { key, Scene } = slides[index];
  const values = { space: spaceName, units, evaluator };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-0 backdrop-blur-sm animate-in fade-in duration-300 sm:items-center sm:p-4">
      <div
        aria-labelledby="tour-title"
        aria-modal="true"
        className="relative w-full max-w-lg overflow-hidden rounded-t-3xl bg-card shadow-2xl animate-in slide-in-from-bottom-8 duration-500 sm:rounded-3xl"
        role="dialog"
      >
        <div className="flex items-center gap-3 px-5 pt-5">
          <div aria-hidden="true" className="flex flex-1 gap-1.5">
            {slides.map((slide, position) => (
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" key={slide.key}>
                <span
                  className={cn(
                    "block h-full rounded-full bg-upv-yellow transition-all duration-500",
                    position <= index ? "w-full" : "w-0",
                  )}
                />
              </span>
            ))}
          </div>
          <button
            aria-label={t("skip")}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div
          className={cn(
            "px-5 pt-5 pb-2 animate-in fade-in duration-500",
            direction === 1 ? "slide-in-from-right-10" : "slide-in-from-left-10",
          )}
          key={`${kind}-${key}`}
        >
          <Scene />
          <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            {t("step", { current: index + 1, total: slides.length })}
          </p>
          <h2 className="mt-1 font-display text-2xl leading-tight tracking-tight text-balance" id="tour-title">
            {t(`${kind}.${key}.title`, values)}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`${kind}.${key}.text`, values)}</p>
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-5">
          {index > 0 ? (
            <Button onClick={() => go(index - 1)} type="button" variant="ghost">
              <ArrowLeft aria-hidden="true" /> {t("back")}
            </Button>
          ) : (
            <Button onClick={close} type="button" variant="ghost">
              {t("skip")}
            </Button>
          )}
          <Button className="h-11 px-6 font-bold" onClick={() => (last ? close() : go(index + 1))} ref={primary} type="button">
            {last ? t("start") : t("next")} {last ? null : <ArrowRight aria-hidden="true" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
