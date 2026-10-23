import Link from "next/link";
import { ArrowRight, BookOpenCheck, GraduationCap, Trophy, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { LocaleSwitcher } from "@/components/app/locale-switcher";
import { UpvBrand } from "@/components/brand/upv-brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const t = await getTranslations("home");
  const modes = (
    [
      ["hackathon", Users],
      ["class", GraduationCap],
      ["awards", Trophy],
      ["project", BookOpenCheck],
    ] as const
  ).map(([key, icon]) => ({
    icon,
    title: t(`modes.${key}.title`),
    description: t(`modes.${key}.description`),
  }));

  return (
    <main className="min-h-svh bg-muted text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <UpvBrand />
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
            <Button asChild className="hidden h-10 px-5 sm:inline-flex">
              <Link href="/login">{t("login")}</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-border bg-upv-900 text-white">
        <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-2/5 bg-upv-yellow [clip-path:polygon(34%_0,100%_0,100%_100%,0_100%)] lg:block" />
        <div aria-hidden="true" className="absolute bottom-0 right-[24%] hidden h-2/3 w-1/4 bg-upv-blue [clip-path:polygon(45%_0,100%_0,55%_100%,0_100%)] lg:block" />
        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[minmax(0,3fr)_minmax(260px,1fr)] lg:px-8 lg:py-28">
          <div>
            <p className="mb-4 font-heading text-sm font-semibold uppercase tracking-[0.12em] text-upv-blue">
              {t("kicker")}
            </p>
            <h1 className="max-w-4xl font-heading text-4xl font-bold leading-[1.08] text-balance sm:text-5xl lg:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/85 sm:text-lg">
              {t("lead")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild className="h-12 bg-upv-yellow px-6 font-semibold text-upv-ink hover:bg-upv-yellow/90">
                <Link href="/login">
                  {t("access")}
                  <ArrowRight aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild className="h-12 border-white/55 bg-transparent px-6 text-white hover:bg-white/10 hover:text-white" variant="outline">
                <Link href="/registro">{t("createSpace")}</Link>
              </Button>
            </div>
          </div>
          <div className="hidden self-end lg:block">
            <p className="max-w-xs font-heading text-xl font-semibold leading-8 text-upv-ink">
              {t("aside")}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-3xl">
          <p className="font-heading text-sm font-semibold uppercase tracking-[0.12em] text-upv-500 dark:text-upv-300">
            {t("kicker2")}
          </p>
          <h2 className="mt-3 font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title2")}
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground">
            {t("lead2")}
          </p>
        </div>
        <div className="mt-9 grid gap-px overflow-hidden rounded-xl border border-border bg-line sm:grid-cols-2 lg:grid-cols-4 dark:bg-[#383C3D]">
          {modes.map(({ icon: Icon, title, description }) => (
            <article className="bg-white p-6 dark:bg-card" key={title}>
              <span className="mb-5 flex size-11 items-center justify-center rounded-md bg-upv-blue/25 text-upv-900 dark:bg-upv-blue/20 dark:text-upv-blue">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <h3 className="font-heading text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="border-t border-border bg-upv-900 text-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-7 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p className="font-heading font-semibold">{t("footer")}</p>
          <p className="text-white/70">{t("footerTags")}</p>
        </div>
      </footer>
    </main>
  );
}
