import { getFormatter, getTranslations } from "next-intl/server";

import { ListChecks, Sparkles } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/app/empty-state";
import { Presence } from "@/components/app/presence";
import { Button } from "@/components/ui/button";
import {
  RubricEditor,
  type EditableCriterion,
} from "@/components/app/rubric-editor";
import { RubricLiveUpdates } from "@/components/app/rubric-live-updates";
import { getSession } from "@/lib/app/session";

export default async function RubricPage() {
  const { supabase, user, profile, isAdmin, event, role, words } = await getSession();
  const isStudent = role === "student";
  const [t, format] = await Promise.all([getTranslations("rubric"), getFormatter()]);
  if (isStudent && !words.studentsSeeRubric) {
    return <p>{t("hiddenForStudents")}</p>;
  }

  const { data: rubric } = await supabase
    .from("rubrics")
    .select(
      "id, name, locked, version, scale_min, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, updated_at, rubric_levels(id, score, label, descriptor, example))",
    )
    .eq("is_active", true)
    .eq("event_id", event.id)
    .limit(1)
    .maybeSingle();

  if (!rubric) {
    return <p>{t("none")}</p>;
  }

  const { data: changes } = await supabase
    .from("rubric_changes")
    .select("id, summary, created_at, author:profiles(full_name)")
    .eq("event_id", event.id)
    .eq("rubric_id", rubric.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const criteria = (
    (rubric.rubric_criteria ?? []) as unknown as (EditableCriterion & {
      deleted_at: string | null;
    })[]
  )
    .filter((criterion) => !criterion.deleted_at)
    .sort((a, b) => a.order - b.order)
    .map((criterion) => ({
      ...criterion,
      weight: Number(criterion.weight),
      rubric_levels: [...criterion.rubric_levels].sort(
        (a, b) => a.score - b.score,
      ),
    }));

  const canEdit = isAdmin;

  return (
    <div className="space-y-8">
      <RubricLiveUpdates rubricId={rubric.id} userId={user.id} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isAdmin
              ? t("meta", { name: rubric.name, min: rubric.scale_min, max: rubric.scale_max })
              : t("scale", { min: rubric.scale_min, max: rubric.scale_max })}
            {rubric.locked ? t("locked") : ""}
          </p>
        </div>
        <Presence
          me={{
            id: user.id,
            name: profile.full_name,
            avatar: profile.avatar_url,
          }}
          room={`rubric-${rubric.id}`}
        />
      </div>

      {!canEdit && criteria.length ? (
        <p className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm dark:bg-card">
          {isStudent
            ? t("studentHint", { evaluator: words.evaluator, presentation: words.presentation })
            : t("readOnlyHint")}
        </p>
      ) : null}

      {criteria.length === 0 ? (
        <EmptyState
          action={
            canEdit ? (
              <Button asChild variant="outline">
                <Link href="/admin/asistente">
                  <Sparkles aria-hidden="true" /> {t("emptyAssistant")}
                </Link>
              </Button>
            ) : null
          }
          description={canEdit ? t("emptyAdmin") : t("emptyOther")}
          icon={<ListChecks aria-hidden="true" />}
          title={t("emptyTitle")}
        />
      ) : null}

      <RubricEditor
        canEdit={canEdit}
        initialCriteria={criteria}
        isAdmin={isAdmin}
        locked={rubric.locked}
        rubricId={rubric.id}
        userId={user.id}
      />

      {!isAdmin ? null : <section>
        <h2 className="mb-3 font-display text-xl">{t("history")}</h2>
        {changes?.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border bg-white text-sm dark:bg-card">
            {changes.map((change) => (
              <li className="flex flex-wrap justify-between gap-2 px-3 py-2" key={change.id}>
                <span>
                  <strong>
                    {(change.author as unknown as { full_name: string } | null)
                      ?.full_name ?? t("someone")}
                  </strong>{" "}
                  {change.summary}
                </span>
                <span className="text-muted-foreground">
                  {format.dateTime(new Date(change.created_at), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("noChanges")}
          </p>
        )}
      </section>}
    </div>
  );
}
