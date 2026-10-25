import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/app/locale-switcher";
import { PoliBrand } from "@/components/brand/poli-brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth");
  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden bg-muted text-upv-ink dark:bg-ink-950 dark:text-upv-100">
      <div aria-hidden="true" className="absolute inset-y-0 right-0 hidden w-[34%] bg-upv-yellow [clip-path:polygon(34%_0,100%_0,100%_100%,0_100%)] lg:block" />
      <div aria-hidden="true" className="absolute bottom-0 right-[18%] hidden h-[46%] w-[22%] bg-upv-blue [clip-path:polygon(40%_0,100%_0,60%_100%,0_100%)] lg:block" />

      <header className="relative border-b border-border bg-card">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <PoliBrand />
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="relative mx-auto flex w-full max-w-md flex-1 items-center px-4 py-8 sm:px-6 sm:py-12 lg:mr-[44%]">
        {children}
      </section>

      <footer className="relative border-t border-border bg-white px-4 py-4 text-center text-xs text-upv-500 dark:bg-card dark:text-upv-300 sm:px-6">
        <p>{t("footer")}</p>
      </footer>
    </main>
  );
}
