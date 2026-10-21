"use client";

import { CheckCircle2 } from "lucide-react";
import { useActionState, useState } from "react";

import { castPublicVoteAction, type PublicVoteState } from "@/app/votar/[slug]/actions";
import { SubmitButton } from "@/components/auth/submit-button";

export function PublicVoteForm({
  slug,
  teams,
  currentTeamId,
}: {
  slug: string;
  teams: { id: string; number: number | null; name: string; project_title: string | null }[];
  currentTeamId: string | null;
}) {
  const [state, formAction] = useActionState<PublicVoteState, FormData>(castPublicVoteAction, null);
  const [selected, setSelected] = useState(currentTeamId);
  const voted = state?.ok ? state.teamId : currentTeamId;

  return (
    <form action={formAction} className="mt-6 space-y-3">
      <input name="slug" type="hidden" value={slug} />
      <fieldset className="space-y-2">
        <legend className="sr-only">Proyectos</legend>
        {teams.map((team) => (
          <label
            className="flex cursor-pointer items-center gap-3 rounded-xl border border-input bg-white p-4 has-[:checked]:border-primary has-[:checked]:bg-primary/10 dark:bg-[#1B1D1E]"
            key={team.id}
          >
            <input
              checked={selected === team.id}
              className="size-5"
              name="teamId"
              onChange={() => setSelected(team.id)}
              type="radio"
              value={team.id}
            />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                #{team.number} · {team.name}
              </span>
              {team.project_title ? (
                <span className="block text-sm text-muted-foreground">{team.project_title}</span>
              ) : null}
            </span>
            {voted === team.id ? <CheckCircle2 aria-label="Tu voto" className="size-5 text-leaf-500" /> : null}
          </label>
        ))}
      </fieldset>
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
      <div className="sticky bottom-4">
        <SubmitButton
          idleLabel={voted && voted !== selected ? "Cambiar mi voto" : voted ? "Votar de nuevo" : "Votar"}
          pendingLabel="Enviando…"
        />
      </div>
    </form>
  );
}
