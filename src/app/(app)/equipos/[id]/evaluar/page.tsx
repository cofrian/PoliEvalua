import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  EvaluationForm,
  type Criterion,
  type EvaluationPageConfig,
} from "@/components/app/evaluation-form";
import { AiEvidencePanel, type AiEvidence } from "@/components/app/ai-evidence-panel";
import { NotesDrawer } from "@/components/app/notes-drawer";
import { NotesPanel, type Note } from "@/components/app/notes-panel";
import { RubricLiveUpdates } from "@/components/app/rubric-live-updates";
import type { CriterionEvidence } from "@/lib/ai/presentation-insights";
import { getSession } from "@/lib/app/session";

export default async function EvaluatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, canVote, isAdmin, event, role } = await getSession();

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
          Tu perfil de {role === "mentor" ? "mentoría" : role === "student" ? "estudiante" : "consulta"} puede consultar y tomar notas, pero no votar.
        </p>
      </div>
    );
  }

  const { data: canVoteThisTeam } = await supabase.rpc("can_vote_team", {
    target_event: event.id,
    target_team: team.id,
  });
  if (!canVoteThisTeam) {
    return (
      <div className="space-y-6">
        {back}
        <p className="rounded-xl border border-orange-500/50 bg-orange-500/10 p-6">
          Este proyecto no está asignado a ninguno de tus paneles de jurado.
        </p>
      </div>
    );
  }

  const [{ data: rubric }, { data: evaluationPage }] = await Promise.all([
    supabase
      .from("rubrics")
      .select(
        "id, name, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, rubric_levels(score, label, descriptor))",
      )
      .eq("is_active", true)
      .eq("event_id", event.id)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("evaluation_pages")
      .select("title, description, instructions, requirements, questions, status, opens_at, closes_at")
      .eq("event_id", event.id)
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

  if (evaluationPage?.status === "draft" && !isAdmin) {
    return (
      <div className="space-y-6">
        {back}
        <p>La página de evaluación todavía está en preparación.</p>
      </div>
    );
  }

  const [{ data: evaluation }, { data: notes }, { data: reports }, { count: processingCount }] = await Promise.all([
    supabase
      .from("evaluations")
      .select(
        "id, status, general_comment, form_answers, evaluation_scores(criterion_id, score, comment)",
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
    // La RLS solo devuelve informes a jurado y gestión.
    supabase
      .from("presentation_jury_reports")
      .select("criteria_evidence, questions, risks, created_at, recording:presentation_recordings!inner(title, status, deleted_at)")
      .eq("event_id", event.id)
      .eq("team_id", team.id)
      .eq("recording.status", "ready")
      .is("recording.deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("presentation_recordings")
      .select("id", { count: "exact", head: true })
      .eq("event_id", event.id)
      .eq("team_id", team.id)
      .in("status", ["uploading", "queued", "transcribing", "transcribed", "analyzing"])
      .is("deleted_at", null),
  ]);
  const report = reports?.[0];
  const recordingRelation = report?.recording as unknown as { title: string } | { title: string }[] | undefined;
  const aiEvidence: AiEvidence = report
    ? {
        recordingTitle:
          (Array.isArray(recordingRelation) ? recordingRelation[0]?.title : recordingRelation?.title) ??
          "Exposición",
        criteria: (report.criteria_evidence ?? []) as CriterionEvidence[],
        questions: (report.questions ?? []) as string[],
        risks: (report.risks ?? []) as string[],
      }
    : null;
  const aiPanel = (
    <AiEvidencePanel evidence={aiEvidence} processing={(processingCount ?? 0) > 0} teamId={team.id} />
  );

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
  const page = evaluationPage
    ? ({
        title: evaluationPage.title,
        description: evaluationPage.description,
        instructions: evaluationPage.instructions,
        requirements: Array.isArray(evaluationPage.requirements)
          ? evaluationPage.requirements
          : [],
        questions: Array.isArray(evaluationPage.questions)
          ? evaluationPage.questions
          : [],
      } as EvaluationPageConfig)
    : null;
  const now = Date.now();
  const locked =
    event.status === "closed" ||
    evaluationPage?.status === "closed" ||
    Boolean(evaluationPage?.opens_at && new Date(evaluationPage.opens_at).getTime() > now) ||
    Boolean(evaluationPage?.closes_at && new Date(evaluationPage.closes_at).getTime() <= now);

  return (
    <div className="space-y-6">
      {back}
      <div>
        <p className="text-sm font-bold text-muted-foreground">
          {page?.title ?? rubric.name}
        </p>
        <h1 className="font-display text-3xl sm:text-4xl">
          Evaluar · {team.name}
        </h1>
      </div>

      <details className="rounded-xl border border-line bg-white p-4 lg:hidden dark:border-[#262838] dark:bg-[#151621]">
        <summary className="cursor-pointer font-semibold">Apoyo de la IA</summary>
        <div className="mt-3">{aiPanel}</div>
      </details>

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
                  formAnswers:
                    evaluation.form_answers &&
                    typeof evaluation.form_answers === "object" &&
                    !Array.isArray(evaluation.form_answers)
                      ? (evaluation.form_answers as Record<string, string | boolean>)
                      : {},
                  scores: evaluation.evaluation_scores ?? [],
                }
              : null
          }
          locked={locked}
          page={page}
          rubricId={rubric.id}
          scaleMax={rubric.scale_max}
          teamId={team.id}
          userId={user.id}
        />
        <aside className="hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100svh-6rem)] lg:overflow-y-auto">
          <div className="mb-6 rounded-xl border border-line bg-white p-4 dark:border-[#262838] dark:bg-[#151621]">
            {aiPanel}
          </div>
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
