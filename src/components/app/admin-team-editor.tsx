import {
  addMemberAction,
  deleteTeamAction,
  removeMemberAction,
  renameMemberAction,
  saveTeamAction,
} from "@/app/(app)/admin/actions";
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
  team_members: { id: string; full_name: string }[];
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
                <form action={renameMemberAction} className="flex flex-1 gap-2">
                  <input name="id" type="hidden" value={member.id} />
                  <Input className="h-9" defaultValue={member.full_name} name="fullName" />
                  <Button className="h-9" type="submit" variant="outline">
                    Renombrar
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
              <Input className="h-9" name="fullName" placeholder="Nuevo integrante" />
              <Button className="h-9" type="submit" variant="outline">
                Añadir
              </Button>
            </form>
          </div>

          {allowDelete ? (
            <form action={deleteTeamAction}>
              <input name="id" type="hidden" value={team.id} />
              <Button className="h-9 text-destructive" type="submit" variant="ghost">
                Borrar equipo (solo si no tiene evaluaciones)
              </Button>
            </form>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
