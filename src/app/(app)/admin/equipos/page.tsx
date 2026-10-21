import { AdminTeamEditor, type AdminTeam } from "@/components/app/admin-team-editor";
import { ImportTeamsForm } from "@/components/app/import-teams-form";
import { RosterImport } from "@/components/app/roster-import";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function AdminTeamsPage() {
  const { supabase, event, words } = await getSession();
  const settings = (event.settings ?? {}) as { enabled_roles?: string[] };
  const hasStudents = (settings.enabled_roles ?? []).includes("student");

  const [{ data: challenges }, { data: teams }] = await Promise.all([
    supabase.from("challenges").select("id, name").eq("event_id", event.id).order("order"),
    supabase
      .from("teams")
      .select(
        "id, number, name, challenge_id, project_title, description, table_location, team_members(id, full_name, email, user_id)",
      )
      .eq("event_id", event.id)
      .order("number"),
  ]);

  const allTeams = (teams ?? []) as AdminTeam[];
  // Sin retos (p. ej. una asignatura) todos los grupos van en una sola lista.
  const sections = [
    ...(challenges ?? []).map((challenge) => ({
      id: challenge.id,
      title: challenge.name,
      list: allTeams.filter((team) => team.challenge_id === challenge.id),
    })),
    {
      id: "none",
      title: challenges?.length ? `Sin reto` : words.units,
      list: allTeams.filter(
        (team) => !team.challenge_id || !(challenges ?? []).some((c) => c.id === team.challenge_id),
      ),
    },
  ].filter((section) => section.list.length || section.id === "none");

  return (
    <div className="space-y-8">
      {hasStudents ? (
        <section className={cardClass}>
          <h2 className="mb-3 font-display text-2xl">Importar alumnado</h2>
          <RosterImport unit={words.unit} units={words.units} />
        </section>
      ) : null}

      <details className={cardClass} open={!hasStudents}>
        <summary className="cursor-pointer font-display text-2xl">Importar {words.unitsLower} (formato equipos.txt)</summary>
        <div className="mt-3">
          <ImportTeamsForm />
        </div>
      </details>

      <section className={cardClass}>
        <h2 className="mb-3 font-display text-2xl">Nuevo {words.unitLower}</h2>
        <AdminTeamEditor challenges={challenges ?? []} team={null} />
      </section>

      {sections.map(({ id, title, list }) => {
        return (
          <section key={id}>
            <h2 className="mb-3 font-display text-2xl">
              {title} ({list.length})
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
