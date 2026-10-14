import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

const sponsors = [
  {
    src: "/brand/sponsors/sigma-light.svg",
    alt: "Sigma Data Club",
    width: 134,
    height: 40,
    className: "h-7 w-auto dark:hidden",
  },
  {
    src: "/brand/sponsors/sigma-dark.svg",
    alt: "Sigma Data Club",
    width: 134,
    height: 40,
    className: "hidden h-7 w-auto dark:block",
  },
  {
    src: "/brand/sponsors/etsinf.svg",
    alt: "Escola Tècnica Superior d'Enginyeria Informàtica",
    width: 116,
    height: 40,
    className: "h-7 w-auto dark:rounded-sm dark:bg-white dark:px-1",
  },
  {
    src: "/brand/sponsors/ajuntament-color.svg",
    alt: "Ajuntament de València",
    width: 132,
    height: 40,
    className: "h-8 w-auto dark:rounded-sm dark:bg-white dark:px-1",
  },
  {
    src: "/brand/sponsors/generacion-espontanea.png",
    alt: "Generación Espontánea",
    width: 130,
    height: 40,
    className:
      "h-7 w-auto object-contain dark:rounded-sm dark:bg-white dark:px-1",
  },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-paper-50 text-navy-900 dark:bg-ink-950 dark:text-[#F4F1EA]">
      <div
        aria-hidden="true"
        className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-orange-100 blur-3xl dark:bg-orange-500/20"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-32 -left-24 h-80 w-80 rounded-full bg-sky-400/15 blur-3xl dark:bg-sky-400/10"
      />

      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <Link aria-label="Ir al inicio" href="/">
          <Image
            alt="València Hack"
            className="h-12 w-auto sm:h-14"
            height={72}
            priority
            src="/brand/valencia-hack.svg"
            width={180}
          />
        </Link>
        <div className="flex items-center gap-3">
          <p className="max-w-36 text-right text-[0.68rem] font-bold uppercase leading-4 tracking-[0.12em] text-navy-700 dark:text-[#F4F1EA] sm:max-w-none sm:text-xs">
            Cátedra Valent-IA
          </p>
          <ThemeToggle />
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-md flex-1 items-center px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </section>

      <footer className="relative border-t border-line bg-white/55 px-4 py-5 backdrop-blur dark:border-[#262838] dark:bg-[#151621]/60 sm:px-6">
        <p className="mb-4 text-center text-[0.65rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          Impulsado por Cátedra Valent-IA
        </p>
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-6 gap-y-4 sm:gap-x-9">
          {sponsors.map((sponsor, index) => (
            <Image
              alt={sponsor.alt}
              className={sponsor.className}
              height={sponsor.height}
              key={`${sponsor.src}-${index}`}
              src={sponsor.src}
              width={sponsor.width}
            />
          ))}
          <Image
            alt="Universitat Politècnica de València · Vicerrectorado de Estudiantes y Emprendimiento"
            className="h-9 w-auto object-contain"
            height={45}
            src="/brand/sponsors/upv-vee.jpg"
            width={150}
          />
        </div>
      </footer>
    </main>
  );
}
