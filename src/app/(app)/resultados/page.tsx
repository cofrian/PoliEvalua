import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { LiveRefresh } from "@/components/app/live-refresh";
import { LiveVotes } from "@/components/app/live-votes";
import { PrintButton } from "@/components/app/print-button";
import { ResultsChart } from "@/components/app/results-chart";
import { Button } from "@/components/ui/button";
import { DiscrepanciesPanel } from "@/components/app/discrepancies-panel";
import { combinedGrade, peerReviewSettings } from "@/lib/app/peer-review";
import { findDiscrepancies, loadPeerTotals, loadResults, resultSections } from "@/lib/app/results";
import { getSession } from "@/lib/app/session";

const cell = "px-3 py-2";

export default async function ResultsPage() {
  const { supabase, isAdmin, eventClosed, event, words } = await getSession();
  if (!isAdmin && !eventClosed) redirect("/equipos");
  const t = await getTranslations("results");

  const [results, { data: evaluationPage }] = await Promise.all([
    loadResults(supabase, event.id),
    supabase.from("evaluation_pages").select("min_evaluations").eq("event_id", event.id).maybeSingle(),
  ]);
  const { criteria, scaleMax } = results;
  const minEvaluations = evaluationPage?.min_evaluations ?? 1;
  const settings = (event.settings ?? {}) as { enabled_roles?: string[] };
  const hasStudents = (settings.enabled_roles ?? []).includes("student");
  const peerSettings = peerReviewSettings(event.settings);
  const peer = isAdmin && peerSettings.enabled ? await loadPeerTotals(supabase, event.id, results) : null;
  const finalGrade = (teamId: string, teacher: number | null) => {
    const totals = peer?.teams.get(teamId);
    return combinedGrade({ teacher, peer: totals?.peer ?? null, self: totals?.self ?? null }, peerSettings.weights);
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
            {!eventClosed ? t("adminOnly") : ""}
          </p>
          {isAdmin ? (
            <div className="mt-2 print:hidden">
              <LiveRefresh eventId={event.id} />
            </div>
          ) : null}
        </div>
        <div className="flex gap-2 print:hidden">
          <Button asChild variant="outline">
            <a href="/resultados/csv?tipo=ranking">{t("csvRanking")}</a>
          </Button>
          <Button asChild variant="outline">
            <a href="/resultados/csv">{t("csvJudge")}</a>
          </Button>
          {hasStudents ? (
            <Button asChild variant="outline">
              <a href="/resultados/csv?tipo=acta" title={t("recordTitle")}>
                {t("record")}
              </a>
            </Button>
          ) : null}
          <PrintButton />
        </div>
      </div>

      {isAdmin ? (
        <div className="print:hidden">
          <LiveVotes criteria={criteria} eventId={event.id} scaleMax={scaleMax} supabase={supabase} />
        </div>
      ) : null}

      {isAdmin ? (
        <div className="print:hidden">
          <DiscrepanciesPanel
            discrepancies={findDiscrepancies(results, minEvaluations)}
            minEvaluations={minEvaluations}
            scaleMax={scaleMax}
            unitsLower={words.unitsLower}
          />
        </div>
      ) : null}

      {resultSections(results, words.units, t("noChallenge")).map((challenge) => {
        const ranking = challenge.teams;
        let position = 0;

        return (
          <section className="space-y-4 break-inside-avoid-page" key={challenge.id}>
            <h2 className="font-display text-xl">{challenge.name}</h2>

            <ResultsChart
              data={ranking
                .filter((t) => t.average !== null)
                .map((t) => ({
                  name: t.name,
                  media: t.average ?? 0,
                  dispersion: t.stddev ?? 0,
                }))}
            />

            <div className="overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
                  <tr>
                    <th className={cell}>#</th>
                    <th className={cell}>{words.unit}</th>
                    <th className={`${cell} text-right`}>{t("average")}</th>
                    {peer ? (
                      <>
                        <th className={`${cell} text-right`} title={t("peersTitle")}>{t("peers")}</th>
                        <th className={`${cell} text-right`} title={t("selfTitle")}>{t("self")}</th>
                        <th
                          className={`${cell} text-right`}
                          title={t("finalTitle", { evaluator: words.evaluator, teacher: peerSettings.weights.teacher, peer: peerSettings.weights.peer, self: peerSettings.weights.self })}
                        >
                          {t("final")}
                        </th>
                      </>
                    ) : null}
                    {criteria.map((c) => (
                      <th className={`${cell} text-right`} key={c.id} title={c.title}>
                        {c.title.split(/[\s/]+/)[0]} ({c.weight}%)
                      </th>
                    ))}
                    <th className={`${cell} text-right`}>{t("dispersion")}</th>
                    <th className={`${cell} text-right`}>{t("minMax")}</th>
                    <th className={`${cell} text-right`}>{t("judges")}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((team) => {
                    if (team.average !== null) position++;
                    return (
                      <tr
                        className="border-b border-border last:border-0"
                        key={team.teamId}
                      >
                        <td className={`${cell} font-bold`}>
                          {team.average !== null ? position : "–"}
                        </td>
                        <td className={cell}>
                          <span className="text-muted-foreground">#{team.number} </span>
                          {team.name}
                          {isAdmin && hasStudents && team.evaluations.length ? (
                            <Link
                              className="ml-2 text-xs font-semibold underline print:hidden"
                              href={`/resultados/grupo/${team.teamId}`}
                            >
                              {t("feedback")}
                            </Link>
                          ) : null}
                        </td>
                        <td className={`${cell} text-right font-bold`}>
                          {team.average ?? "–"}
                        </td>
                        {peer ? (
                          <>
                            <td className={`${cell} text-right`}>
                              {peer.teams.get(team.teamId)?.peer ?? "–"}
                              <span className="block text-xs text-muted-foreground">
                                {t("reviews", { count: peer.teams.get(team.teamId)?.peerCount ?? 0 })}
                              </span>
                            </td>
                            <td className={`${cell} text-right`}>{peer.teams.get(team.teamId)?.self ?? "–"}</td>
                            <td className={`${cell} text-right font-bold`}>{finalGrade(team.teamId, team.average) ?? "–"}</td>
                          </>
                        ) : null}
                        {criteria.map((c) => (
                          <td className={`${cell} text-right`} key={c.id}>
                            {team.criterionAverages[c.id] ?? "–"}
                          </td>
                        ))}
                        <td className={`${cell} text-right text-muted-foreground`}>
                          {team.stddev ?? "–"}
                        </td>
                        <td className={`${cell} text-right text-muted-foreground`}>
                          {team.min !== null ? `${team.min}–${team.max}` : "–"}
                        </td>
                        <td className={`${cell} text-right`}>{team.evaluations.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("legend", { scale: scaleMax })}
            </p>

            <div className="space-y-2">
              <h3 className="font-display text-xl">{t("byJudge")}</h3>
              {ranking
                .filter((t) => t.evaluations.length)
                .map((team) => (
                  <details
                    className="rounded-xl border border-border bg-white p-4 dark:bg-card"
                    key={team.teamId}
                  >
                    <summary className="cursor-pointer font-semibold">
                      {t("teamAverage", { name: team.name, average: team.average ?? "–" })}
                    </summary>
                    <div className="mt-3 space-y-4">
                      {team.evaluations.map((evaluation) => (
                        <div key={evaluation.judgeId}>
                          <p className="font-semibold">
                            {evaluation.judgeName} ·{" "}
                            <span className="font-display text-lg">{evaluation.total}</span>
                            /100
                          </p>
                          <ul className="mt-1 space-y-1 text-sm">
                            {criteria.map((c) => {
                              const s = evaluation.scores[c.id];
                              return (
                                <li key={c.id}>
                                  <span className="text-muted-foreground">{c.title}:</span>{" "}
                                  <strong>{s?.score ?? "–"}</strong>
                                  {s?.comment ? ` — ${s.comment}` : ""}
                                </li>
                              );
                            })}
                          </ul>
                          {evaluation.generalComment ? (
                            <p className="mt-1 text-sm italic">
                              «{evaluation.generalComment}»
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </details>
                ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
