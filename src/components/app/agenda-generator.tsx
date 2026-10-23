"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { generateAgendaAction, type AgendaState } from "@/app/(app)/admin/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/lib/app/ui";

export function AgendaGenerator({ hasAgenda, defaultStart }: { hasAgenda: boolean; defaultStart: string }) {
  const [state, formAction] = useActionState<AgendaState, FormData>(generateAgendaAction, null);
  const t = useTranslations("agendaAdmin");

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1 lg:col-span-2">
          <Label htmlFor="rooms">{t("rooms")}</Label>
          <Input defaultValue={t("defaultRoom")} id="rooms" name="rooms" required />
        </div>
        <div className="space-y-1">
          <Label htmlFor="start">{t("start")}</Label>
          <Input defaultValue={defaultStart} id="start" name="start" required type="datetime-local" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="duration">{t("duration")}</Label>
          <Input defaultValue={10} id="duration" max={240} min={1} name="duration" required type="number" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="gap">{t("gap")}</Label>
          <Input defaultValue={2} id="gap" max={120} min={0} name="gap" required type="number" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="order">{t("order")}</Label>
          <select className={`${selectClass} w-full`} defaultValue="number" id="order" name="order">
            <option value="number">{t("byNumber")}</option>
            <option value="random">{t("random")}</option>
          </select>
        </div>
      </div>
      {hasAgenda ? (
        <p className="text-sm text-orange-600 dark:text-orange-400">
          {t("replaceWarning")}
        </p>
      ) : null}
      {state ? (
        <p
          className={
            state.ok
              ? "rounded-lg border border-leaf-500/50 bg-leaf-500/10 px-3 py-2 text-sm"
              : "rounded-lg border border-coral-400/50 bg-coral-400/10 px-3 py-2 text-sm"
          }
          role="status"
        >
          {state.message}
        </p>
      ) : null}
      <div className="max-w-xs">
        <SubmitButton idleLabel={hasAgenda ? t("regenerateButton") : t("generateButton")} pendingLabel={t("generating")} />
      </div>
    </form>
  );
}
