import { Plus, Upload, UsersRound } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { AdminTeamEditor, type AdminTeam } from "@/components/app/admin-team-editor";
import { EmptyState } from "@/components/app/empty-state";
import { ModalButton } from "@/components/app/modal-button";
import { PageHeader } from "@/components/app/page-header";
import { ImportTeamsForm } from "@/components/app/import-teams-form";
import { RosterImport } from "@/components/app/roster-import";
import { getSession } from "@/lib/app/session";
import { cardClass } from "@/lib/app/ui";

export default async function AdminTeamsPage() {
  const { supabase, event, words } = await getSession();
  const t = await getTranslations("teamsAdmin");
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
      title: challenges?.length ? t("noChallenge") : words.units,
      list: allTeams.filter(
        (team) => !team.challenge_id || !(challenges ?? []).some((c) => c.id === team.challenge_id),
      ),
    },
  ].filter((section) => section.list.length || section.id === "none");

  const importForms = (
    <div className="space-y-6">
      {hasStudents ? (
        <section className="space-y-3">
          <h3 className="font-display text-lg">{t("importStudents")}</h3>
          <RosterImport unit={words.unit} units={words.units} />
        </section>
      ) : null}
      <section className="space-y-3">
        <h3 className="font-display text-lg">{t("importUnits", { units: words.unitsLower })}</h3>
        <ImportTeamsForm />
      </section>
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <>
            <ModalButton
              description={t("importHint")}
              label={
                <>
                  <Upload aria-hidden="true" /> {t("import")}
                </>
              }
              title={t("import")}
              variant="outline"
              wide
            >
              {importForms}
            </ModalButton>
            <ModalButton
              closeOnSubmit
              label={
                <>
                  <Plus aria-hidden="true" /> {t("newUnit", { mode: words.mode })}
                </>
              }
              title={t("newUnit", { mode: words.mode })}
              wide
            >
              <AdminTeamEditor
                  individual={words.mode === "individuals"} challenges={challenges ?? []} team={null} />
            </ModalButton>
          </>
        }
        description={t("description")}
        title={words.units}
      />

      {allTeams.length === 0 ? (
        <EmptyState
          action={
            <ModalButton description={t("importHint")} label={t("import")} title={t("import")} wide>
              {importForms}
            </ModalButton>
          }
          description={t("emptyText")}
          icon={<UsersRound aria-hidden="true" />}
          title={t("emptyTitle", { units: words.unitsLower })}
        />
      ) : null}

      {sections
        .filter(({ list }) => list.length)
        .map(({ id, title, list }) => (
          <section key={id}>
            {sections.filter((section) => section.list.length).length > 1 ? (
              <h2 className="mb-3 font-display text-xl">
                {title} ({list.length})
              </h2>
            ) : null}
            <div className="space-y-2">
              {list.map((team) => (
                <details className={cardClass} key={team.id}>
                  <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-2 font-semibold">
                    <span>
                      #{team.number} · {team.name}
                    </span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {t("membersCount", { count: team.team_members.length })}
                    </span>
                    <span className="ml-auto text-sm font-normal text-muted-foreground">{t("edit")}</span>
                  </summary>
                  <div className="mt-4">
                    <AdminTeamEditor
                  individual={words.mode === "individuals"} challenges={challenges ?? []} team={team} />
                  </div>
                </details>
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
