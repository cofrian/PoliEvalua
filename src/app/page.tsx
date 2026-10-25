import Image from "next/image";
import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  Bell,
  BookOpenCheck,
  CalendarClock,
  ClipboardCheck,
  GraduationCap,
  Languages,
  Mic,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/app/locale-switcher";
import { CONTACT_EMAIL, FEEDBACK_URL, Github, PoliBrand, PoliWordmark, REPO_URL } from "@/components/brand/poli-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

const FEATURES = [
  ["rubric", ClipboardCheck],
  ["live", MonitorPlay],
  ["peer", UsersRound],
  ["recording", Mic],
  ["agenda", CalendarClock],
  ["assistant", Sparkles],
  ["notices", Bell],
  ["languages", Languages],
  ["access", Accessibility],
  ["privacy", ShieldCheck],
] as const;

const SHOWCASE = [
  ["evaluate", "evaluar"],
  ["results", "resultados"],
  ["room", "sala"],
  ["projector", "proyector"],
] as const;

export default async function Home() {
  const t = await getTranslations("home");
  const modes = (
    [
      ["hackathon", Users],
      ["class", GraduationCap],
      ["awards", Trophy],
      ["project", BookOpenCheck],
    ] as const
  ).map(([key, icon]) => ({ icon, title: t(`modes.${key}.title`), description: t(`modes.${key}.description`) }));

  return (
    <main className="min-h-svh bg-background text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <PoliBrand />
          <nav aria-label={t("navLabel")} className="hidden items-center gap-6 text-sm font-semibold md:flex">
            <a className="hover:underline" href="#funciones">{t("navFeatures")}</a>
            <a className="hover:underline" href="#demo">{t("navDemo")}</a>
            <a className="hover:underline" href="#codigo-abierto">{t("navOpenSource")}</a>
          </nav>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <Button asChild className="hidden h-10 px-5 sm:inline-flex">
              <Link href="/login">{t("login")}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Portada */}
      <section className="relative overflow-hidden border-b border-border bg-upv-900 text-white">
        <div aria-hidden="true" className="absolute -right-24 -top-24 size-96 rounded-full bg-upv-yellow/20 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-32 left-1/3 size-96 rounded-full bg-upv-blue/20 blur-3xl" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8 lg:py-24">
          <div>
            <a
              className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/15"
              href={REPO_URL}
              rel="noreferrer"
              target="_blank"
            >
              <Github aria-hidden="true" className="size-3.5" />
              {t("badge")}
            </a>
            <h1 className="mt-6 font-heading text-4xl font-bold leading-[1.08] text-balance sm:text-5xl xl:text-[3.5rem]">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/85 sm:text-lg">{t("lead")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 bg-upv-yellow px-6 font-semibold text-upv-ink hover:bg-upv-yellow/90">
                <Link href="/registro">
                  {t("createSpace")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild className="h-12 border-white/55 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white" variant="outline">
                <a href="#demo">{t("watchDemo")}</a>
              </Button>
            </div>
            <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-white/15 pt-6">
              {(["stat1", "stat2", "stat3"] as const).map((key) => (
                <div key={key}>
                  <dt className="text-xs text-white/75">{t(`${key}.label`)}</dt>
                  <dd className="font-heading text-2xl font-bold">{t(`${key}.value`)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/15 bg-card shadow-2xl shadow-black/40">
            <div aria-hidden="true" className="flex gap-1.5 border-b border-border bg-muted px-3 py-2">
              <span className="size-2.5 rounded-full bg-upv-red/70" />
              <span className="size-2.5 rounded-full bg-upv-yellow" />
              <span className="size-2.5 rounded-full bg-leaf-500/70" />
            </div>
            <Image alt={t("heroAlt")} height={1000} priority sizes="(min-width: 1024px) 50vw, 100vw" src="/showcase/evaluar.webp" width={1600} />
          </div>
        </div>
      </section>

      {/* Funciones */}
      <section className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24 lg:px-8" id="funciones">
        <div className="max-w-3xl">
          <p className="font-heading text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">{t("featuresKicker")}</p>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t("featuresTitle")}</h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">{t("featuresLead")}</p>
        </div>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map(([key, Icon]) => (
            <article className="rounded-xl border border-border bg-card p-5" key={key}>
              <span className="mb-4 flex size-10 items-center justify-center rounded-lg bg-upv-yellow/30 text-upv-900 dark:bg-upv-yellow/15 dark:text-upv-yellow">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="font-heading font-semibold">{t(`features.${key}.title`)}</h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{t(`features.${key}.text`)}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Capturas */}
      <section className="border-y border-border bg-muted dark:bg-card/40">
        <div className="mx-auto w-full max-w-7xl space-y-20 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          {SHOWCASE.map(([key, image], index) => (
            <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14" key={key}>
              <div className={index % 2 ? "lg:order-2" : undefined}>
                <p className="font-heading text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">{t(`showcase.${key}.kicker`)}</p>
                <h3 className="mt-3 font-heading text-2xl font-bold sm:text-3xl">{t(`showcase.${key}.title`)}</h3>
                <p className="mt-4 leading-7 text-muted-foreground">{t(`showcase.${key}.text`)}</p>
              </div>
              <Image
                alt={t(`showcase.${key}.title`)}
                className="rounded-xl border border-border shadow-xl"
                height={1000}
                sizes="(min-width: 1024px) 50vw, 100vw"
                src={`/showcase/${image}.webp`}
                width={1600}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Vídeo */}
      <section className="mx-auto w-full max-w-5xl scroll-mt-20 px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8" id="demo">
        <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t("demoTitle")}</h2>
        <p className="mx-auto mt-4 max-w-2xl leading-7 text-muted-foreground">{t("demoLead")}</p>
        <video
          aria-label={t("demoTitle")}
          className="mt-10 w-full rounded-xl border border-border shadow-2xl"
          controls
          playsInline
          poster="/showcase/promo-poster.webp"
          preload="none"
        >
          <source src="/showcase/promo.mp4" type="video/mp4" />
        </video>
      </section>

      {/* Cómo funciona */}
      <section className="border-t border-border bg-card">
        <div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
          <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t("stepsTitle")}</h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {(["one", "two", "three"] as const).map((key, index) => (
              <li className="rounded-xl border border-border p-6" key={key}>
                <span className="font-heading text-4xl font-bold text-upv-300 dark:text-upv-500">0{index + 1}</span>
                <h3 className="mt-3 font-heading text-lg font-semibold">{t(`steps.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{t(`steps.${key}.text`)}</p>
              </li>
            ))}
          </ol>
          <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {modes.map(({ icon: Icon, title, description }) => (
              <article className="bg-card p-6" key={title}>
                <Icon aria-hidden="true" className="mb-4 size-5 text-upv-700 dark:text-upv-blue" />
                <h3 className="font-heading font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Código abierto */}
      <section className="scroll-mt-20 bg-upv-900 text-white" id="codigo-abierto">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:px-8">
          <div>
            <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">{t("openTitle")}</h2>
            <p className="mt-4 leading-7 text-white/85">{t("openLead")}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 bg-white px-6 font-semibold text-upv-ink hover:bg-white/90">
                <a href={REPO_URL} rel="noreferrer" target="_blank">
                  <Github aria-hidden="true" />
                  {t("openRepo")}
                </a>
              </Button>
              <Button asChild className="h-12 border-white/55 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white" variant="outline">
                <a href={`${REPO_URL}/blob/main/CONTRIBUTING.md`} rel="noreferrer" target="_blank">{t("openContribute")}</a>
              </Button>
            </div>
          </div>
          <ul className="grid gap-3 self-center sm:grid-cols-2">
            {(["license", "stack", "selfHost", "free"] as const).map((key) => (
              <li className="rounded-xl border border-white/15 bg-white/5 p-5" key={key}>
                <p className="font-heading font-semibold">{t(`open.${key}.title`)}</p>
                <p className="mt-1 text-sm leading-6 text-white/80">{t(`open.${key}.text`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div>
            <PoliWordmark className="text-lg" />
            <p className="mt-1 max-w-xl text-muted-foreground">{t("disclaimer")}</p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 font-semibold">
            <a className="hover:underline" href={REPO_URL} rel="noreferrer" target="_blank">GitHub</a>
            <a className="hover:underline" href={`${REPO_URL}/blob/main/LICENSE`} rel="noreferrer" target="_blank">{t("footerLicense")}</a>
            <a className="hover:underline" href={FEEDBACK_URL} rel="noreferrer" target="_blank">{t("footerFeedback")}</a>
            <a className="hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            <Link className="hover:underline" href="/login">{t("login")}</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
