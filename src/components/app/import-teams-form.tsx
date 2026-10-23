"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { importTeamsAction, type ImportState } from "@/app/(app)/admin/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Textarea } from "@/components/ui/textarea";

export function ImportTeamsForm() {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importTeamsAction,
    null,
  );
  const t = useTranslations("importTeams");

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t.rich("help", { code: (chunks) => <code>{chunks}</code> })}
      </p>
      <input
        accept=".txt,.csv,.tsv,text/plain,text/csv"
        className="block text-sm"
        name="file"
        type="file"
      />
      <Textarea
        className="min-h-24 font-mono text-xs"
        name="content"
        placeholder={t("placeholder")}
      />
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
        <SubmitButton idleLabel={t("submit")} pendingLabel={t("pending")} />
      </div>
    </form>
  );
}
