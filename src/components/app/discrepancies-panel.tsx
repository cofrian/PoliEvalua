import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("discrepancies");
  if (!judges.length && !criteria.length && !underEvaluated.length) {
    return (
      <p className="rounded-xl border border-leaf-500/50 bg-leaf-500/10 p-4 text-sm">
        {t("none", { units: unitsLower, count: minEvaluations })}
      </p>
    );
  }

  return (
    <section className="space-y-4 rounded-xl border border-orange-500/50 bg-orange-500/5 p-4">
      <h2 className="flex items-center gap-2 font-display text-xl">
        <AlertTriangle aria-hidden="true" className="size-5 text-orange-600" /> {t("title")}
      </h2>
      {underEvaluated.length ? (
        <div>
          <p className="text-sm font-semibold">{t("under", { count: minEvaluations })}</p>
          <ul className="mt-1 flex flex-wrap gap-2 text-sm">
            {underEvaluated.map((team) => (
              <li key={team.teamId}>
                <Link className="rounded-full border border-border px-2.5 py-0.5 hover:bg-muted" href={`/equipos/${team.teamId}`}>
                  {team.teamName} · {team.count}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {judges.length ? (
        <div>
          <p className="text-sm font-semibold">{t("judges")}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {judges.map((judge) => (
              <li key={judge.judgeId}>
                {t.rich("judgeBias", {
                  name: judge.judgeName,
                  points: Math.abs(judge.bias),
                  direction: judge.bias > 0 ? "above" : "below",
                  count: judge.evaluated,
                  strong: (chunks) => <strong>{chunks}</strong>,
                })}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {criteria.length ? (
        <div>
          <p className="text-sm font-semibold">{t("criteria", { points: scaleMax / 2 })}</p>
          <ul className="mt-1 space-y-1 text-sm">
            {criteria.slice(0, 15).map((item) => (
              <li key={`${item.teamId}-${item.criterion}`}>
                {t("spread", { team: item.teamName, criterion: item.criterion, points: item.spread })}
              </li>
            ))}
            {criteria.length > 15 ? <li className="text-muted-foreground">{t("more", { count: criteria.length - 15 })}</li> : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
