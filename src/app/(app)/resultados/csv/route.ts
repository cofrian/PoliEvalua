import Papa from "papaparse";
import { NextResponse } from "next/server";

import { combinedGrade, peerReviewSettings } from "@/lib/app/peer-review";
import { loadPeerTotals, loadResults } from "@/lib/app/results";
import { getSession } from "@/lib/app/session";

export async function GET(request: Request) {
  const { supabase, isAdmin, eventClosed, event } = await getSession();
  if (!isAdmin && !eventClosed) return new NextResponse("No autorizado", { status: 403 });

  const results = await loadResults(supabase, event.id);
  const { challenges, criteria, teams } = results;
  const challengeName = (id: string | null) =>
    challenges.find((c) => c.id === id)?.name ?? "";

  const tipo = new URL(request.url).searchParams.get("tipo");

  // ?tipo=acta → una fila por estudiante con la nota de su grupo sobre 10,
  // lista para pasar a la hoja de calificaciones (p. ej. PoliformaT).
  if (tipo === "acta") {
    if (!isAdmin) return new NextResponse("No autorizado", { status: 403 });
    const peerSettings = peerReviewSettings(event.settings);
    const [{ data: members }, peer] = await Promise.all([
      supabase
        .from("team_members")
        .select("id, team_id, full_name, email")
        .eq("event_id", event.id)
        .order("full_name"),
      peerSettings.enabled ? loadPeerTotals(supabase, event.id, results) : Promise.resolve(null),
    ]);
    const byTeam = new Map(teams.map((team) => [team.teamId, team]));
    const tenth = (value: number | null | undefined) =>
      value === null || value === undefined ? "" : (value / 10).toFixed(2);
    const rows = (members ?? []).map((member) => {
      const team = byTeam.get(member.team_id);
      const peerTeam = peer?.teams.get(member.team_id);
      const final = peer
        ? combinedGrade(
            { teacher: team?.average ?? null, peer: peerTeam?.peer ?? null, self: peerTeam?.self ?? null },
            peerSettings.weights,
          )
        : (team?.average ?? null);
      return {
        correo: member.email ?? "",
        nombre: member.full_name,
        grupo: team?.name ?? "",
        nota_sobre_10: tenth(final),
        ...(peer
          ? {
              nota_profesorado: tenth(team?.average),
              nota_companeros: tenth(peerTeam?.peer),
              nota_autoevaluacion: tenth(peerTeam?.self),
              aportacion_1_a_5: peer.contribution.get(member.id) ?? "",
            }
          : {}),
        evaluaciones: team?.evaluations.length ?? 0,
      };
    });
    return new NextResponse("﻿" + Papa.unparse(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${event.slug}-acta.csv"`,
      },
    });
  }

  // ?tipo=ranking → una fila por equipo; por defecto, una fila por juez y equipo.
  const ranking = tipo === "ranking";

  const rows: Record<string, string | number>[] = ranking
    ? teams.map((team) => ({
        reto: challengeName(team.challengeId),
        equipo_numero: team.number ?? "",
        equipo: team.name,
        media: team.average ?? "",
        ...Object.fromEntries(
          criteria.map((c) => [c.title, team.criterionAverages[c.id] ?? ""]),
        ),
        dispersion: team.stddev ?? "",
        evaluaciones: team.evaluations.length,
      }))
    : teams.flatMap((team) =>
        team.evaluations.map((evaluation) => ({
          reto: challengeName(team.challengeId),
          equipo_numero: team.number ?? "",
          equipo: team.name,
          juez: evaluation.judgeName,
          total: evaluation.total,
          ...Object.fromEntries(
            criteria.flatMap((c) => [
              [c.title, evaluation.scores[c.id]?.score ?? ""],
              [`${c.title} (comentario)`, evaluation.scores[c.id]?.comment ?? ""],
            ]),
          ),
          comentario_general: evaluation.generalComment ?? "",
        })),
      );

  return new NextResponse("﻿" + Papa.unparse(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${event.slug}-${ranking ? "ranking" : "evaluaciones"}.csv"`,
    },
  });
}
