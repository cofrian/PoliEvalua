import { AdminTeamEditor, type AdminTeam } from "@/components/app/admin-team-editor";
import { ImportTeamsForm } from "@/components/app/import-teams-form";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function AdminTeamsPage() {
  const { supabase } = await getSession();

  const [{ data: challenges }, { data: teams }] = await Promise.all([
    supabase.from("challenges").select("id, name").order("order"),
    supabase
      .from("teams")
      .select(
        "id, number, name, challenge_id, project_title, description, table_location, team_members(id, full_name)",
      )
      .order("number"),
  ]);

  return (
    <div className="space-y-8">
      <section className={cardClass}>
        <h2 className="mb-3 font-display text-2xl">Importar equipos</h2>
        <ImportTeamsForm />
      </section>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-2xl">Nuevo equipo</h2>
        <AdminTeamEditor challenges={challenges ?? []} team={null} />
      </section>

      {(challenges ?? []).map((challenge) => {
        const list = ((teams ?? []) as AdminTeam[]).filter(
          (team) => team.challenge_id === challenge.id,
        );
        return (
          <section key={challenge.id}>
            <h2 className="mb-3 font-display text-2xl">
              {challenge.name} ({list.length})
            </h2>
            <div className="space-y-2">
              {list.map((team) => (
                <details className={cardClass} key={team.id}>
                  <summary className="cursor-pointer font-semibold">
                    #{team.number} · {team.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {team.team_members.length} integrantes
                    </span>
                  </summary>
                  <div className="mt-4">
                    <AdminTeamEditor challenges={challenges ?? []} team={team} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
