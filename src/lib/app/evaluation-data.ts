import "server-only";

import type { AiEvidence } from "@/components/app/ai-evidence-panel";
import type { Criterion, EvaluationPageConfig } from "@/components/app/evaluation-form";
import type { Note } from "@/components/app/notes-panel";
import type { CriterionEvidence, JuryWeakness } from "@/lib/ai/presentation-insights";
import type { getSession } from "@/lib/app/session";

type Session = Awaited<ReturnType<typeof getSession>>;

export type EvaluationContext =
  | { ok: false; message: string; tone: "info" | "warning" }
  | {
      ok: true;
      rubric: { id: string; name: string; scale_max: number };
      criteria: Criterion[];
      page: EvaluationPageConfig | null;
      locked: boolean;
      initial: {
        id: string;
        status: string;
        generalComment: string;
        shareWithTeam: boolean;
        formAnswers: Record<string, string | boolean>;
        scores: { criterion_id: string; score: number | null; comment: string | null }[];
      } | null;
      notes: Note[];
      aiEvidence: AiEvidence;
      aiProcessing: boolean;
      hasStudents: boolean;
    };

/** Todo lo necesario para que una persona evalúe a un grupo, con sus permisos. */
export async function loadEvaluationContext(
  session: Session,
  teamId: string,
): Promise<EvaluationContext> {
  const { supabase, user, canVote, isAdmin, event, role } = session;

  if (!canVote) {
    const profileName = role === "mentor" ? "mentoría" : role === "student" ? "estudiante" : "consulta";
    return {
      ok: false,
      tone: "info",
      message: `Tu perfil de ${profileName} puede consultar y tomar notas, pero no votar.`,
    };
  }

  const { data: canVoteThisTeam } = await supabase.rpc("can_vote_team", {
    target_event: event.id,
    target_team: teamId,
  });
  if (!canVoteThisTeam) {
    return {
      ok: false,
      tone: "warning",
      message: "Este proyecto no está asignado a ninguno de tus paneles de jurado.",
    };
  }

  const [{ data: rubric }, { data: evaluationPage }] = await Promise.all([
    supabase
      .from("rubrics")
      .select(
        "id, name, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, rubric_levels(score, label, descriptor, example))",
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

  if (!rubric) return { ok: false, tone: "info", message: "No hay ninguna rúbrica activa para este evento." };
  if (evaluationPage?.status === "draft" && !isAdmin) {
    return { ok: false, tone: "info", message: "La página de evaluación todavía está en preparación." };
  }

  const [{ data: evaluation }, { data: notes }, { data: reports }, { count: processingCount }] =
    await Promise.all([
      supabase
        .from("evaluations")
        .select("id, status, general_comment, share_with_team, form_answers, evaluation_scores(criterion_id, score, comment)")
        .eq("event_id", event.id)
        .eq("team_id", teamId)
        .eq("judge_id", user.id)
        .eq("rubric_id", rubric.id)
        .maybeSingle(),
      supabase
        .from("notes")
        .select("id, body, is_shared, created_at, author_id, author:profiles(full_name)")
        .eq("event_id", event.id)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
      // La RLS solo devuelve informes a jurado y gestión.
      supabase
        .from("presentation_jury_reports")
        .select(
          "criteria_evidence, questions, risks, weaknesses, created_at, recording:presentation_recordings!inner(title, status, deleted_at)",
        )
        .eq("event_id", event.id)
        .eq("team_id", teamId)
        .eq("recording.status", "ready")
        .is("recording.deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1),
      supabase
        .from("presentation_recordings")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("team_id", teamId)
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
        weaknesses: (report.weaknesses ?? []) as JuryWeakness[],
      }
    : null;

  const criteria: Criterion[] = (
    (rubric.rubric_criteria ?? []) as unknown as (Criterion & { order: number; deleted_at: string | null })[]
  )
    .filter((criterion) => !criterion.deleted_at)
    .sort((a, b) => a.order - b.order)
    .map((criterion) => ({
      ...criterion,
      weight: Number(criterion.weight),
      rubric_levels: [...criterion.rubric_levels].sort((a, b) => a.score - b.score),
    }));

  if (!criteria.length) {
    return {
      ok: false,
      tone: "info",
      message: "La rúbrica todavía no tiene criterios. Podrás evaluar en cuanto la organización los añada.",
    };
  }

  const page = evaluationPage
    ? ({
        title: evaluationPage.title,
        description: evaluationPage.description,
        instructions: evaluationPage.instructions,
        requirements: Array.isArray(evaluationPage.requirements) ? evaluationPage.requirements : [],
        questions: Array.isArray(evaluationPage.questions) ? evaluationPage.questions : [],
      } as EvaluationPageConfig)
    : null;

  const now = Date.now();
  const locked =
    event.status === "closed" ||
    evaluationPage?.status === "closed" ||
    Boolean(evaluationPage?.opens_at && new Date(evaluationPage.opens_at).getTime() > now) ||
    Boolean(evaluationPage?.closes_at && new Date(evaluationPage.closes_at).getTime() <= now);

  return {
    ok: true,
    rubric: { id: rubric.id, name: rubric.name, scale_max: rubric.scale_max },
    criteria,
    page,
    locked,
    initial: evaluation
      ? {
          id: evaluation.id,
          status: evaluation.status,
          generalComment: evaluation.general_comment ?? "",
          shareWithTeam: evaluation.share_with_team ?? false,
          formAnswers:
            evaluation.form_answers &&
            typeof evaluation.form_answers === "object" &&
            !Array.isArray(evaluation.form_answers)
              ? (evaluation.form_answers as Record<string, string | boolean>)
              : {},
          scores: evaluation.evaluation_scores ?? [],
        }
      : null,
    notes: (notes ?? []) as unknown as Note[],
    aiEvidence,
    aiProcessing: (processingCount ?? 0) > 0,
    hasStudents: (((event.settings ?? {}) as { enabled_roles?: string[] }).enabled_roles ?? []).includes("student"),
  };
}
