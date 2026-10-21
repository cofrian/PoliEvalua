import type { SupabaseClient } from "@supabase/supabase-js";

const timeFormat = new Intl.DateTimeFormat("es-ES", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const cell = "px-3 py-2";

// Todas las evaluaciones (borradores incluidos), tal y como están ahora mismo.
export async function LiveVotes({
  supabase,
  criteria,
  eventId,
  scaleMax,
}: {
  supabase: SupabaseClient;
  criteria: { id: string; title: string; weight: number }[];
  eventId: string;
  scaleMax: number;
}) {
  const [{ data: evaluations }, { data: teams }, { data: profiles }] = await Promise.all([
    supabase
      .from("evaluations")
      .select("id, team_id, judge_id, status, updated_at, evaluation_scores(criterion_id, score)")
      .eq("event_id", eventId)
      .order("updated_at", { ascending: false }),
    supabase.from("teams").select("id, number, name").eq("event_id", eventId),
    supabase
      .from("event_members")
      .select("user_id, profile:profiles!event_members_user_id_fkey(id, full_name)")
      .eq("event_id", eventId),
  ]);

  const rows = (evaluations ?? []).map((evaluation) => {
    const scores = Object.fromEntries(
      ((evaluation.evaluation_scores ?? []) as { criterion_id: string; score: number | null }[]).map(
        (s) => [s.criterion_id, s.score],
      ),
    );
    const total = criteria.reduce((sum, c) => {
      const score = scores[c.id];
      return score ? sum + (score / scaleMax) * c.weight : sum;
    }, 0);
    const team = teams?.find((t) => t.id === evaluation.team_id);
    return {
      id: evaluation.id,
      team: team ? `#${team.number} ${team.name}` : "—",
      judge: (() => {
        const relation = profiles?.find((p) => p.user_id === evaluation.judge_id)?.profile as
          | { id: string; full_name: string }
          | { id: string; full_name: string }[]
          | null
          | undefined;
        return (Array.isArray(relation) ? relation[0] : relation)?.full_name ?? "—";
      })(),
      status: evaluation.status as string,
      updatedAt: evaluation.updated_at as string,
      scores,
      total: Math.round(total * 100) / 100,
      scored: criteria.filter((c) => scores[c.id]).length,
    };
  });

  const submitted = rows.filter((r) => r.status === "submitted").length;

  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">Votaciones en directo</h2>
      <p className="text-sm text-muted-foreground">
        {rows.length} evaluaciones · {submitted} enviadas · {rows.length - submitted} en
        borrador. Se actualiza solo cada vez que un juez puntúa.
      </p>
      <div className="overflow-x-auto rounded-xl border border-line bg-white dark:border-[#262838] dark:bg-[#151621]">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs text-muted-foreground uppercase dark:border-[#262838]">
            <tr>
              <th className={cell}>Hora</th>
              <th className={cell}>Juez</th>
              <th className={cell}>Equipo</th>
              <th className={cell}>Estado</th>
              {criteria.map((c) => (
                <th className={`${cell} text-center`} key={c.id} title={c.title}>
                  {c.title.split(/[\s/]+/)[0]}
                </th>
              ))}
              <th className={`${cell} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.length ? (
              rows.map((row) => (
                <tr className="border-b border-line last:border-0 dark:border-[#262838]" key={row.id}>
                  <td className={`${cell} whitespace-nowrap text-muted-foreground`}>
                    {timeFormat.format(new Date(row.updatedAt))}
                  </td>
                  <td className={`${cell} whitespace-nowrap`}>{row.judge}</td>
                  <td className={`${cell} whitespace-nowrap`}>{row.team}</td>
                  <td className={cell}>
                    {row.status === "submitted" ? (
                      <span className="rounded-full bg-leaf-500/15 px-2 py-0.5 text-xs font-semibold">
                        ✔ Enviada
                      </span>
                    ) : (
                      <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-semibold">
                        Borrador {row.scored}/{criteria.length}
                      </span>
                    )}
                  </td>
                  {criteria.map((c) => (
                    <td className={`${cell} text-center`} key={c.id}>
                      {row.scores[c.id] ?? "·"}
                    </td>
                  ))}
                  <td className={`${cell} text-right font-bold`}>{row.total}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="px-3 py-6 text-center text-muted-foreground" colSpan={5 + criteria.length}>
                  Nadie ha empezado a evaluar todavía.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
