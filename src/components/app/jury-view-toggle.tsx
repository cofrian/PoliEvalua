"use client";

import { Gavel, ShieldCheck } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { setJuryViewAction } from "@/app/(app)/jury-view-actions";
import { Button } from "@/components/ui/button";

/** Botón de la gestión para alternar entre su vista completa y la del jurado. */
export function JuryViewToggle({ active }: { active: boolean }) {
  const t = useTranslations("juryView");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function toggle() {
    startTransition(async () => {
      await setJuryViewAction(!active);
      // Las páginas de administración no existen en la vista de jurado.
      if (!active && pathname.startsWith("/admin")) router.push("/equipos");
      router.refresh();
    });
  }

  return (
    <Button
      aria-pressed={active}
      className="h-9 gap-1.5 px-3 text-sm font-semibold"
      disabled={pending}
      onClick={toggle}
      title={active ? t("exitHint") : t("enterHint")}
      variant={active ? "default" : "outline"}
    >
      {active ? <ShieldCheck aria-hidden="true" className="size-4" /> : <Gavel aria-hidden="true" className="size-4" />}
      <span className="hidden sm:inline">{active ? t("exit") : t("enter")}</span>
    </Button>
  );
}
