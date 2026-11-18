import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";

import { ActionForm } from "@/components/app/action-form";
import { deleteChallengeAction, saveChallengeAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { asScoringMode, clampWeight, combineScore, type ScoringMode } from "@/lib/app/challenge-scoring";
import { getSession } from "@/lib/app/session";
import { cardClass, selectClass } from "@/lib/app/ui";

type Challenge = {
  id: string;
  name: string;
  description: string | null;
  order: number | null;
  scoring_mode: string | null;
  general_weight: number | null;
  rubric_id: string | null;
};

function ChallengeForm({ challenge, ownCount }: { challenge: Challenge | null; ownCount: number }) {
  const t = useTranslations("challengesAdmin");
  const format = useFormatter();
  const mode: ScoringMode = asScoringMode(challenge?.scoring_mode);
  const weight = clampWeight(challenge?.general_weight);
  const example = combineScore({ scoringMode: "general_plus", generalWeight: weight, rubricId: "x" }, 8, 9);
  return (
    <ActionForm action={saveChallengeAction} className="space-y-3">
      <input name="id" type="hidden" value={challenge?.id ?? ""} />
      <div className="grid gap-3 sm:grid-cols-[6rem_1fr_2fr] sm:items-end">
        <label className="space-y-1 text-sm font-semibold">
          <span className="block">{t("order")}</span>
          <Input defaultValue={challenge?.order ?? ""} inputMode="numeric" name="order" />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span className="block">{t("name")}</span>
          <Input defaultValue={challenge?.name ?? ""} name="name" required />
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span className="block">{t("description")}</span>
          <Input defaultValue={challenge?.description ?? ""} name="description" />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
        <label className="space-y-1 text-sm font-semibold">
          <span className="block">{t("scoringTitle")}</span>
          <select className={selectClass} defaultValue={mode} name="scoring_mode">
            <option value="general">{t("scoringGeneral")}</option>
            <option value="general_plus">{t("scoringGeneralPlus")}</option>
            <option value="own">{t("scoringOwn")}</option>
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold">
          <span className="block">{t("generalWeight")}</span>
          <Input defaultValue={weight} inputMode="numeric" max={100} min={0} name="general_weight" type="number" />
        </label>
        <Button type="submit">{challenge ? t("save") : t("create")}</Button>
      </div>
      {mode === "general_plus" ? (
        <p className="text-xs text-muted-foreground">
          {t("scoringExample", {
            general: weight,
            own: 100 - weight,
            result: format.number(example ?? 0, { maximumFractionDigits: 2 }),
          })}
        </p>
      ) : null}
      {challenge && mode !== "general" && challenge.rubric_id ? (
        <p className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{t("ownCriteria", { count: ownCount })}</span>
          <Button asChild size="sm" variant="outline">
            <Link href={`/rubrica?reto=${challenge.id}`}>{t("editOwnRubric")}</Link>
          </Button>
        </p>
      ) : null}
    </ActionForm>
  );
}

export default async function AdminChallengesPage() {
  const { supabase, event } = await getSession();
  const t = await getTranslations("challengesAdmin");
  const [{ data: challenges }, { data: teams }, { data: criteria }, { data: extraTeams }] = await Promise.all([
    supabase
      .from("challenges")
      .select("id, name, description, order, scoring_mode, general_weight, rubric_id")
      .eq("event_id", event.id)
      .order("order"),
    supabase.from("teams").select("challenge_id").eq("event_id", event.id),
    supabase.from("rubric_criteria").select("rubric_id").eq("event_id", event.id).is("deleted_at", null),
    supabase.from("team_challenges").select("challenge_id").eq("event_id", event.id),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("pageDescription")}
        title={t("title")}
      />
      <p className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm dark:bg-card">{t("sameForAll")}</p>
    <div className="space-y-4">
      {(challenges ?? []).map((challenge) => {
        // Equipos con este reto como principal o como reto adicional.
        const count =
          (teams ?? []).filter((team) => team.challenge_id === challenge.id).length +
          (extraTeams ?? []).filter((row) => row.challenge_id === challenge.id).length;
        const ownCount = (criteria ?? []).filter((row) => row.rubric_id === challenge.rubric_id).length;
        return (
          <section className={cardClass} key={challenge.id}>
            <ChallengeForm
              challenge={challenge}
              key={`${challenge.scoring_mode}-${challenge.general_weight}-${challenge.rubric_id}-${challenge.name}`}
              ownCount={ownCount}
            />
            <div className="mt-2 flex items-center justify-between text-sm text-muted-foreground">
              <span>{t("teams", { count })}</span>
              {count === 0 ? (
                <ActionForm action={deleteChallengeAction}>
                  <input name="id" type="hidden" value={challenge.id} />
                  <ConfirmSubmit confirmLabel={t("delete")} title={t("deleteTitle", { name: challenge.name })}>
                    {t("delete")}
                  </ConfirmSubmit>
                </ActionForm>
              ) : null}
            </div>
          </section>
        );
      })}
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-xl">{t("new")}</h2>
        <ChallengeForm challenge={null} ownCount={0} />
      </section>
    </div>
    </div>
  );
}
