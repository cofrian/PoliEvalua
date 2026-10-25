import "server-only";

import { headers } from "next/headers";
import QRCode from "qrcode";

import type { SupabaseClient } from "@supabase/supabase-js";

/** Dirección pública de la votación de un espacio. */
export async function publicVoteUrl(slug: string) {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host");
  const protocol =
    list.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  const base = host
    ? `${protocol}://${host}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  return `${base}/votar/${slug}`;
}

/** QR en SVG, sin servicios externos. */
export function qrSvg(url: string) {
  return QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

/** Votos por grupo (la RLS solo deja leerlos a la gestión). */
export async function publicVoteCounts(supabase: SupabaseClient, eventId: string) {
  const [{ data: votes }, { data: teams }] = await Promise.all([
    supabase.from("public_votes").select("team_id").eq("event_id", eventId),
    supabase.from("teams").select("id, number, name").eq("event_id", eventId).order("number"),
  ]);
  const counts = new Map<string, number>();
  for (const vote of votes ?? []) counts.set(vote.team_id, (counts.get(vote.team_id) ?? 0) + 1);
  const total = votes?.length ?? 0;
  return {
    total,
    teams: (teams ?? [])
      .map((team) => ({ ...team, votes: counts.get(team.id) ?? 0 }))
      .sort((a, b) => b.votes - a.votes || (a.number ?? 0) - (b.number ?? 0)),
  };
}

export type PublicRubric = {
  scaleMin: number;
  scaleMax: number;
  criteria: { id: string; title: string; description: string | null; weight: number; levels: { score: number; label: string }[] }[];
};

/** Rúbrica activa del espacio, tal como la puntúa el público (sin criterios borrados). */
export async function publicRubric(client: SupabaseClient, eventId: string): Promise<PublicRubric | null> {
  const { data } = await client
    .from("rubrics")
    .select("scale_min, scale_max, rubric_criteria(id, title, description, weight, order, deleted_at, rubric_levels(score, label))")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return null;
  type Row = { id: string; title: string; description: string | null; weight: number; order: number | null; deleted_at: string | null; rubric_levels: { score: number; label: string }[] | null };
  const criteria = ((data.rubric_criteria ?? []) as Row[])
    .filter((criterion) => !criterion.deleted_at)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((criterion) => ({
      id: criterion.id,
      title: criterion.title,
      description: criterion.description,
      weight: Number(criterion.weight),
      levels: [...(criterion.rubric_levels ?? [])].sort((a, b) => a.score - b.score),
    }));
  return criteria.length ? { scaleMin: Number(data.scale_min), scaleMax: Number(data.scale_max), criteria } : null;
}

export type PublicResults = {
  mode: "favorite" | "rubric";
  /** Dispositivos que han votado o puntuado. */
  voters: number;
  /** value: votos (favorito) o nota media sobre 100 (rúbrica); count: votos o personas que lo puntuaron. */
  teams: { id: string; number: number | null; name: string; value: number; count: number }[];
};

/** Resultados del público según el modo: votos por proyecto o nota media con la rúbrica. */
export async function publicResults(supabase: SupabaseClient, eventId: string, mode: "favorite" | "rubric"): Promise<PublicResults> {
  if (mode === "favorite") {
    const counts = await publicVoteCounts(supabase, eventId);
    return { mode, voters: counts.total, teams: counts.teams.map((team) => ({ ...team, value: team.votes, count: team.votes })) };
  }
  const [{ data: scores }, { data: teams }, rubric] = await Promise.all([
    supabase.from("public_scores").select("team_id, voter_hash, criterion_id, score").eq("event_id", eventId),
    supabase.from("teams").select("id, number, name").eq("event_id", eventId).order("number"),
    publicRubric(supabase, eventId),
  ]);
  const weights = new Map(rubric?.criteria.map((criterion) => [criterion.id, criterion.weight]) ?? []);
  const span = rubric ? Math.max(1, rubric.scaleMax - rubric.scaleMin) : 1;
  // Nota de cada persona a cada proyecto (0-100, ponderada como la del jurado) y media por proyecto.
  const perVoter = new Map<string, { sum: number; weight: number }>();
  for (const row of scores ?? []) {
    const weight = weights.get(row.criterion_id);
    if (!weight || !rubric) continue;
    const key = `${row.team_id}|${row.voter_hash}`;
    const entry = perVoter.get(key) ?? { sum: 0, weight: 0 };
    entry.sum += ((Number(row.score) - rubric.scaleMin) / span) * weight;
    entry.weight += weight;
    perVoter.set(key, entry);
  }
  const byTeam = new Map<string, number[]>();
  for (const [key, { sum, weight }] of perVoter) {
    const teamId = key.split("|")[0];
    byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), (sum / weight) * 100]);
  }
  return {
    mode,
    voters: new Set((scores ?? []).map((row) => row.voter_hash)).size,
    teams: (teams ?? [])
      .map((team) => {
        const notes = byTeam.get(team.id) ?? [];
        const value = notes.length ? Math.round((notes.reduce((a, b) => a + b, 0) / notes.length) * 10) / 10 : 0;
        return { ...team, value, count: notes.length };
      })
      .sort((a, b) => b.value - a.value || (a.number ?? 0) - (b.number ?? 0)),
  };
}
