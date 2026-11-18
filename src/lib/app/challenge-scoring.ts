/**
 * Cómo se puntúa cada reto.
 *  - general: solo la rúbrica general del espacio.
 *  - general_plus: general + criterios propios, mezclados con generalWeight %.
 *  - own: solo los criterios propios del reto.
 */
export type ScoringMode = "general" | "general_plus" | "own";

export type ChallengeScoring = {
  id: string;
  name: string;
  scoringMode: ScoringMode;
  generalWeight: number;
  rubricId: string | null;
};

export const SCORING_MODES: ScoringMode[] = ["general", "general_plus", "own"];

export function asScoringMode(value: unknown): ScoringMode {
  return SCORING_MODES.includes(value as ScoringMode) ? (value as ScoringMode) : "general";
}

export function clampWeight(value: unknown, fallback = 60) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : fallback;
}

/** ¿El reto usa criterios propios? Solo entonces tiene sentido su rúbrica. */
export function usesOwnRubric(challenge: Pick<ChallengeScoring, "scoringMode" | "rubricId">) {
  return challenge.scoringMode !== "general" && Boolean(challenge.rubricId);
}

/**
 * Rúbricas con las que se evalúa a un grupo, sin repetir: la general si algún
 * reto suyo la usa (o si no tiene retos) y la propia de cada reto que la tenga.
 */
export function rubricsForTeam(
  generalRubricId: string | null,
  teamChallenges: Pick<ChallengeScoring, "scoringMode" | "rubricId">[],
) {
  const ids: string[] = [];
  const needsGeneral =
    !teamChallenges.length || teamChallenges.some((challenge) => !usesOwnRubric(challenge) || challenge.scoringMode === "general_plus");
  if (generalRubricId && needsGeneral) ids.push(generalRubricId);
  for (const challenge of teamChallenges) {
    if (usesOwnRubric(challenge) && !ids.includes(challenge.rubricId!)) ids.push(challenge.rubricId!);
  }
  return ids;
}

/**
 * Nota de un reto (sobre 100) a partir de la nota general y la de sus
 * criterios propios. Si falta una parte necesaria, no hay nota.
 * Ejemplo: general 80, propia 90, 60 % general → 80·0,6 + 90·0,4 = 84.
 */
export function combineScore(
  challenge: Pick<ChallengeScoring, "scoringMode" | "generalWeight" | "rubricId"> | null,
  general: number | null,
  own: number | null,
) {
  if (!challenge || !usesOwnRubric(challenge)) return general;
  if (challenge.scoringMode === "own") return own;
  if (general === null || own === null) return null;
  const w = challenge.generalWeight / 100;
  return Math.round((general * w + own * (1 - w)) * 100) / 100;
}

/**
 * Un jurado tiene una evaluación por rúbrica (general y retos). Para contar
 * evaluaciones se queda una por grupo y jurado; manda la que esté enviada.
 */
export function onePerJudge<T extends { team_id: string; judge_id: string; status: string }>(rows: T[]) {
  const map = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.team_id}:${row.judge_id}`;
    const current = map.get(key);
    if (!current || (current.status !== "submitted" && row.status === "submitted")) map.set(key, row);
  }
  return [...map.values()];
}
