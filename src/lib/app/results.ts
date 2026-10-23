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

/**
 * Secciones de resultados: una por reto y otra con lo que no tiene reto. En
 * una asignatura (sin retos) todo queda en una sola sección.
 */
export function resultSections(data: ResultsData, fallbackTitle: string, noChallengeTitle: string) {
  const known = new Set(data.challenges.map((challenge) => challenge.id));
  return [
    ...data.challenges.map((challenge) => ({
      id: challenge.id,
      name: challenge.name,
      teams: data.teams.filter((team) => team.challengeId === challenge.id),
    })),
    {
      id: "none",
      name: data.challenges.length ? noChallengeTitle : fallbackTitle,
      teams: data.teams.filter((team) => !team.challengeId || !known.has(team.challengeId)),
    },
  ].filter((section) => section.teams.length);
}

export type PeerTotals = {
  /** Por grupo: total sobre 100 de compañeros y de la autoevaluación. */
  teams: Map<string, { peer: number | null; self: number | null; peerCount: number }>;
  /** Por integrante (team_members.id): aportación media de 1 a 5. */
  contribution: Map<string, number>;
};

/** Coevaluación agregada (solo la gestión puede leer las respuestas). */
export async function loadPeerTotals(
  supabase: SupabaseClient,
  eventId: string,
  data: ResultsData,
): Promise<PeerTotals> {
  const [{ data: reviews }, { data: contributions }] = await Promise.all([
    supabase.from("peer_reviews").select("team_id, kind, scores").eq("event_id", eventId).eq("status", "submitted"),
    supabase.from("contribution_reviews").select("member_id, score").eq("event_id", eventId),
  ]);

  const totalOf = (rows: { scores: unknown }[]) => {
    if (!rows.length) return null;
    const averages = Object.fromEntries(
      data.criteria.map((criterion) => {
        const values = rows
          .map((row) => (row.scores as Record<string, number>)[criterion.id])
          .filter((value): value is number => typeof value === "number");
        return [criterion.id, values.length ? values.reduce((a, b) => a + b, 0) / values.length : null];
      }),
    );
    let any = false;
    const total = data.criteria.reduce((sum, criterion) => {
      const value = averages[criterion.id];
      if (typeof value !== "number") return sum;
      any = true;
      return sum + (Math.min(value, data.scaleMax) / data.scaleMax) * criterion.weight;
    }, 0);
    return any ? round(total) : null;
  };

  const teams = new Map(
    data.teams.map((team) => {
      const peer = (reviews ?? []).filter((row) => row.team_id === team.teamId && row.kind === "peer");
      const self = (reviews ?? []).filter((row) => row.team_id === team.teamId && row.kind === "self");
      return [team.teamId, { peer: totalOf(peer), self: totalOf(self), peerCount: peer.length }];
    }),
  );

  const byMember = new Map<string, number[]>();
  for (const row of contributions ?? []) {
    byMember.set(row.member_id, [...(byMember.get(row.member_id) ?? []), row.score]);
  }
  const contribution = new Map(
    [...byMember.entries()].map(([id, values]) => [id, round(values.reduce((a, b) => a + b, 0) / values.length)]),
  );

  return { teams, contribution };
}

export type Discrepancies = {
  /** Evaluadores que puntúan sistemáticamente por encima o por debajo de los demás. */
  judges: { judgeId: string; judgeName: string; bias: number; evaluated: number }[];
  /** Criterios en los que el jurado no se pone de acuerdo para un grupo. */
  criteria: { teamId: string; teamName: string; criterion: string; spread: number }[];
  /** Grupos con menos evaluaciones de las necesarias. */
  underEvaluated: { teamId: string; teamName: string; count: number }[];
};

/**
 * Señales para revisar antes de cerrar. El sesgo de un evaluador es la media de
 * (su total − la media del grupo sin contarle a él), en puntos sobre 100.
 */
export function findDiscrepancies(data: ResultsData, minEvaluations: number): Discrepancies {
  const biasByJudge = new Map<string, { name: string; deltas: number[] }>();
  for (const team of data.teams) {
    if (team.evaluations.length < 2) continue;
    const sum = team.evaluations.reduce((total, evaluation) => total + evaluation.total, 0);
    for (const evaluation of team.evaluations) {
      const others = (sum - evaluation.total) / (team.evaluations.length - 1);
      const entry = biasByJudge.get(evaluation.judgeId) ?? { name: evaluation.judgeName, deltas: [] };
      entry.deltas.push(evaluation.total - others);
      biasByJudge.set(evaluation.judgeId, entry);
    }
  }
  const judges = [...biasByJudge.entries()]
    .map(([judgeId, entry]) => ({
      judgeId,
      judgeName: entry.name,
      evaluated: entry.deltas.length,
      bias: round(entry.deltas.reduce((a, b) => a + b, 0) / entry.deltas.length),
    }))
    .filter((judge) => judge.evaluated >= 2 && Math.abs(judge.bias) >= 10)
    .sort((a, b) => Math.abs(b.bias) - Math.abs(a.bias));

  // Desacuerdo en un criterio: diferencia entre la nota más alta y la más baja
  // de al menos la mitad de la escala.
  const criteria = data.teams
    .flatMap((team) =>
      data.criteria.map((criterion) => {
        const values = team.evaluations
          .map((evaluation) => evaluation.scores[criterion.id]?.score)
          .filter((value): value is number => typeof value === "number");
        const spread = values.length >= 2 ? Math.max(...values) - Math.min(...values) : 0;
        return { teamId: team.teamId, teamName: team.name, criterion: criterion.title, spread };
      }),
    )
    .filter((item) => item.spread >= data.scaleMax / 2)
    .sort((a, b) => b.spread - a.spread);

  const underEvaluated = data.teams
    .filter((team) => team.evaluations.length < minEvaluations)
    .map((team) => ({ teamId: team.teamId, teamName: team.name, count: team.evaluations.length }));

  return { judges, criteria, underEvaluated };
}

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
    supabase.from("challenges").select("id, name").eq("event_id", eventId ?? "").order("order"),
    supabase.from("teams").select("id, number, name, challenge_id").eq("event_id", eventId ?? "").order("number"),
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
      .eq("event_id", eventId ?? "")
      .eq("status", "submitted"),
    supabase
      .from("event_members")
      .select("user_id, profile:profiles!event_members_user_id_fkey(id, full_name)")
      .eq("event_id", eventId ?? "")
      .eq("status", "active"),
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
        const profileRelation = (profiles ?? []).find(
          (profile) => profile.user_id === e.judge_id,
        )?.profile as unknown as
          | { id: string; full_name: string }
          | { id: string; full_name: string }[]
          | null
          | undefined;
        const judgeProfile = Array.isArray(profileRelation)
          ? profileRelation[0]
          : profileRelation;
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
          judgeName: judgeProfile?.full_name ?? "—",
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
