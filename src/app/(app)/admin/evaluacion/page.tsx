import { getTranslations } from "next-intl/server";

import Link from "next/link";

import { saveEvaluationSettingsAction } from "@/app/(app)/admin/evaluacion/actions";
import { PageHeader } from "@/components/app/page-header";
import { AdvancedSettings, SettingRow, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { evaluationReadiness } from "@/lib/app/evaluation-readiness";
import { getSession } from "@/lib/app/session";
import { selectClass } from "@/lib/app/ui";

type Requirement = { label?: string };
type Question = { label?: string };

function localDateTime(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
}

export default async function EvaluationSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ applied?: string }>;
}) {
  const { applied } = await searchParams;
  const { supabase, event } = await getSession();
  const t = await getTranslations("evalAdmin");
  const { data: page } = await supabase
    .from("evaluation_pages")
    .select("title, description, instructions, requirements, questions, status, aggregation_method, min_evaluations, current_round, opens_at, closes_at, version")
    .eq("event_id", event.id)
    .maybeSingle();
  const readiness = await evaluationReadiness(supabase, event.id);
  const requirements = (page?.requirements ?? []) as Requirement[];
  const questions = (page?.questions ?? []) as Question[];

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
      {!readiness.rubricReady ? (
        <p className="rounded-lg border border-upv-yellow/70 bg-upv-yellow/15 p-3 text-sm" role="status">
          {t.rich(readiness.criteria ? "rubricWeights" : "rubricMissing", {
            total: readiness.weightTotal,
            link: (chunks) => (
              <Link className="font-semibold underline" href="/rubrica">
                {chunks}
              </Link>
            ),
          })}
        </p>
      ) : null}
      {applied ? (
        <p className="rounded-lg border border-leaf-500/50 bg-leaf-500/10 p-3 text-sm">
          {t("applied")}
        </p>
      ) : null}
      <SettingsForm
        action={saveEvaluationSettingsAction}
        description={t("formDescription", { version: page?.version ?? 1 })}
        title={t("formTitle")}
      >
        <SettingRow
          description={t("statusHint")}
          htmlFor="status"
          label={t("status")}
        >
          <select className={`${selectClass} w-full`} defaultValue={page?.status ?? "draft"} id="status" name="status">
            {(["draft", "published", "closed"] as const).map((value) => (
              <option key={value} value={value}>
                {t(`statuses.${value}`)}
              </option>
            ))}
          </select>
        </SettingRow>
        <SettingRow htmlFor="title" label={t("name")} stacked>
          <Input defaultValue={page?.title ?? t("defaultName", { space: event.name })} id="title" name="title" required />
        </SettingRow>
        <SettingRow htmlFor="instructions" label={t("instructions")} stacked>
          <Textarea className="min-h-28" defaultValue={page?.instructions ?? ""} id="instructions" maxLength={4000} name="instructions" />
        </SettingRow>
        <AdvancedSettings hint={t("advancedHint")}>
          <SettingRow description={t("datesHint")} label={t("dates")}>
            <div className="grid gap-2">
              <Input aria-label={t("opens")} defaultValue={localDateTime(page?.opens_at)} name="opensAt" type="datetime-local" />
              <Input aria-label={t("closes")} defaultValue={localDateTime(page?.closes_at)} name="closesAt" type="datetime-local" />
            </div>
          </SettingRow>
          <SettingRow description={t("minHint")} htmlFor="minEvaluations" label={t("min")}>
            <Input className="sm:ml-auto sm:w-24" defaultValue={page?.min_evaluations ?? 1} id="minEvaluations" max={20} min={1} name="minEvaluations" type="number" />
          </SettingRow>
          <SettingRow description={t("aggregationHint")} htmlFor="aggregationMethod" label={t("aggregation")}>
            <select className={`${selectClass} w-full`} defaultValue={page?.aggregation_method ?? "average"} id="aggregationMethod" name="aggregationMethod">
              {(["average", "consensus", "hybrid", "trimmed_mean"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`methods.${value}`)}
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow description={t("roundHint")} htmlFor="currentRound" label={t("round")}>
            <Input className="sm:ml-auto sm:w-24" defaultValue={page?.current_round ?? 1} id="currentRound" max={20} min={1} name="currentRound" type="number" />
          </SettingRow>
          <SettingRow htmlFor="description" label={t("descriptionLabel")} stacked>
            <Textarea defaultValue={page?.description ?? ""} id="description" maxLength={2000} name="description" />
          </SettingRow>
          <SettingRow description={t("requirementsHint")} htmlFor="requirements" label={t("requirements")} stacked>
            <Textarea className="min-h-28" defaultValue={requirements.map((item) => item.label).filter(Boolean).join("\n")} id="requirements" name="requirements" />
          </SettingRow>
          <SettingRow description={t("questionsHint")} htmlFor="questions" label={t("questions")} stacked>
            <Textarea className="min-h-28" defaultValue={questions.map((item) => item.label).filter(Boolean).join("\n")} id="questions" name="questions" />
          </SettingRow>
        </AdvancedSettings>
      </SettingsForm>
    </div>
  );
}
