import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EvaluationForm,
  type Criterion,
} from "@/components/app/evaluation-form";
import { NotesPanel, type Note } from "@/components/app/notes-panel";
import { getSession } from "@/lib/app/session";

export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, canVote } = await getSession();

  const { data: team } = await supabase
    .from("teams")
    .select("id, number, name, challenge:challenges(event_id)")
    .eq("id", id)
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

  const eventId = (team.challenge as unknown as { event_id: string } | null)
    ?.event_id;

  const [{ data: rubric }, { data: event }] = await Promise.all([
    supabase
      .from("rubrics")
      .select(
        "id, name, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, rubric_levels(score, label, descriptor))",
      )
      .eq("is_active", true)
      .eq("event_id", eventId ?? "")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("events")
      .select("status")
      .eq("id", eventId ?? "")
      .maybeSingle(),
  ]);

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
      .eq("team_id", team.id)
      .eq("judge_id", user.id)
      .eq("rubric_id", rubric.id)
      .maybeSingle(),
    supabase
      .from("notes")
      .select(
        "id, body, is_shared, created_at, author_id, author:profiles(full_name)",
      )
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
          locked={event?.status === "closed"}
          rubricId={rubric.id}
          scaleMax={rubric.scale_max}
          teamId={team.id}
          userId={user.id}
        />
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
          <h2 className="mb-3 font-display text-2xl">Notas</h2>
          <NotesPanel
            initialNotes={(notes ?? []) as unknown as Note[]}
            teamId={team.id}
            userId={user.id}
          />
        </aside>
      </div>
    </div>
  );
}
