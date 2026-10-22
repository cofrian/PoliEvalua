import {
  addMemberAction,
  deleteTeamAction,
  removeMemberAction,
  renameMemberAction,
  saveTeamAction,
} from "@/app/(app)/admin/actions";
import { ConfirmSubmit } from "@/components/app/confirm-submit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { selectClass } from "@/lib/app/ui";

export type AdminTeam = {
  id: string;
  number: number | null;
  name: string;
  challenge_id: string | null;
  project_title: string | null;
  description: string | null;
  table_location: string | null;
  team_members: { id: string; full_name: string; email?: string | null; user_id?: string | null }[];
};

// Formulario de edición de un equipo y sus integrantes (solo admin).
export function AdminTeamEditor({
  team,
  challenges,
  allowDelete = true,
}: {
  team: AdminTeam | null;
  challenges: { id: string; name: string }[];
  allowDelete?: boolean;
}) {
  return (
    <div className="space-y-4">
      <form action={saveTeamAction} className="grid gap-3 sm:grid-cols-6">
        <input name="id" type="hidden" value={team?.id ?? ""} />
        <label className="space-y-1 text-sm font-semibold sm:col-span-1">
          <span className="block">Nº</span>
          <Input defaultValue={team?.number ?? ""} inputMode="numeric" name="number" />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-3">
          <span className="block">Nombre del equipo</span>
          <Input defaultValue={team?.name ?? ""} name="name" required />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-2">
          <span className="block">Reto</span>
          <select
            className={`${selectClass} w-full`}
            defaultValue={team?.challenge_id ?? challenges[0]?.id}
            name="challengeId"
          >
            {challenges.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-4">
          <span className="block">Proyecto</span>
          <Input defaultValue={team?.project_title ?? ""} name="projectTitle" />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-2">
          <span className="block">Mesa / ubicación</span>
          <Input defaultValue={team?.table_location ?? ""} name="tableLocation" />
        </label>
        <label className="space-y-1 text-sm font-semibold sm:col-span-6">
          <span className="block">Descripción del proyecto</span>
          <Textarea
            className="min-h-16"
            defaultValue={team?.description ?? ""}
            name="description"
          />
        </label>
        <div className="flex gap-2 sm:col-span-6">
          <Button type="submit">{team ? "Guardar equipo" : "Crear equipo"}</Button>
        </div>
      </form>

      {team ? (
        <>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Integrantes</p>
            {team.team_members.map((member) => (
              <div className="flex flex-wrap gap-2" key={member.id}>
                <form action={renameMemberAction} className="flex flex-1 flex-wrap gap-2">
                  <input name="id" type="hidden" value={member.id} />
                  <Input aria-label="Nombre" className="h-9 min-w-40 flex-1" defaultValue={member.full_name} name="fullName" />
                  <Input
                    aria-label="Correo"
                    className="h-9 min-w-48 flex-1"
                    defaultValue={member.email ?? ""}
                    name="email"
                    placeholder="correo@upv.es"
                    type="email"
                  />
                  <span
                    className="flex h-9 items-center text-xs text-muted-foreground"
                    title={member.user_id ? "Ha entrado en el espacio con este correo" : "Aún no ha entrado con este correo"}
                  >
                    {member.user_id ? "✔ Con cuenta" : member.email ? "Sin entrar" : ""}
                  </span>
                  <Button className="h-9" type="submit" variant="outline">
                    Guardar
                  </Button>
                </form>
                <form action={removeMemberAction}>
                  <input name="id" type="hidden" value={member.id} />
                  <Button className="h-9" type="submit" variant="ghost">
                    Retirar
                  </Button>
                </form>
              </div>
            ))}
            <form action={addMemberAction} className="flex gap-2">
              <input name="teamId" type="hidden" value={team.id} />
              <Input aria-label="Nombre" className="h-9" name="fullName" placeholder="Nuevo integrante" />
              <Input aria-label="Correo" className="h-9" name="email" placeholder="correo@upv.es (opcional)" type="email" />
              <Button className="h-9" type="submit" variant="outline">
                Añadir
              </Button>
            </form>
          </div>

          {allowDelete ? (
            <form action={deleteTeamAction}>
              <input name="id" type="hidden" value={team.id} />
              <ConfirmSubmit
                confirmLabel="Borrar"
                description="Solo se puede si nadie lo ha evaluado todavía. No se puede deshacer."
                title={`¿Borrar «${team.name}»?`}
              >
                Borrar equipo
              </ConfirmSubmit>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
