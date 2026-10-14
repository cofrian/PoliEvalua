import {
  setUserRoleAction,
  toggleUserDisabledAction,
  updateEventAction,
} from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession, roleLabels, type Role } from "@/lib/app/session";
import { cardClass, selectClass } from "@/lib/app/ui";

const statusLabels = {
  setup: "Preparación",
  building: "Building (notas)",
  judging: "Defensas (votación)",
  closed: "Cerrado",
} as const;


const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export default async function AdminPage() {
  const { supabase, user } = await getSession();

  const [{ data: events }, { data: profiles }, { data: evals }] =
    await Promise.all([
      supabase
        .from("events")
        .select("id, name, status, signup_code, signup_open"),
      supabase
        .from("profiles")
        .select("id, full_name, role, disabled, organization, last_seen_at, created_at")
        .order("created_at"),
      supabase.from("evaluations").select("judge_id, status"),
    ]);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

  return (
    <div className="space-y-10">
      {(events ?? []).map((event) => (
        <section className={cardClass} key={event.id}>
          <h2 className="mb-4 font-display text-2xl">Evento</h2>
          <form action={updateEventAction} className="flex flex-wrap items-end gap-4">
            <input name="id" type="hidden" value={event.id} />
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Nombre</span>
              <Input className="h-9 w-52" defaultValue={event.name} name="name" />
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Estado</span>
              <select className={selectClass} defaultValue={event.status} name="status">
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
                defaultValue={event.signup_code}
                name="signupCode"
              />
            </label>
            <label className="flex h-9 items-center gap-2 text-sm font-semibold">
              <input defaultChecked={event.signup_open} name="signupOpen" type="checkbox" />
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
              El admin ve todas las notas (también las privadas), todas las
              evaluaciones en directo y puede editar la rúbrica aunque esté
              bloqueada.
            </li>
          </ul>
        </section>
      ))}

      <section className={cardClass}>
        <h2 className="mb-2 font-display text-2xl">Invitar al jurado</h2>
        <p className="text-sm leading-6">
          Comparte este enlace y el código de acceso{" "}
          <strong>{events?.[0]?.signup_code}</strong>. Cada persona entra con su
          nombre, su correo y su rol (juez o mentor).
        </p>
        <p className="mt-2 rounded-md bg-paper-50 px-3 py-2 font-mono text-sm dark:bg-ink-950">
          {siteUrl || "https://valencia-hack-jurado.vercel.app"}/login
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-2xl">Usuarios ({profiles?.length ?? 0})</h2>
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
              {(profiles ?? []).map((profile) => {
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
                        roleLabels[profile.role as Role]
                      ) : (
                        <form action={setUserRoleAction} className="flex gap-2">
                          <input name="id" type="hidden" value={profile.id} />
                          <select className={selectClass} defaultValue={profile.role} name="role">
                            {Object.entries(roleLabels).map(([value, label]) => (
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
                            value={String(!profile.disabled)}
                          />
                          <Button
                            className="h-9"
                            type="submit"
                            variant={profile.disabled ? "default" : "outline"}
                          >
                            {profile.disabled ? "Reactivar" : "Desactivar"}
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
