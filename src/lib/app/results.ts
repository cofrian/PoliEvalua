import type { SupabaseClient } from "@supabase/supabase-js";

export type JudgeEvaluation = {
  judgeId: string;
  judgeName: string;
  total: number;
  generalComment: string | null;
  scores: Record<string, { score: number | null; comment: string | null }>;
};

export type TeamResult = {
  teamId: string;
  number: number | null;
  name: string;
  challengeId: string | null;
  average: number | null;
  stddev: number | null;
  min: number | null;
  max: number | null;
  criterionAverages: Record<string, number | null>;
  evaluations: JudgeEvaluation[];
};

export type ResultsData = {
  challenges: { id: string; name: string }[];
  criteria: { id: string; title: string; weight: number }[];
  scaleMax: number;
  teams: TeamResult[];
};

const round = (n: number) => Math.round(n * 100) / 100;

// Reúne todo lo necesario para resultados y exportaciones. Solo cuentan las
// evaluaciones enviadas y siempre con la rúbrica actual (pesos vigentes).
export async function loadResults(
  supabase: SupabaseClient,
  eventId: string | null | undefined,
): Promise<ResultsData> {
  const [
    { data: challenges },
    { data: teams },
    { data: rubric },
    { data: evaluations },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("challenges").select("id, name").order("order"),
    supabase.from("teams").select("id, number, name, challenge_id").order("number"),
    supabase
      .from("rubrics")
      .select("id, scale_max, rubric_criteria(id, title, weight, order, deleted_at)")
      .eq("is_active", true)
      .eq("event_id", eventId ?? "")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("evaluations")
      .select(
        "id, team_id, judge_id, general_comment, evaluation_scores(criterion_id, score, comment)",
      )
      .eq("status", "submitted"),
    supabase.from("profiles").select("id, full_name"),
  ]);

  const scaleMax = rubric?.scale_max ?? 5;
  const criteria = (
    (rubric?.rubric_criteria ?? []) as {
      id: string;
      title: string;
      weight: number;
      order: number;
      deleted_at: string | null;
    }[]
  )
    .filter((c) => !c.deleted_at)
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ id: c.id, title: c.title, weight: Number(c.weight) }));

  const results: TeamResult[] = (teams ?? []).map((team) => {
    const teamEvals: JudgeEvaluation[] = (evaluations ?? [])
      .filter((e) => e.team_id === team.id)
      .map((e) => {
        const scores = Object.fromEntries(
          (
            (e.evaluation_scores ?? []) as {
              criterion_id: string;
              score: number | null;
              comment: string | null;
            }[]
          ).map((s) => [s.criterion_id, { score: s.score, comment: s.comment }]),
        );
        const total = criteria.reduce((sum, c) => {
          const score = scores[c.id]?.score;
          return score ? sum + (score / scaleMax) * c.weight : sum;
        }, 0);
        return {
          judgeId: e.judge_id,
          judgeName: profiles?.find((p) => p.id === e.judge_id)?.full_name ?? "—",
          total: round(total),
          generalComment: e.general_comment,
          scores,
        };
      })
      .sort((a, b) => b.total - a.total);

    const totals = teamEvals.map((e) => e.total);
    const average = totals.length
      ? totals.reduce((a, b) => a + b, 0) / totals.length
      : null;
    const stddev =
      totals.length > 1 && average !== null
        ? Math.sqrt(
            totals.reduce((sum, t) => sum + (t - average) ** 2, 0) /
              (totals.length - 1),
          )
        : null;

    const criterionAverages = Object.fromEntries(
      criteria.map((c) => {
        const values = teamEvals
          .map((e) => e.scores[c.id]?.score)
          .filter((v): v is number => typeof v === "number");
        return [
          c.id,
          values.length ? round(values.reduce((a, b) => a + b, 0) / values.length) : null,
        ];
      }),
    );

    return {
      teamId: team.id,
      number: team.number,
      name: team.name,
      challengeId: team.challenge_id,
      average: average === null ? null : round(average),
      stddev: stddev === null ? null : round(stddev),
      min: totals.length ? Math.min(...totals) : null,
      max: totals.length ? Math.max(...totals) : null,
      criterionAverages,
      evaluations: teamEvals,
    };
  });

  results.sort((a, b) => (b.average ?? -1) - (a.average ?? -1));

  return { challenges: challenges ?? [], criteria, scaleMax, teams: results };
}
