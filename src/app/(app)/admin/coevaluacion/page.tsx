import { getTranslations } from "next-intl/server";

import { updatePeerReviewSettingsAction } from "@/app/(app)/admin/actions";
import { PageHeader } from "@/components/app/page-header";
import { PeerAssignButton } from "@/components/app/peer-assign-button";
import { SettingRow, SettingSwitch, SettingsForm } from "@/components/app/settings-form";
import { Input } from "@/components/ui/input";
import { peerReviewSettings } from "@/lib/app/peer-review";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function PeerReviewAdminPage() {
  const { supabase, event, words } = await getSession();
  const settings = peerReviewSettings(event.settings);
  const t = await getTranslations("peerAdmin");

  const [{ data: members }, { data: assignments }, { data: reviews }, { data: contributions }] = await Promise.all([
    supabase
      .from("team_members")
      .select("id, full_name, user_id, team:teams(name)")
      .eq("event_id", event.id)
      .order("full_name"),
    supabase.from("peer_assignments").select("reviewer_id").eq("event_id", event.id),
    supabase.from("peer_reviews").select("reviewer_id, kind, status").eq("event_id", event.id),
    supabase.from("contribution_reviews").select("reviewer_id").eq("event_id", event.id),
  ]);

  const rows = (members ?? []).map((member) => {
    const relation = member.team as unknown as { name: string } | { name: string }[] | null;
    const team = Array.isArray(relation) ? relation[0] : relation;
    const mine = (reviews ?? []).filter((review) => review.reviewer_id === member.user_id);
    return {
      id: member.id,
      name: member.full_name,
      team: team?.name ?? "",
      linked: Boolean(member.user_id),
      assigned: (assignments ?? []).filter((item) => item.reviewer_id === member.user_id).length,
      peerDone: mine.filter((review) => review.kind === "peer" && review.status === "submitted").length,
      selfDone: mine.some((review) => review.kind === "self" && review.status === "submitted"),
      contributions: (contributions ?? []).filter((item) => item.reviewer_id === member.user_id).length,
    };
  });
  const weightSum = settings.weights.teacher + settings.weights.peer + settings.weights.self;

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title")}
      />
      <SettingsForm
        action={updatePeerReviewSettingsAction}
        description={t("formDescription", { units: words.unitsLower })}
        title={t("formTitle")}
      >
        {(
          [
            ["enabled", t("enabled"), t("enabledHint"), settings.enabled],
            ["peer", t("peer", { units: words.unitsLower }), t("peerHint"), settings.peer],
            ["self", t("self", { mode: words.mode }), t("selfHint"), settings.self],
            ["contribution", t("contribution"), t("contributionHint"), settings.contribution],
            ["anonymous", t("anonymous"), t("anonymousHint"), settings.anonymous],
          ] as const
        ).map(([name, label, description, checked]) => (
          <SettingRow description={description} htmlFor={name} key={name} label={label}>
            <SettingSwitch defaultChecked={checked} id={name} name={name} />
          </SettingRow>
        ))}
        <SettingRow htmlFor="reviewsPerStudent" label={t("perStudent", { units: words.units })}>
          <Input className="sm:ml-auto sm:w-24" defaultValue={settings.reviewsPerStudent} id="reviewsPerStudent" max={10} min={1} name="reviewsPerStudent" type="number" />
        </SettingRow>
        <SettingRow
          description={
            weightSum !== 100
              ? t("weightsOff", { sum: weightSum })
              : t("weightsHint")
          }
          label={t("weights")}
        >
          <div className="grid grid-cols-3 gap-2 text-left">
            {(
              [
                ["weightTeacher", words.evaluator, settings.weights.teacher],
                ["weightPeer", t("peers"), settings.weights.peer],
                ["weightSelf", t("selfLabel"), settings.weights.self],
              ] as const
            ).map(([name, label, value]) => (
              <label className="space-y-1 text-xs text-muted-foreground" key={name}>
                <span className="block truncate first-letter:uppercase">{label}</span>
                <Input defaultValue={value} max={100} min={0} name={name} type="number" />
              </label>
            ))}
          </div>
        </SettingRow>
      </SettingsForm>

      {settings.enabled && settings.peer ? (
        <section className={cardClass}>
          <h2 className="mb-2 font-display text-lg">{t("assignTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("assignText", { count: settings.reviewsPerStudent, units: words.unitsLower })}
          </p>
          <PeerAssignButton hasAssignments={(assignments ?? []).length > 0} />
        </section>
      ) : null}

      {settings.enabled ? (
        <section>
          <h2 className="mb-3 font-display text-lg">{t("progress")}</h2>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">{t("student")}</th>
                  <th className="px-3 py-2">{words.unit}</th>
                  {settings.peer ? <th className="px-3 py-2 text-right">{t("peerColumn")}</th> : null}
                  {settings.self ? <th className="px-3 py-2 text-right">{t("selfColumn")}</th> : null}
                  {settings.contribution ? <th className="px-3 py-2 text-right">{t("contributionColumn")}</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-border last:border-0" key={row.id}>
                    <td className="px-3 py-2 font-semibold">
                      {row.name}
                      {!row.linked ? <span className="block text-xs font-normal text-muted-foreground">{t("notJoined")}</span> : null}
                    </td>
                    <td className="px-3 py-2">{row.team}</td>
                    {settings.peer ? <td className="px-3 py-2 text-right">{row.peerDone}/{row.assigned}</td> : null}
                    {settings.self ? <td className="px-3 py-2 text-right">{row.selfDone ? "✔" : "—"}</td> : null}
                    {settings.contribution ? <td className="px-3 py-2 text-right">{row.contributions}</td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
