import { getFormatter, getTranslations } from "next-intl/server";

import {
  revokeInvitationAction,
  setUserRoleAction,
  toggleUserDisabledAction,
} from "@/app/(app)/admin/actions";
import { ActionForm } from "@/components/app/action-form";
import { CopyButton } from "@/components/app/copy-button";
import { InvitationForm } from "@/components/app/invitation-form";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession, type SpaceRole } from "@/lib/app/session";
import { cardClass, selectClass } from "@/lib/app/ui";

const ROLES: SpaceRole[] = ["owner", "manager", "judge", "mentor", "teacher", "student", "reviewer", "viewer"];
/** Perfiles que se eligen: Jurado, Mentor, Participante, Gestión y Consulta. */
const CHOOSABLE: SpaceRole[] = ["judge", "mentor", "student", "manager", "viewer"];
const DATE = { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } as const;

export default async function AdminPeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; rol?: string }>;
}) {
  const { q = "", rol = "" } = await searchParams;
  const { supabase, user, event } = await getSession();
  const [t, tRoles, format] = await Promise.all([getTranslations("people"), getTranslations("roles"), getFormatter()]);
  const roleLabel = (role: string) => (ROLES.includes(role as SpaceRole) ? tRoles(role as SpaceRole) : role);
  const settings = (event.settings ?? {}) as { join_roles?: string[] };
  const joinRoles = (settings.join_roles ?? ["judge", "mentor"])
    .map((role) => roleLabel(role).toLowerCase())
    .filter(Boolean);

  const [{ data: eventSettings }, { data: memberships }, { data: evals }, { data: invitations }] =
    await Promise.all([
      supabase.from("events").select("signup_code").eq("id", event.id).single(),
      supabase
        .from("event_members")
        .select("user_id, role, status, joined_at, profile:profiles!event_members_user_id_fkey(id, full_name, organization, last_seen_at)")
        .eq("event_id", event.id)
        .order("joined_at"),
      supabase.from("evaluations").select("judge_id, status").eq("event_id", event.id),
      supabase
        .from("event_invitations")
        .select("id, email, role, expires_at, accepted_at, revoked_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const query = q.trim().toLowerCase();
  const members = (memberships ?? []).filter((membership) => {
    const relation = membership.profile as unknown as { full_name: string; organization: string | null } | { full_name: string; organization: string | null }[] | null;
    const profile = Array.isArray(relation) ? relation[0] : relation;
    if (rol && membership.role !== rol) return false;
    if (!query) return true;
    return [profile?.full_name, profile?.organization].some((value) => value?.toLowerCase().includes(query));
  });
  const presentRoles = [...new Set((memberships ?? []).map((membership) => membership.role as SpaceRole))];

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const loginUrl = `${siteUrl || "https://valencia-hack-jurado.vercel.app"}/login`;

  return (
    <div className="space-y-6">
      <PageHeader description={t("description")} title={t("title")} />
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-lg">{t("codeTitle")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("codeText", { roles: joinRoles.length ? ` (${joinRoles.join(", ")})` : "" })}
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="min-w-0 truncate font-mono text-sm">{loginUrl}</span>
            <CopyButton label={t("copyLink")} value={loginUrl} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="font-mono text-sm font-semibold tracking-wider">{eventSettings?.signup_code}</span>
            <CopyButton label={t("copyCode")} value={eventSettings?.signup_code ?? ""} />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 font-display text-lg">{t("invitationsTitle")}</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          {t("invitationsText")}
        </p>
        <InvitationForm />
        {invitations?.length ? (
          <ul className="mt-5 divide-y divide-border text-sm">
            {invitations.map((invitation) => {
              const expired = new Date(invitation.expires_at) < new Date();
              const closed = Boolean(invitation.accepted_at || invitation.revoked_at || expired);
              return (
                <li className="flex flex-wrap items-center justify-between gap-3 py-3" key={invitation.id}>
                  <div>
                    <p className="font-semibold">{invitation.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {roleLabel(invitation.role)} · {invitation.accepted_at ? t("accepted") : invitation.revoked_at ? t("revoked") : expired ? t("expired") : t("expires", { date: format.dateTime(new Date(invitation.expires_at), DATE) })}
                    </p>
                  </div>
                  {!closed ? (
                    <ActionForm action={revokeInvitationAction}>
                      <input name="id" type="hidden" value={invitation.id} />
                      <Button className="h-8" type="submit" variant="outline">{t("revoke")}</Button>
                    </ActionForm>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-lg">
            {members.length === (memberships?.length ?? 0)
              ? t("members", { count: members.length })
              : t("membersFiltered", { count: members.length, total: memberships?.length ?? 0 })}
          </h2>
          <form className="flex flex-wrap gap-2" role="search">
            <Input aria-label={t("search")} className="h-9 w-full sm:w-72" defaultValue={q} name="q" placeholder={t("searchPlaceholder")} />
            <select aria-label={t("filterRole")} className={selectClass} defaultValue={rol} name="rol">
              <option value="">{t("allRoles")}</option>
              {presentRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
            <Button className="h-9" type="submit" variant="outline">
              {t("filter")}
            </Button>
          </form>
        </div>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">{t("name")}</th>
                <th className="px-3 py-2">{t("role")}</th>
                <th className="px-3 py-2">{t("lastSeen")}</th>
                <th className="px-3 py-2 text-right">{t("sent")}</th>
                <th className="px-3 py-2 text-right">{t("status")}</th>
              </tr>
            </thead>
            <tbody>
              {members.length === 0 ? (
                <tr>
                  <td className="px-3 py-8 text-center text-muted-foreground" colSpan={5}>
                    {t("noMatch")}
                  </td>
                </tr>
              ) : null}
              {members.map((membership) => {
                const relation = membership.profile as unknown as
                  | { id: string; full_name: string; organization: string | null; last_seen_at: string | null }
                  | { id: string; full_name: string; organization: string | null; last_seen_at: string | null }[]
                  | null;
                const profile = Array.isArray(relation) ? relation[0] : relation;
                if (!profile) return null;
                const self = profile.id === user.id;
                return (
                  <tr
                    className="border-b border-border last:border-0"
                    key={profile.id}
                  >
                    <td className="px-3 py-2">
                      <span className="font-semibold">
                        {profile.full_name || t("noName")}
                        {self ? t("you") : ""}
                      </span>
                      {profile.organization ? (
                        <span className="block text-xs text-muted-foreground">
                          {profile.organization}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {self ? (
                        roleLabel(membership.role)
                      ) : (
                        <ActionForm action={setUserRoleAction} className="flex gap-2">
                          <input name="id" type="hidden" value={profile.id} />
                          <select
                            aria-label={t("roleFor", { name: profile.full_name })}
                            className={selectClass}
                            defaultValue={membership.role}
                            name="role"
                          >
                            {/* Los cinco perfiles claros; si alguien tiene uno antiguo, también sale. */}
                            {[...new Set<SpaceRole>([...CHOOSABLE, membership.role as SpaceRole])].map((value) => (
                              <option key={value} value={value}>
                                {tRoles(value)}
                              </option>
                            ))}
                          </select>
                          <Button className="h-9" type="submit" variant="outline">
                            {t("change")}
                          </Button>
                        </ActionForm>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {profile.last_seen_at
                        ? format.dateTime(new Date(profile.last_seen_at), DATE)
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {
                        (evals ?? []).filter(
                          (e) => e.judge_id === profile.id && e.status === "submitted",
                        ).length
                      }
                    </td>
                    <td className="px-3 py-2 text-right">
                      {self ? (
                        t("active")
                      ) : (
                        <ActionForm action={toggleUserDisabledAction}>
                          <input name="id" type="hidden" value={profile.id} />
                          <input
                            name="disabled"
                            type="hidden"
                            value={String(membership.status === "active")}
                          />
                          <Button
                            className="h-9"
                            type="submit"
                            variant={membership.status === "inactive" ? "default" : "outline"}
                          >
                            {membership.status === "inactive" ? t("reactivate") : t("deactivate")}
                          </Button>
                        </ActionForm>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {t("deactivateNote")}
        </p>
      </section>
    </div>
  );
}
