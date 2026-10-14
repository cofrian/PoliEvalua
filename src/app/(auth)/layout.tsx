import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { SponsorBar } from "@/components/brand/sponsor-bar";
import { ThemeToggle } from "@/components/theme-toggle";

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
        <SponsorBar />
      </footer>
    </main>
  );
}
