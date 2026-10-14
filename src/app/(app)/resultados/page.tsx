import { redirect } from "next/navigation";

import { getSession } from "@/lib/app/session";

export default async function ResultsPage() {
  const { supabase, isAdmin } = await getSession();
  if (!isAdmin) redirect("/equipos");

  const [{ data: challenges }, { data: results }, { data: teams }] =
    await Promise.all([
      supabase.from("challenges").select("id, name").order("order"),
      supabase
        .from("team_results")
        .select("team_id, name, challenge_id, avg_total, stddev_total, n_evaluations"),
      supabase.from("teams").select("id, number"),
    ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Resultados</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Media de las evaluaciones enviadas, sobre 100.
          </p>
        </div>
        <a
          className="rounded-md border border-line px-3 py-2 text-sm font-semibold hover:bg-navy-900/5 dark:border-[#262838] dark:hover:bg-white/10"
          href="/resultados/csv"
        >
          Exportar CSV
        </a>
      </div>

      {(challenges ?? []).map((challenge) => {
        const ranking = (results ?? [])
          .filter((row) => row.challenge_id === challenge.id)
          .sort(
            (a, b) => Number(b.avg_total ?? -1) - Number(a.avg_total ?? -1),
          );

        return (
          <section key={challenge.id}>
            <h2 className="mb-3 font-display text-2xl">{challenge.name}</h2>
            <div className="overflow-x-auto rounded-xl border border-line bg-white dark:border-[#262838] dark:bg-[#151621]">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left text-xs text-muted-foreground uppercase dark:border-[#262838]">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Equipo</th>
                    <th className="px-3 py-2 text-right">Media</th>
                    <th className="px-3 py-2 text-right">Dispersión</th>
                    <th className="px-3 py-2 text-right">Evaluaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((row, index) => (
                    <tr
                      className="border-b border-line last:border-0 dark:border-[#262838]"
                      key={row.team_id}
                    >
                      <td className="px-3 py-2 font-bold">
                        {row.n_evaluations ? index + 1 : "–"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="text-muted-foreground">
                          #{teams?.find((t) => t.id === row.team_id)?.number}{" "}
                        </span>
                        {row.name}
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        {row.avg_total ?? "–"}
                      </td>
                      <td className="px-3 py-2 text-right text-muted-foreground">
                        {row.stddev_total ?? "–"}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.n_evaluations}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
