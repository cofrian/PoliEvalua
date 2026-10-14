import { redirect } from "next/navigation";

import {
  setUserRoleAction,
  toggleUserDisabledAction,
  updateEventAction,
} from "@/app/(app)/admin/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSession, roleLabels, type Role } from "@/lib/app/session";

const statusLabels = {
  setup: "Preparación",
  building: "Building (notas)",
  judging: "Defensas (votación)",
  closed: "Cerrado",
} as const;

const selectClass =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm dark:bg-[#151621]";

export default async function AdminPage() {
  const { supabase, user, isAdmin } = await getSession();
  if (!isAdmin) redirect("/equipos");

  const [{ data: events }, { data: profiles }, { data: evals }] =
    await Promise.all([
      supabase.from("events").select("id, name, status, signup_code, signup_open"),
      supabase
        .from("profiles")
        .select("id, full_name, role, disabled, created_at")
        .order("created_at"),
      supabase.from("evaluations").select("judge_id, status"),
    ]);

  return (
    <div className="space-y-10">
      <h1 className="font-display text-3xl sm:text-4xl">Admin</h1>

      {(events ?? []).map((event) => (
        <section
          className="rounded-xl border border-line bg-white p-4 dark:border-[#262838] dark:bg-[#151621]"
          key={event.id}
        >
          <h2 className="mb-4 font-display text-2xl">{event.name}</h2>
          <form
            action={updateEventAction}
            className="flex flex-wrap items-end gap-4"
          >
            <input name="id" type="hidden" value={event.id} />
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Estado</span>
              <select
                className={selectClass}
                defaultValue={event.status}
                name="status"
              >
                {Object.entries(statusLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-semibold">
              <span className="block">Código de registro</span>
              <Input
                className="h-9 w-40 uppercase"
                defaultValue={event.signup_code}
                name="signupCode"
              />
            </label>
            <label className="flex h-9 items-center gap-2 text-sm font-semibold">
              <input
                defaultChecked={event.signup_open}
                name="signupOpen"
                type="checkbox"
              />
              Registro abierto
            </label>
            <Button className="h-9" type="submit">
              Guardar
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Con el estado «Cerrado» nadie puede modificar evaluaciones y todos los
            usuarios pueden ver las de los demás.
          </p>
        </section>
      ))}

      <section>
        <h2 className="mb-3 font-display text-2xl">
          Usuarios ({profiles?.length ?? 0})
        </h2>
        <div className="overflow-x-auto rounded-xl border border-line bg-white dark:border-[#262838] dark:bg-[#151621]">
          <table className="w-full text-sm">
            <thead className="border-b border-line text-left text-xs text-muted-foreground uppercase dark:border-[#262838]">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Rol</th>
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
                      {profile.full_name || "(sin nombre)"}
                      {self ? " (tú)" : ""}
                    </td>
                    <td className="px-3 py-2">
                      {self ? (
                        roleLabels[profile.role as Role]
                      ) : (
                        <form action={setUserRoleAction} className="flex gap-2">
                          <input name="id" type="hidden" value={profile.id} />
                          <select
                            className={selectClass}
                            defaultValue={profile.role}
                            name="role"
                          >
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
                    <td className="px-3 py-2 text-right">
                      {
                        (evals ?? []).filter(
                          (e) =>
                            e.judge_id === profile.id && e.status === "submitted",
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
      </section>
    </div>
  );
}
