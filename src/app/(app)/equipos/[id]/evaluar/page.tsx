import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EvaluationForm,
  type Criterion,
} from "@/components/app/evaluation-form";
import { NotesDrawer } from "@/components/app/notes-drawer";
import { NotesPanel, type Note } from "@/components/app/notes-panel";
import { RubricLiveUpdates } from "@/components/app/rubric-live-updates";
import { getSession } from "@/lib/app/session";

export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, canVote, event } = await getSession();

  const { data: team } = await supabase
    .from("teams")
    .select("id, number, name")
    .eq("id", id)
    .eq("event_id", event.id)
    .maybeSingle();

  if (!team) notFound();

  const back = (
    <Link
      className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      href={`/equipos/${team.id}`}
    >
      <ArrowLeft className="size-4" /> {team.name}
    </Link>
  );

  if (!canVote) {
    return (
      <div className="space-y-6">
        {back}
        <p className="rounded-xl border border-line bg-white p-6 dark:border-[#262838] dark:bg-[#151621]">
          Como mentor puedes tomar notas de los equipos, pero no votar.
        </p>
      </div>
    );
  }

  const { data: rubric } = await supabase
    .from("rubrics")
    .select(
      "id, name, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, rubric_levels(score, label, descriptor))",
    )
    .eq("is_active", true)
    .eq("event_id", event.id)
    .limit(1)
    .maybeSingle();

  if (!rubric) {
    return (
      <div className="space-y-6">
        {back}
        <p>No hay ninguna rúbrica activa para este evento.</p>
      </div>
    );
  }

  const [{ data: evaluation }, { data: notes }] = await Promise.all([
    supabase
      .from("evaluations")
      .select(
        "id, status, general_comment, evaluation_scores(criterion_id, score, comment)",
      )
      .eq("event_id", event.id)
      .eq("team_id", team.id)
      .eq("judge_id", user.id)
      .eq("rubric_id", rubric.id)
      .maybeSingle(),
    supabase
      .from("notes")
      .select(
        "id, body, is_shared, created_at, author_id, author:profiles(full_name)",
      )
      .eq("event_id", event.id)
      .eq("team_id", team.id)
      .order("created_at", { ascending: false }),
  ]);

  const criteria: Criterion[] = (
    (rubric.rubric_criteria ?? []) as unknown as (Criterion & {
      order: number;
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

  return (
    <div className="space-y-6">
      {back}
      <div>
        <p className="text-sm font-bold text-muted-foreground">
          {rubric.name}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl">
          Evaluar · {team.name}
        </h1>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <EvaluationForm
          criteria={criteria}
          eventId={event.id}
          initial={
            evaluation
              ? {
                  id: evaluation.id,
                  status: evaluation.status,
                  generalComment: evaluation.general_comment ?? "",
                  scores: evaluation.evaluation_scores ?? [],
                }
              : null
          }
          locked={event.status === "closed"}
          rubricId={rubric.id}
          scaleMax={rubric.scale_max}
          teamId={team.id}
          userId={user.id}
        />
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
          <h2 className="mb-3 font-display text-2xl">Notas</h2>
          <NotesPanel
            eventId={event.id}
            initialNotes={(notes ?? []) as unknown as Note[]}
            teamId={team.id}
            userId={user.id}
          />
        </aside>
      </div>
      <NotesDrawer
        eventId={event.id}
        initialNotes={(notes ?? []) as unknown as Note[]}
        teamId={team.id}
        userId={user.id}
      />
      <RubricLiveUpdates rubricId={rubric.id} userId={user.id} />
    </div>
  );
}
