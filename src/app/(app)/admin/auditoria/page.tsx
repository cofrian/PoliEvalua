import { getSession } from "@/lib/app/session";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export default async function AuditPage() {
  const { supabase } = await getSession();
  const [{ data: entries }, { data: profiles }, { data: rubricChanges }] =
    await Promise.all([
      supabase
        .from("audit_log")
        .select("id, user_id, action, entity, payload, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("profiles").select("id, full_name"),
      supabase
        .from("rubric_changes")
        .select("id, user_id, summary, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  const name = (id: string | null) =>
    profiles?.find((p) => p.id === id)?.full_name ?? "—";

  const rows = [
    ...(entries ?? []).map((e) => ({
      key: `a${e.id}`,
      at: e.created_at,
      who: name(e.user_id),
      what: e.action.replaceAll("_", " "),
      detail: e.payload ? JSON.stringify(e.payload) : "",
    })),
    ...(rubricChanges ?? []).map((c) => ({
      key: `r${c.id}`,
      at: c.created_at,
      who: name(c.user_id),
      what: "rúbrica",
      detail: c.summary ?? "",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-white dark:border-[#262838] dark:bg-[#151621]">
      <table className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-muted-foreground uppercase dark:border-[#262838]">
          <tr>
            <th className="px-3 py-2">Cuándo</th>
            <th className="px-3 py-2">Quién</th>
            <th className="px-3 py-2">Acción</th>
            <th className="px-3 py-2">Detalle</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr className="border-b border-line align-top last:border-0 dark:border-[#262838]" key={row.key}>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {dateFormat.format(new Date(row.at))}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{row.who}</td>
                <td className="px-3 py-2 whitespace-nowrap font-semibold">{row.what}</td>
                <td className="max-w-md px-3 py-2 text-xs break-words text-muted-foreground">
                  {row.detail}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="px-3 py-6 text-center text-muted-foreground" colSpan={4}>
                Todavía no hay actividad registrada.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
