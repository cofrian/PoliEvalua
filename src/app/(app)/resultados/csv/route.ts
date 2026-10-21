import Papa from "papaparse";
import { NextResponse } from "next/server";

import { loadResults } from "@/lib/app/results";
import { getSession } from "@/lib/app/session";

export async function GET(request: Request) {
  const { supabase, isAdmin, eventClosed, event } = await getSession();
  if (!isAdmin && !eventClosed) return new NextResponse("No autorizado", { status: 403 });

  const { challenges, criteria, teams } = await loadResults(supabase, event.id);
  const challengeName = (id: string | null) =>
    challenges.find((c) => c.id === id)?.name ?? "";

  // ?tipo=ranking → una fila por equipo; por defecto, una fila por juez y equipo.
  const ranking = new URL(request.url).searchParams.get("tipo") === "ranking";

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
