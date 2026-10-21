import { AlertTriangle } from "lucide-react";
import Link from "next/link";

import type { Discrepancies } from "@/lib/app/results";

/** Avisos para revisar antes de cerrar; no cambia ninguna nota. */
export function DiscrepanciesPanel({
  discrepancies,
  minEvaluations,
  scaleMax,
  unitsLower,
}: {
  discrepancies: Discrepancies;
  minEvaluations: number;
  scaleMax: number;
  unitsLower: string;
}) {
  const { judges, criteria, underEvaluated } = discrepancies;
  if (!judges.length && !criteria.length && !underEvaluated.length) {
    return (
      <p className="rounded-xl border border-leaf-500/50 bg-leaf-500/10 p-4 text-sm">
        Sin discrepancias destacables: todos los {unitsLower} tienen al menos {minEvaluations} evaluación(es) y el jurado coincide.
      </p>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-orange-500/50 bg-orange-500/5 p-4">
      <h2 className="flex items-center gap-2 font-display text-xl">
        <AlertTriangle aria-hidden="true" className="size-5 text-orange-600" /> Para revisar antes de cerrar
      </h2>
      {underEvaluated.length ? (
        <div>
          <p className="text-sm font-semibold">Con menos de {minEvaluations} evaluación(es)</p>
          <ul className="mt-1 flex flex-wrap gap-2 text-sm">
            {underEvaluated.map((team) => (
              <li key={team.teamId}>
                <Link className="rounded-full border border-line px-2.5 py-0.5 hover:bg-muted dark:border-[#262838]" href={`/equipos/${team.teamId}`}>
                  {team.teamName} · {team.count}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {judges.length ? (
        <div>
          <p className="text-sm font-semibold">Evaluadores alejados del resto</p>
          <ul className="mt-1 space-y-1 text-sm">
            {judges.map((judge) => (
              <li key={judge.judgeId}>
                <strong>{judge.judgeName}</strong> puntúa de media {Math.abs(judge.bias)} puntos{" "}
                {judge.bias > 0 ? "por encima" : "por debajo"} del resto ({judge.evaluated} evaluaciones).
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {criteria.length ? (
        <div>
          <p className="text-sm font-semibold">Criterios con mucho desacuerdo (diferencia ≥ {scaleMax / 2} puntos)</p>
          <ul className="mt-1 space-y-1 text-sm">
            {criteria.slice(0, 15).map((item) => (
              <li key={`${item.teamId}-${item.criterion}`}>
                {item.teamName} · {item.criterion}: {item.spread} puntos entre la nota más alta y la más baja
              </li>
            ))}
            {criteria.length > 15 ? <li className="text-muted-foreground">… y {criteria.length - 15} más</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
