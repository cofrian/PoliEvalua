"use client";

import { useActionState } from "react";

import { importTeamsAction, type ImportState } from "@/app/(app)/admin/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { Textarea } from "@/components/ui/textarea";

export function ImportTeamsForm() {
  const [state, formAction] = useActionState<ImportState, FormData>(
    importTeamsAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Mismo formato que <code>equipos.txt</code>: Reto, Nº, Equipo, Miembro 1,
        Miembro 2… (separado por tabuladores o comas). Crea o actualiza por nombre
        de equipo y añade los integrantes que falten; no borra nada.
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
        placeholder={"Reto 1\t1\tMi equipo\tAna García\tLuis Pérez"}
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
        <SubmitButton idleLabel="Importar" pendingLabel="Importando…" />
      </div>
    </form>
  );
}
