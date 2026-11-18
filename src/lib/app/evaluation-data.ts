import "server-only";

import { getTranslations } from "next-intl/server";

import type { AiEvidence } from "@/components/app/ai-evidence-panel";
import type { Criterion, EvaluationPageConfig, ExtraRubric } from "@/components/app/evaluation-form";
import { asScoringMode, rubricsForTeam } from "@/lib/app/challenge-scoring";
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
      /** Título de la rúbrica principal cuando el grupo tiene varias. */
      primaryTitle: string;
      /** Rúbricas de retos con criterios propios, en la misma pantalla. */
      extraRubrics: ExtraRubric[];
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
  const t = await getTranslations("evaluationContext");

  if (!canVote) {
    return {
      ok: false,
      tone: "info",
      message: t("cannotVote", { role: role === "mentor" || role === "student" ? role : "viewer" }),
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
      message: t("notAssigned"),
    };
  }

  const [{ data: rubricRows }, { data: team }, { data: extraChallenges }, { data: evaluationPage }] = await Promise.all([
    supabase
      .from("rubrics")
      .select(
        "id, name, is_active, challenge_id, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, rubric_levels(score, label, descriptor, example))",
      )
      .eq("event_id", event.id),
    supabase.from("teams").select("challenge_id").eq("event_id", event.id).eq("id", teamId).maybeSingle(),
    supabase.from("team_challenges").select("challenge_id").eq("event_id", event.id).eq("team_id", teamId),
    supabase
      .from("evaluation_pages")
      .select("title, description, instructions, requirements, questions, status, opens_at, closes_at")
      .eq("event_id", event.id)
      .maybeSingle(),
  ]);

  // Rúbricas del grupo: la general y las propias de sus retos, sin repetir.
  const challengeIds = [team?.challenge_id, ...(extraChallenges ?? []).map((row) => row.challenge_id)].filter(
    (id): id is string => Boolean(id),
  );
  const { data: challenges } = challengeIds.length
    ? await supabase.from("challenges").select("id, name, scoring_mode, rubric_id").eq("event_id", event.id).in("id", challengeIds)
    : { data: [] as { id: string; name: string; scoring_mode: string; rubric_id: string | null }[] };
  const generalRubric = (rubricRows ?? []).find((row) => row.is_active && !row.challenge_id) ?? null;
  const rubricIds = rubricsForTeam(
    generalRubric?.id ?? null,
    (challenges ?? []).map((challenge) => ({
      scoringMode: asScoringMode(challenge.scoring_mode),
      rubricId: challenge.rubric_id ?? null,
    })),
  );
  const teamRubrics = rubricIds
    .map((id) => (rubricRows ?? []).find((row) => row.id === id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row));
  const rubric = teamRubrics[0];
  if (!rubric) return { ok: false, tone: "info", message: t("noRubric") };
  const tSections = await getTranslations("evalForm");
  const rubricTitle = (row: (typeof teamRubrics)[number]) => {
    if (!row.challenge_id) return tSections("sectionGeneral");
    const challenge = (challenges ?? []).find((item) => item.id === row.challenge_id);
    return tSections("sectionChallenge", { name: challenge?.name ?? row.name });
  };
  if (evaluationPage?.status === "draft" && !isAdmin) {
    return { ok: false, tone: "info", message: t("pageDraft") };
  }

  const [{ data: judgeEvaluations }, { data: notes }, { data: reports }, { count: processingCount }] =
    await Promise.all([
      supabase
        .from("evaluations")
        .select("id, rubric_id, status, general_comment, share_with_team, form_answers, evaluation_scores(criterion_id, score, comment)")
        .eq("event_id", event.id)
        .eq("team_id", teamId)
        .eq("judge_id", user.id)
        .in("rubric_id", rubricIds),
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
          t("presentation"),
        criteria: (report.criteria_evidence ?? []) as CriterionEvidence[],
        questions: (report.questions ?? []) as string[],
        risks: (report.risks ?? []) as string[],
        weaknesses: (report.weaknesses ?? []) as JuryWeakness[],
      }
    : null;

  const criteriaOf = (row: (typeof teamRubrics)[number]): Criterion[] =>
    ((row.rubric_criteria ?? []) as unknown as (Criterion & { order: number; deleted_at: string | null })[])
      .filter((criterion) => !criterion.deleted_at)
      .sort((a, b) => a.order - b.order)
      .map((criterion) => ({
        ...criterion,
        weight: Number(criterion.weight),
        rubric_levels: [...criterion.rubric_levels].sort((a, b) => a.score - b.score),
      }));
  const criteria = criteriaOf(rubric);
  const extraRubrics: ExtraRubric[] = teamRubrics
    .slice(1)
    .map((row) => ({ id: row.id, title: rubricTitle(row), scaleMax: row.scale_max, criteria: criteriaOf(row) }))
    .filter((row) => row.criteria.length);
  const evaluation = (judgeEvaluations ?? []).find((row) => row.rubric_id === rubric.id) ?? null;
  const allScores = (judgeEvaluations ?? []).flatMap((row) => row.evaluation_scores ?? []);

  if (!criteria.length) {
    return {
      ok: false,
      tone: "info",
      message: t("noCriteria"),
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
    primaryTitle: rubricTitle(rubric),
    extraRubrics,
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
          scores: allScores,
        }
      : null,
    notes: (notes ?? []) as unknown as Note[],
    aiEvidence,
    aiProcessing: (processingCount ?? 0) > 0,
    hasStudents: (((event.settings ?? {}) as { enabled_roles?: string[] }).enabled_roles ?? []).includes("student"),
  };
}
