import {
  revokeInvitationAction,
  setUserRoleAction,
  toggleUserDisabledAction,
} from "@/app/(app)/admin/actions";
import { CopyButton } from "@/components/app/copy-button";
import { InvitationForm } from "@/components/app/invitation-form";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { getSession, roleLabels, type SpaceRole } from "@/lib/app/session";
import { cardClass, selectClass } from "@/lib/app/ui";

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminPeoplePage() {
  const { supabase, user, event } = await getSession();
  const settings = (event.settings ?? {}) as { join_roles?: string[] };
  const joinRoles = (settings.join_roles ?? ["judge", "mentor"])
    .map((role) => roleLabels[role as SpaceRole]?.toLowerCase())
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

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const loginUrl = `${siteUrl || "https://valencia-hack-jurado.vercel.app"}/login`;

  return (
    <div className="space-y-6">
      <PageHeader description="Cómo entra la gente, invitaciones y quién participa." title="Personas" />
      <section className={cardClass}>
        <h2 className="mb-2 font-display text-xl">Acceso por código</h2>
        <p className="text-sm text-muted-foreground">
          Comparte el enlace y el código. Cada persona entra con su nombre, su correo y su rol
          {joinRoles.length ? ` (${joinRoles.join(", ")})` : ""}.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="min-w-0 truncate font-mono text-sm">{loginUrl}</span>
            <CopyButton label="Copiar enlace" value={loginUrl} />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-4 py-3">
            <span className="font-mono text-sm font-semibold tracking-wider">{eventSettings?.signup_code}</span>
            <CopyButton label="Copiar código" value={eventSettings?.signup_code ?? ""} />
          </div>
        </div>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 font-display text-xl">Invitaciones individuales</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          El enlace queda vinculado al correo y al rol elegido. No necesita correo automático: puedes copiarlo y enviarlo por el canal que prefieras.
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
                      {roleLabels[invitation.role as SpaceRole]} · {invitation.accepted_at ? "Aceptada" : invitation.revoked_at ? "Revocada" : expired ? "Caducada" : `Caduca ${dateFormat.format(new Date(invitation.expires_at))}`}
                    </p>
                  </div>
                  {!closed ? (
                    <form action={revokeInvitationAction}>
                      <input name="id" type="hidden" value={invitation.id} />
                      <Button className="h-8" type="submit" variant="outline">Revocar</Button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 font-display text-xl">Miembros ({memberships?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Última actividad</th>
                <th className="px-3 py-2 text-right">Evaluaciones enviadas</th>
                <th className="px-3 py-2 text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {(memberships ?? []).map((membership) => {
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
                        {profile.full_name || "(sin nombre)"}
                        {self ? " (tú)" : ""}
                      </span>
                      {profile.organization ? (
                        <span className="block text-xs text-muted-foreground">
                          {profile.organization}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      {self ? (
                        roleLabels[membership.role as SpaceRole]
                      ) : (
                        <form action={setUserRoleAction} className="flex gap-2">
                          <input name="id" type="hidden" value={profile.id} />
                          <select className={selectClass} defaultValue={membership.role} name="role">
                            {Object.entries(roleLabels).filter(([value]) => value !== "owner").map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <Button className="h-9" type="submit" variant="outline">
                            Cambiar
                          </Button>
                        </form>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {profile.last_seen_at
                        ? dateFormat.format(new Date(profile.last_seen_at))
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
                        "Activo"
                      ) : (
                        <form action={toggleUserDisabledAction}>
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
                            {membership.status === "inactive" ? "Reactivar" : "Desactivar"}
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Desactivar no borra nada: la persona deja de poder entrar y sus notas y
          evaluaciones se conservan.
        </p>
      </section>
    </div>
  );
}
