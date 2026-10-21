import {
  setUserRoleAction,
  toggleUserDisabledAction,
  updateEventAction,
  updateMaterialsSettingsAction,
  updateStudentVisibilityAction,
  revokeInvitationAction,
} from "@/app/(app)/admin/actions";
import { AdminOverview } from "@/components/app/admin-overview";
import { InvitationForm } from "@/components/app/invitation-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getSession, roleLabels, type SpaceRole } from "@/lib/app/session";
import { cardClass, selectClass } from "@/lib/app/ui";


const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminPage() {
  const session = await getSession();
  const { supabase, user, event, words } = session;
  const statusLabels = words.stageLabels;
  const settings = (event.settings ?? {}) as { join_roles?: string[]; enabled_roles?: string[] };
  const enabledRoles = settings.enabled_roles ?? [];
  const joinRoles = (settings.join_roles ?? ["judge", "mentor"])
    .map((role) => roleLabels[role as SpaceRole]?.toLowerCase())
    .filter(Boolean);

  const [{ data: eventSettings }, { data: memberships }, { data: evals }, { data: invitations }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, status, signup_code, signup_open")
        .eq("id", event.id)
        .single(),
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

  return (
    <div className="space-y-10">
      <AdminOverview session={session} />
      {eventSettings ? (
        <section className={cardClass}>
          <h2 className="mb-4 font-display text-2xl">Evento</h2>
          <form action={updateEventAction} className="flex flex-wrap items-end gap-4">
            <input name="id" type="hidden" value={eventSettings.id} />
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Nombre</span>
              <Input className="h-9 w-52" defaultValue={eventSettings.name} name="name" />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Estado</span>
              <select className={selectClass} defaultValue={eventSettings.status} name="status">
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Código de acceso</span>
              <Input
                className="h-9 w-40 uppercase"
                defaultValue={eventSettings.signup_code}
                name="signupCode"
              />
            </label>
            <label className="flex h-9 items-center gap-2 text-sm font-semibold">
              <input defaultChecked={eventSettings.signup_open} name="signupOpen" type="checkbox" />
              Acceso abierto
            </label>
            <Button className="h-9" type="submit">
              Guardar
            </Button>
          </form>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
            <li>
              <strong>Cerrado</strong>: nadie puede modificar evaluaciones y todo el
              jurado puede ver resultados y evaluaciones ajenas.
            </li>
            <li>
              <strong>Acceso abierto</strong> desmarcado: el código de acceso deja de
              funcionar (el código de admin sigue funcionando).
            </li>
            <li>
              El gestor, con auditoría activada, ve las notas privadas y todas las
              evaluaciones en directo y puede editar la rúbrica aunque esté
              bloqueada.
            </li>
          </ul>
        </section>
      ) : null}

      {enabledRoles.includes("student") ? (
        <section className={cardClass}>
          <h2 className="mb-2 font-display text-2xl">Alumnado</h2>
          <form action={updateStudentVisibilityAction} className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input defaultChecked={words.studentsSeeRubric} name="showRubric" type="checkbox" />
              Mostrar la rúbrica al alumnado antes de su {words.presentation}
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input defaultChecked={words.resultsPublished} name="publishResults" type="checkbox" />
              Publicar a cada {words.unitLower} su nota y su feedback
            </label>
            <Button className="h-9" type="submit" variant="outline">
              Guardar
            </Button>
          </form>
        </section>
      ) : null}

      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Entregas</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Las entregas son enlaces: cada {words.unitLower} añade su repositorio, web, vídeo o presentación desde su ficha.
          Si usáis una carpeta común (Drive, OneDrive…), pon aquí su enlace y aparecerá a todos.
        </p>
        <form action={updateMaterialsSettingsAction} className="space-y-3">
          <label className="block space-y-1 text-sm font-semibold">
            <span className="block">Carpeta común de entregas (opcional)</span>
            <Input
              defaultValue={words.materials.driveUrl ?? ""}
              inputMode="url"
              name="driveUrl"
              placeholder="https://drive.google.com/drive/folders/…"
            />
          </label>
          <label className="block space-y-1 text-sm font-semibold">
            <span className="block">Instrucciones para la entrega (opcional)</span>
            <Textarea
              defaultValue={words.materials.instructions ?? ""}
              maxLength={2000}
              name="instructions"
              placeholder="Sube el PDF de la memoria a la carpeta común y añade aquí el enlace al repositorio y al vídeo de demo antes del viernes a las 23:59."
              rows={3}
            />
          </label>
          <Button className="h-9" type="submit">
            Guardar
          </Button>
        </form>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Acceso por código</h2>
        <p className="text-sm leading-6">
          Comparte este enlace y el código de acceso{" "}
          <strong>{eventSettings?.signup_code}</strong>. Cada persona entra con su
          nombre, su correo y su rol
          {joinRoles.length ? ` (${joinRoles.join(", ")})` : ""}.
        </p>
        <p className="mt-2 rounded-md bg-paper-50 px-3 py-2 font-mono text-sm dark:bg-ink-950">
          {siteUrl || "https://valencia-hack-jurado.vercel.app"}/login
        </p>
      </section>

      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Invitaciones individuales</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          El enlace queda vinculado al correo y al rol elegido. No necesita correo automático: puedes copiarlo y enviarlo por el canal que prefieras.
        </p>
        <InvitationForm />
        {invitations?.length ? (
          <ul className="mt-5 divide-y divide-line text-sm dark:divide-[#383C3D]">
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
        <h2 className="mb-3 font-display text-2xl">Miembros ({memberships?.length ?? 0})</h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-white dark:border-[#262838] dark:bg-[#151621]">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted-foreground uppercase dark:border-[#262838]">
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
                    className="border-b border-line last:border-0 dark:border-[#262838]"
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
