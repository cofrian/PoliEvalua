"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/**
 * Tarjeta de ajustes con un único «Guardar» que solo se activa cuando hay
 * cambios, muestra que está guardando y confirma con un aviso.
 */
export function SettingsForm({
  action,
  title,
  description,
  children,
}: {
  action: (formData: FormData) => Promise<{ error?: string } | void>;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const form = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result && result.error) {
          toast.error(result.error);
          return;
        }
        setDirty(false);
        toast.success(t("saved"));
      } catch (error) {
        toast.error(error instanceof Error ? error.message : t("saveError"));
      }
    });
  }

  return (
    <form
      action={submit}
      className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_2px_rgb(17_17_17/0.04),0_4px_16px_rgb(17_17_17/0.04)]"
      onChange={() => setDirty(true)}
      onClickCapture={(event) => {
        // Los interruptores de Radix no disparan «change» en el formulario.
        if ((event.target as HTMLElement).closest("[role=switch]")) setDirty(true);
      }}
      onReset={() => setDirty(false)}
      ref={form}
    >
      <div className="border-b border-border/70 px-5 py-4 sm:px-6">
        <h2 className="font-display text-lg">{title}</h2>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="divide-y divide-border/70">{children}</div>
      <div
        className={cn(
          "flex items-center justify-end gap-3 border-t border-border/70 bg-muted/40 px-5 py-3 sm:px-6",
        )}
      >
        <span aria-live="polite" className="mr-auto text-xs text-muted-foreground">
          {dirty ? t("unsaved") : ""}
        </span>
        <Button disabled={pending} type="submit" variant={dirty ? "default" : "outline"}>
          {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </form>
  );
}

/** Fila de ajuste: qué es y para qué sirve a la izquierda, el control a la derecha. */
export function SettingRow({
  label,
  description,
  htmlFor,
  children,
  stacked = false,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  /** El control ocupa todo el ancho debajo del texto (campos largos). */
  stacked?: boolean;
}) {
  return (
    <div
      className={cn(
        "gap-3 px-5 py-4 sm:px-6",
        stacked ? "space-y-3" : "flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-8",
      )}
    >
      <div className="min-w-0 sm:max-w-md">
        <label className="block text-sm font-semibold" htmlFor={htmlFor}>
          {label}
        </label>
        {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className={stacked ? "" : "shrink-0 sm:w-72 sm:text-right"}>{children}</div>
    </div>
  );
}

/**
 * Ajustes que casi nadie necesita, plegados para que el bloque se lea de un
 * vistazo. Siguen dentro del mismo formulario y se guardan con él.
 */
export function AdvancedSettings({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  const t = useTranslations("common");
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground sm:px-6 [&::-webkit-details-marker]:hidden">
        <span>
          {t("advanced")}
          {hint ? <span className="block text-xs font-normal">{hint}</span> : null}
        </span>
        <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="divide-y divide-border/70 border-t border-border/70">{children}</div>
    </details>
  );
}

/** Interruptor que se envía con el formulario como «on» cuando está activado. */
export function SettingSwitch({ id, name, defaultChecked }: { id: string; name: string; defaultChecked: boolean }) {
  return <Switch defaultChecked={defaultChecked} id={id} name={name} size="default" />;
}
