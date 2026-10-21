// Coevaluación: configuración (events.settings.peer_review), reparto de grupos
// a evaluar y combinación de notas.

export type PeerReviewSettings = {
  enabled: boolean;
  peer: boolean;
  self: boolean;
  contribution: boolean;
  reviewsPerStudent: number;
  anonymous: boolean;
  weights: { teacher: number; peer: number; self: number };
};

export function peerReviewSettings(settings: unknown): PeerReviewSettings {
  const raw =
    settings && typeof settings === "object" && "peer_review" in settings
      ? ((settings as { peer_review?: Record<string, unknown> }).peer_review ?? {})
      : {};
  const weights = (raw.weights ?? {}) as Record<string, unknown>;
  return {
    enabled: raw.enabled === true,
    peer: raw.peer !== false,
    self: raw.self === true,
    contribution: raw.contribution === true,
    reviewsPerStudent: Math.min(10, Math.max(1, Number(raw.reviews_per_student) || 2)),
    anonymous: raw.anonymous !== false,
    weights: {
      teacher: Number(weights.teacher ?? 80),
      peer: Number(weights.peer ?? 20),
      self: Number(weights.self ?? 0),
    },
  };
}

/**
 * Reparte a cada estudiante `perStudent` grupos que no son el suyo, de forma
 * que todos los grupos reciban un número parecido de revisiones.
 */
export function assignPeerReviews(
  students: { userId: string; teamId: string }[],
  teamIds: string[],
  perStudent: number,
) {
  const load = new Map(teamIds.map((id) => [id, 0]));
  const assignments: { reviewerId: string; teamId: string }[] = [];
  const shuffled = [...students].sort(() => Math.random() - 0.5);

  for (const student of shuffled) {
    const candidates = teamIds
      .filter((id) => id !== student.teamId)
      .sort((a, b) => load.get(a)! - load.get(b)! || Math.random() - 0.5)
      .slice(0, perStudent);
    for (const teamId of candidates) {
      load.set(teamId, load.get(teamId)! + 1);
      assignments.push({ reviewerId: student.userId, teamId });
    }
  }
  return assignments;
}

/** Total sobre 100 a partir de medias por criterio (id → media en la escala). */
export function weightedTotal(
  averages: Record<string, number | null | undefined>,
  criteria: { id: string; weight: number }[],
  scaleMax: number,
) {
  let any = false;
  const total = criteria.reduce((sum, criterion) => {
    const value = averages[criterion.id];
    if (typeof value !== "number") return sum;
    any = true;
    return sum + (Math.min(value, scaleMax) / scaleMax) * criterion.weight;
  }, 0);
  return any ? Math.round(total * 100) / 100 : null;
}

/**
 * Nota combinada sobre 100: media ponderada de las partes que existen. Si falta
 * una parte (p. ej. nadie se autoevaluó), su peso se reparte entre las demás.
 */
export function combinedGrade(
  parts: { teacher: number | null; peer: number | null; self: number | null },
  weights: PeerReviewSettings["weights"],
) {
  const entries = (Object.keys(weights) as (keyof typeof weights)[])
    .filter((key) => parts[key] !== null && weights[key] > 0)
    .map((key) => [parts[key] as number, weights[key]] as const);
  const weightSum = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (!weightSum) return null;
  return Math.round((entries.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightSum) * 100) / 100;
}
