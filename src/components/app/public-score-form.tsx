"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { castPublicScoreAction, type PublicVoteState } from "@/app/votar/[slug]/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import type { PublicRubric } from "@/lib/app/public-vote-data";

type Team = { id: string; number: number | null; name: string; project_title: string | null };

/** Un proyecto: los criterios de la rúbrica con un botón por nivel. */
function TeamScore({
  team,
  rubric,
  slug,
  locale,
  saved,
}: {
  team: Team;
  rubric: PublicRubric;
  slug: string;
  locale: string;
  saved: Record<string, number> | null;
}) {
  const t = useTranslations("publicVote");
  const [state, formAction] = useActionState<PublicVoteState, FormData>(castPublicScoreAction, null);
  const done = Boolean(saved) || Boolean(state?.ok);
  // Abierta si falta puntuarlo; tras guardar sigue abierta para ver la confirmación.
  const [open, setOpen] = useState(!saved);
  const values = Array.from({ length: rubric.scaleMax - rubric.scaleMin + 1 }, (_, index) => rubric.scaleMin + index);

  return (
    <details
      className="group rounded-xl border border-input bg-white dark:bg-card"
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary className="flex cursor-pointer items-center gap-3 p-4">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            #{team.number} · {team.name}
          </span>
          {team.project_title ? <span className="block text-sm text-muted-foreground">{team.project_title}</span> : null}
        </span>
        {done ? <CheckCircle2 aria-label={t("scored")} className="size-5 text-leaf-500 dark:text-green-400" /> : null}
      </summary>
      <form action={formAction} className="space-y-4 border-t border-border p-4">
        <input name="slug" type="hidden" value={slug} />
        <input name="locale" type="hidden" value={locale} />
        <input name="teamId" type="hidden" value={team.id} />
        {rubric.criteria.map((criterion) => (
          <fieldset className="space-y-2" key={criterion.id}>
            <legend className="text-sm font-semibold">{criterion.title}</legend>
            {criterion.description ? <p className="text-xs text-muted-foreground">{criterion.description}</p> : null}
            <div className="flex flex-wrap gap-2">
              {values.map((value) => {
                const label = criterion.levels.find((level) => level.score === value)?.label;
                return (
                  <label
                    className="flex min-w-11 cursor-pointer flex-col items-center rounded-lg border border-input px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/10"
                    key={value}
                  >
                    <input
                      className="sr-only"
                      defaultChecked={saved?.[criterion.id] === value}
                      name={`c_${criterion.id}`}
                      required
                      type="radio"
                      value={value}
                    />
                    <span className="font-semibold">{value}</span>
                    {label ? <span className="text-[11px] text-muted-foreground">{label}</span> : null}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
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
        <SubmitButton idleLabel={done ? t("updateScore") : t("saveScore")} pendingLabel={t("sending")} />
      </form>
    </details>
  );
}

/**
 * Votación del público con la rúbrica: cada proyecto se puntúa por separado y
 * se puede corregir mientras la votación siga abierta.
 */
export function PublicScoreForm({
  slug,
  teams,
  rubric,
  locale,
  saved,
}: {
  slug: string;
  teams: Team[];
  rubric: PublicRubric;
  locale: string;
  saved: Record<string, Record<string, number>>;
}) {
  return (
    <div className="mt-6 space-y-3">
      {teams.map((team) => (
        <TeamScore key={team.id} locale={locale} rubric={rubric} saved={saved[team.id] ?? null} slug={slug} team={team} />
      ))}
    </div>
  );
}
