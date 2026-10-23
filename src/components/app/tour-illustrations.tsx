import { CalendarClock, Check, Code2, Link2, Mic, Sparkles, Star, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";

// Escenas animadas del tutorial: imitan la app con piezas sencillas (sin
// imágenes) para que carguen al instante y se vean bien en claro y oscuro.

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="relative mx-auto flex h-52 w-full max-w-sm items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-upv-900 to-[#2b2f30] sm:h-60">
      <div aria-hidden="true" className="tour-spin-slow absolute -top-24 -right-24 size-64 rounded-full border-[28px] border-upv-yellow/15" />
      <div aria-hidden="true" className="tour-spin-slow absolute -bottom-28 -left-20 size-56 rounded-full border-[24px] border-upv-blue/15 [animation-direction:reverse]" />
      <div className="relative w-full px-6">{children}</div>
    </div>
  );
}

function Card({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rounded-xl bg-white p-3 text-[11px] text-upv-ink shadow-lg dark:bg-card dark:text-foreground ${className}`} style={style}>
      {children}
    </div>
  );
}

/** Bienvenida: el logo de la app con tarjetas que flotan alrededor. */
export function WelcomeScene() {
  const t = useTranslations("tour.scene");
  return (
    <Stage>
      <div className="relative mx-auto h-40 w-56">
        <Card className="tour-float absolute top-2 left-0 w-28 [--tour-rotate:-6deg]" style={delay(0)}>
          <p className="font-bold">{t("rubric")}</p>
          <div className="mt-1.5 h-1.5 rounded-full bg-muted">
            <div className="tour-fill h-full rounded-full bg-leaf-500 [--tour-width:80%]" style={delay(300)} />
          </div>
        </Card>
        <Card className="tour-float absolute right-0 bottom-2 w-28 [--tour-rotate:5deg]" style={delay(600)}>
          <p className="flex items-center gap-1 font-bold">
            <Star className="size-3 text-upv-yellow" /> 4,5 / 5
          </p>
          <p className="text-muted-foreground">{t("group", { n: "Aurora" })}</p>
        </Card>
        <div className="tour-pop absolute inset-0 m-auto flex size-20 items-center justify-center rounded-3xl bg-upv-yellow font-display text-3xl text-upv-ink shadow-xl tour-glow" style={delay(150)}>
          E
        </div>
      </div>
    </Stage>
  );
}

/** Rúbrica: criterios con su peso que se van llenando hasta el 100 %. */
export function RubricScene() {
  const t = useTranslations("tour.scene");
  const rows = [
    [t("criterion1"), 40],
    [t("criterion2"), 40],
    [t("criterion3"), 20],
  ] as const;
  return (
    <Stage>
      <Card className="tour-rise mx-auto w-64 space-y-2.5">
        {rows.map(([label, weight], index) => (
          <div className="tour-rise" key={label} style={delay(200 + index * 220)}>
            <div className="flex justify-between font-semibold">
              <span>{label}</span>
              <span>{weight} %</span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-muted">
              <div
                className="tour-fill h-full rounded-full bg-upv-blue"
                style={{ ...delay(400 + index * 220), ["--tour-width" as string]: `${weight * 2.5}%` }}
              />
            </div>
          </div>
        ))}
        <p className="tour-pop flex items-center justify-end gap-1 font-bold text-leaf-500" style={delay(1300)}>
          <Check className="size-3.5" /> 100 %
        </p>
      </Card>
    </Stage>
  );
}

/** Grupos e invitaciones: tarjetas que aparecen y avatares que se unen. */
export function PeopleScene() {
  const t = useTranslations("tour.scene");
  const groups = ["Aurora", "Brisa", "Cierzo"].map((n) => t("group", { n }));
  const people = ["A", "L", "M", "P", "J"];
  return (
    <Stage>
      <div className="mx-auto w-64 space-y-2">
        {groups.map((name, index) => (
          <Card className="tour-rise flex items-center gap-2 py-2" key={name} style={delay(index * 200)}>
            <Users className="size-3.5 text-muted-foreground" />
            <span className="font-semibold">{name}</span>
          </Card>
        ))}
        <div className="flex justify-center -space-x-2 pt-2">
          {people.map((initial, index) => (
            <span
              className="tour-pop flex size-8 items-center justify-center rounded-full border-2 border-upv-900 bg-upv-blue text-xs font-bold text-upv-ink"
              key={initial}
              style={delay(800 + index * 120)}
            >
              {initial}
            </span>
          ))}
        </div>
      </div>
    </Stage>
  );
}

/** Evaluar: los botones del 1 al 5 y la nota que sube. */
export function ScoreScene() {
  const t = useTranslations("tour.scene");
  return (
    <Stage>
      <Card className="tour-rise mx-auto w-64">
        <p className="font-bold">1. {t("criterion1")}</p>
        <div className="mt-2 grid grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map((score) => (
            <span
              className={`flex h-8 items-center justify-center rounded-md border text-sm font-bold ${
                score === 4 ? "tour-pop border-upv-ink bg-upv-ink text-white" : "border-border"
              }`}
              key={score}
              style={score === 4 ? delay(700) : undefined}
            >
              {score}
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-end justify-between border-t border-border pt-2">
          <p className="font-display text-2xl leading-none">
            <span className="tour-pop inline-block" style={delay(1000)}>
              82
            </span>
            <span className="text-xs text-muted-foreground"> / 100</span>
          </p>
          <span className="tour-pop rounded-md bg-upv-ink px-2 py-1 text-[10px] font-bold text-white" style={delay(1200)}>
            {t("send")}
          </span>
        </div>
      </Card>
    </Stage>
  );
}

/** IA: una grabación que se convierte en resumen y preguntas para el jurado. */
export function AiScene() {
  const t = useTranslations("tour.scene");
  return (
    <Stage>
      <div className="mx-auto w-64 space-y-2">
        <Card className="tour-rise flex items-center gap-2">
          <span className="tour-glow flex size-7 items-center justify-center rounded-full bg-upv-red text-white">
            <Mic className="size-3.5" />
          </span>
          <span className="flex flex-1 items-end gap-0.5">
            {[6, 12, 8, 14, 5, 11, 9, 13, 7].map((height, index) => (
              <span className="tour-blink w-1 rounded-full bg-upv-blue" key={index} style={{ height, ...delay(index * 90) }} />
            ))}
          </span>
        </Card>
        <Card className="tour-rise ml-6" style={delay(500)}>
          <p className="flex items-center gap-1 font-bold">
            <Sparkles className="size-3 text-upv-yellow" /> {t("summary")}
          </p>
          <div className="mt-1.5 space-y-1">
            <div className="tour-fill h-1.5 rounded-full bg-muted-foreground/30 [--tour-width:95%]" style={delay(800)} />
            <div className="tour-fill h-1.5 rounded-full bg-muted-foreground/30 [--tour-width:70%]" style={delay(950)} />
          </div>
        </Card>
        <Card className="tour-rise ml-12 font-semibold" style={delay(1100)}>
          {t("question")}
        </Card>
      </div>
    </Stage>
  );
}

/** Agenda: turnos con la hora y el que está exponiendo ahora. */
export function AgendaScene() {
  const t = useTranslations("tour.scene");
  const slots = [
    ["09:00", t("group", { n: "Aurora" }), true],
    ["09:15", t("group", { n: "Brisa" }), false],
    ["09:30", t("group", { n: "Cierzo" }), false],
  ] as const;
  return (
    <Stage>
      <div className="mx-auto w-64 space-y-2">
        {slots.map(([time, name, live], index) => (
          <Card
            className={`tour-rise flex items-center gap-3 py-2 ${live ? "ring-2 ring-upv-red" : ""}`}
            key={name}
            style={delay(index * 220)}
          >
            <span className="font-mono font-bold">{time}</span>
            <span className="flex-1 font-semibold">{name}</span>
            {live ? <span className="tour-blink size-2 rounded-full bg-upv-red" /> : <CalendarClock className="size-3.5 text-muted-foreground" />}
          </Card>
        ))}
      </div>
    </Stage>
  );
}

/** Entregas del alumnado: enlaces que se añaden al grupo. */
export function DeliverablesScene() {
  const t = useTranslations("tour.scene");
  const links = [
    [Code2, t("repo"), "github.com/aurora"],
    [Link2, t("web"), "aurora.app"],
  ] as const;
  return (
    <Stage>
      <Card className="tour-rise mx-auto w-64 space-y-2">
        <p className="font-bold">{t("deliverables")} · {t("group", { n: "Aurora" })}</p>
        {links.map(([Icon, label, url], index) => (
          <div className="tour-pop flex items-center gap-2 rounded-lg border border-border px-2 py-1.5" key={label} style={delay(400 + index * 350)}>
            <Icon className="size-3.5" />
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold">{label}</span>
            <span className="truncate text-muted-foreground">{url}</span>
          </div>
        ))}
      </Card>
    </Stage>
  );
}

/** Final: un check grande que celebra que ya está todo listo. */
export function DoneScene() {
  return (
    <Stage>
      <div className="tour-pop tour-glow mx-auto flex size-24 items-center justify-center rounded-full bg-leaf-500 text-white shadow-xl">
        <Check className="size-12" strokeWidth={3} />
      </div>
    </Stage>
  );
}
