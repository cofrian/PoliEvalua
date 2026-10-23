"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { setLocaleAction } from "@/i18n/actions";
import { LOCALES, localeNames } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** Selector compacto para pantallas sin perfil (entrar, registro, votación pública). */
export function LocaleSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations("locale");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className={cn("inline-flex items-center gap-1.5 text-sm", className)}>
      <Languages aria-hidden="true" className="size-4 text-muted-foreground" />
      <span className="sr-only">{t("label")}</span>
      <select
        className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value;
          startTransition(async () => {
            await setLocaleAction(next);
            router.refresh();
          });
        }}
        value={locale}
      >
        {LOCALES.map((value) => (
          <option key={value} lang={value} value={value}>
            {localeNames[value]}
          </option>
        ))}
      </select>
    </label>
  );
}
