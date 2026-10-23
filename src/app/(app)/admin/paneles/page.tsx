import { Layers } from "lucide-react";
import { getTranslations } from "next-intl/server";

import {
  autoAssignPanelsAction,
  deactivatePanelAction,
  savePanelAction,
  updatePanelMembersAction,
  updatePanelTeamsAction,
} from "@/app/(app)/admin/paneles/actions";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession, type SpaceRole } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

type Profile = { full_name: string };
type Membership = {
  user_id: string;
  role: SpaceRole;
  profile: Profile | Profile[] | null;
};

function profileOf(value: Membership["profile"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function PanelsPage() {
  const { supabase, event, words } = await getSession();
  const [t, tRoles] = await Promise.all([getTranslations("panels"), getTranslations("roles")]);
  const [{ data: panels }, { data: memberships }, { data: teams }, { data: panelMembers }, { data: assignments }, { data: evaluationPage }] =
    await Promise.all([
      supabase.from("jury_panels").select("id, name, description, order, active").eq("event_id", event.id).order("order"),
      supabase
        .from("event_members")
        .select("user_id, role, profile:profiles!event_members_user_id_fkey(full_name)")
        .eq("event_id", event.id)
        .eq("status", "active")
        .in("role", ["owner", "manager", "judge", "reviewer", "teacher"]),
      supabase.from("teams").select("id, number, name").eq("event_id", event.id).order("number"),
      supabase.from("jury_panel_members").select("panel_id, user_id").eq("event_id", event.id),
      supabase.from("jury_panel_assignments").select("panel_id, team_id, round").eq("event_id", event.id),
      supabase.from("evaluation_pages").select("current_round").eq("event_id", event.id).maybeSingle(),
    ]);
  const eligible = (memberships ?? []) as unknown as Membership[];
  const activePanels = (panels ?? []).filter((panel) => panel.active);
  const currentRound = evaluationPage?.current_round ?? 1;

  return (
    <div className="space-y-6">
      <PageHeader
        description={t("description")}
        title={t("title", { evaluator: words.evaluator })}
      />
      <section className={cardClass}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-lg">{t("autoTitle")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("autoText")}
            </p>
          </div>
          <form action={autoAssignPanelsAction} className="flex items-end gap-2">
            <label className="space-y-1 text-sm font-semibold"><span className="block">{t("round")}</span><Input className="w-20" defaultValue={currentRound} max={20} min={1} name="round" type="number" /></label>
            <Button disabled={!activePanels.length} type="submit" variant="outline">{t("autoButton")}</Button>
          </form>
        </div>
      </section>

      {activePanels.length === 0 ? (
        <EmptyState
          description={t("emptyText")}
          icon={<Layers aria-hidden="true" />}
          title={t("emptyTitle")}
        />
      ) : null}
      {activePanels.map((panel) => {
        const selectedMembers = new Set((panelMembers ?? []).filter((item) => item.panel_id === panel.id).map((item) => item.user_id));
        const selectedTeams = new Set((assignments ?? []).filter((item) => item.panel_id === panel.id && item.round === currentRound).map((item) => item.team_id));
        return (
          <section className={cardClass} key={panel.id}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <form action={savePanelAction} className="grid flex-1 gap-3 sm:grid-cols-[1fr_2fr_6rem_auto]">
                <input name="id" type="hidden" value={panel.id} />
                <Input aria-label={t("name")} defaultValue={panel.name} name="name" required />
                <Input aria-label={t("descriptionLabel")} defaultValue={panel.description ?? ""} name="description" placeholder={t("descriptionPlaceholder")} />
                <Input aria-label={t("order")} defaultValue={panel.order} min={0} name="order" type="number" />
                <Button type="submit" variant="outline">{t("save")}</Button>
              </form>
              <form action={deactivatePanelAction}>
                <input name="id" type="hidden" value={panel.id} />
                <ConfirmSubmit
                  confirmLabel={t("deactivate")}
                  description={t("deactivateText")}
                  title={t("deactivateTitle", { name: panel.name })}
                >
                  {t("deactivate")}
                </ConfirmSubmit>
              </form>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <form action={updatePanelMembersAction}>
                <input name="panelId" type="hidden" value={panel.id} />
                <h3 className="font-display text-lg">{t("members")}</h3>
                <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-border p-3">
                  {eligible.map((membership) => {
                    const profile = profileOf(membership.profile);
                    return (
                      <label className="flex items-center gap-2 text-sm" key={membership.user_id}>
                        <input defaultChecked={selectedMembers.has(membership.user_id)} name="members" type="checkbox" value={membership.user_id} />
                        <span>{profile?.full_name ?? t("user")} <span className="text-muted-foreground">· {tRoles(membership.role)}</span></span>
                      </label>
                    );
                  })}
                </div>
                <Button className="mt-3" type="submit" variant="outline">{t("saveMembers")}</Button>
              </form>

              <form action={updatePanelTeamsAction}>
                <input name="panelId" type="hidden" value={panel.id} />
                <div className="flex items-end justify-between gap-2">
                  <h3 className="font-display text-lg">{t("teams")}</h3>
                  <label className="space-y-1 text-xs font-semibold"><span className="block">{t("round")}</span><Input className="w-20" defaultValue={currentRound} max={20} min={1} name="round" type="number" /></label>
                </div>
                <div className="mt-2 grid max-h-64 gap-2 overflow-y-auto rounded-lg border border-border p-3">
                  {(teams ?? []).map((team) => (
                    <label className="flex items-center gap-2 text-sm" key={team.id}>
                      <input defaultChecked={selectedTeams.has(team.id)} name="teams" type="checkbox" value={team.id} />
                      <span>#{team.number ?? "—"} · {team.name}</span>
                    </label>
                  ))}
                </div>
                <Button className="mt-3" type="submit" variant="outline">{t("saveTeams")}</Button>
              </form>
            </div>
          </section>
        );
      })}

      <section className={cardClass}>
        <h2 className="font-display text-lg">{t("newTitle")}</h2>
        <form action={savePanelAction} className="mt-3 grid gap-3 sm:grid-cols-[1fr_2fr_6rem_auto]">
          <Input aria-label={t("newName")} name="name" placeholder={t("newNamePlaceholder")} required />
          <Input aria-label={t("newDescription")} name="description" placeholder={t("newDescriptionPlaceholder")} />
          <Input aria-label={t("order")} defaultValue={activePanels.length + 1} min={0} name="order" type="number" />
          <Button type="submit">{t("create")}</Button>
        </form>
      </section>
    </div>
  );
}

