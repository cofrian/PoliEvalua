import { getFormatter, getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/app/session";

export default async function AuditPage() {
  const { supabase, event } = await getSession();
  const [t, format] = await Promise.all([getTranslations("auditAdmin"), getFormatter()]);
  const [{ data: entries }, { data: memberships }, { data: rubricChanges }] =
    await Promise.all([
      supabase
        .from("audit_log")
        .select("id, user_id, action, entity, payload, created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(300),
      supabase
        .from("event_members")
        .select("user_id, profile:profiles!event_members_user_id_fkey(id, full_name)")
        .eq("event_id", event.id),
      supabase
        .from("rubric_changes")
        .select("id, user_id, summary, created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  const name = (id: string | null) => {
    const relation = memberships?.find((member) => member.user_id === id)?.profile as
      | { id: string; full_name: string }
      | { id: string; full_name: string }[]
      | null
      | undefined;
    return (Array.isArray(relation) ? relation[0] : relation)?.full_name ?? "—";
  };

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
      what: t("rubric"),
      detail: c.summary ?? "",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
          <tr>
            <th className="px-3 py-2">{t("when")}</th>
            <th className="px-3 py-2">{t("who")}</th>
            <th className="px-3 py-2">{t("action")}</th>
            <th className="px-3 py-2">{t("detail")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row) => (
              <tr className="border-b border-border align-top last:border-0" key={row.key}>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {format.dateTime(new Date(row.at), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
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
                {t("empty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </div>
  );
}
