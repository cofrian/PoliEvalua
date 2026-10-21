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
