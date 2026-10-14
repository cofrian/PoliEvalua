import Image from "next/image";
import Link from "next/link";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-paper-50 px-4 py-6 text-navy-900 dark:bg-ink-950 dark:text-[#F4F1EA] sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-100 blur-3xl dark:bg-orange-500/20"
      />
      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between gap-6 border-b border-line pb-5 dark:border-[#262838]">
        <Image
          src="/brand/valencia-hack.svg"
          alt="València Hack"
          width={180}
          height={72}
          priority
          className="h-14 w-auto"
        />
        <div className="flex items-center gap-3">
          <p className="max-w-40 text-right text-xs font-bold uppercase tracking-[0.12em] text-navy-700 dark:text-[#F4F1EA] sm:max-w-none sm:text-sm">
            Cátedra Valent-IA
          </p>
          <ThemeToggle />
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center py-16 text-center sm:py-24">
        <span className="mb-5 rounded-full bg-orange-100 px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-navy-900">
          Panel del jurado
        </span>
        <h1 className="max-w-3xl font-display text-4xl leading-[1.05] sm:text-5xl lg:text-6xl">
          Panel del jurado de València Hack
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-7 text-slate-500 dark:text-[#C6C4CE] sm:text-lg">
          Accede al panel para guardar notas, evaluar proyectos y consultar tu
          trabajo desde cualquier dispositivo.
        </p>

        <Button asChild className="mt-8 h-11 w-full max-w-xs font-bold">
          <Link href="/login">Entrar</Link>
        </Button>
      </section>

      <footer className="relative mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-3 border-t border-line pt-5 text-center text-xs text-slate-500 dark:border-[#262838] dark:text-[#C6C4CE] sm:flex-row sm:text-left">
        <p>15 de octubre · València</p>
        <p>Cátedra Valent-IA · Sigma Data Club · Ajuntament de València</p>
      </footer>
    </main>
  );
}
