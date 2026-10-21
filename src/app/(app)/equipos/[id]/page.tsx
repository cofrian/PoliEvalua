import { ArrowLeft, Mic2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  AdminTeamEditor,
  type AdminTeam,
} from "@/components/app/admin-team-editor";
import { NotesPanel, type Note } from "@/components/app/notes-panel";
import { Presence } from "@/components/app/presence";
import { TeamLinks, type TeamLink } from "@/components/app/team-links";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/app/session";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, profile, canVote, isAdmin, event, recording, words, eventClosed } = await getSession();

  const [{ data: team }, { data: notes }, { data: evaluation }, { data: canVoteThisTeam }] =
    await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, number, name, project_title, description, table_location, challenge_id, challenge:challenges(name), team_members(id, full_name, user_id), team_links(id, kind, url, label, created_at)",
        )
        .eq("id", id)
        .eq("event_id", event.id)
        .maybeSingle(),
      supabase
        .from("notes")
        .select(
          "id, body, is_shared, created_at, author_id, author:profiles(full_name)",
        )
        .eq("event_id", event.id)
        .eq("team_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("evaluations")
        .select("status")
        .eq("event_id", event.id)
        .eq("team_id", id)
        .eq("judge_id", user.id)
        .maybeSingle(),
      canVote
        ? supabase.rpc("can_vote_team", {
            target_event: event.id,
            target_team: id,
          })
        : Promise.resolve({ data: false }),
    ]);

  if (!team) notFound();

  // Grabación en curso: aún subiendo trozos y sin cerrar (las abandonadas se limpian a las 3 h).
  const { count: liveRecordings } = recording.enabled
    ? await supabase
        .from("presentation_recordings")
        .select("id", { count: "exact", head: true })
        .eq("event_id", event.id)
        .eq("team_id", id)
        .eq("status", "uploading")
        .is("finalized_at", null)
        .is("deleted_at", null)
        .gt("created_at", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    : { count: 0 };

  const { data: challenges } = isAdmin
    ? await supabase.from("challenges").select("id, name").eq("event_id", event.id).order("order")
    : { data: [] };

  const challenge = team.challenge as unknown as { name: string } | null;
  const members = (team.team_members ?? []) as { id: string; full_name: string; user_id: string | null }[];
  const isMyTeam = members.some((member) => member.user_id === user.id);
  const links = ((team.team_links ?? []) as (TeamLink & { created_at: string })[]).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  return (
    <div className="space-y-6">
      <Link
        className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
        href="/equipos"
      >
        <ArrowLeft className="size-4" /> Equipos
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-muted-foreground">
            {challenge?.name ? `${challenge.name} · ` : ""}{words.unit} #{team.number}
            {team.table_location ? ` · Mesa ${team.table_location}` : ""}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">{team.name}</h1>
          {liveRecordings ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-destructive/10 px-3 py-1 text-sm font-bold text-destructive" role="status">
              <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-destructive" /> Grabando la exposición
            </p>
          ) : null}
          {team.project_title ? (
            <p className="mt-1 text-lg">{team.project_title}</p>
          ) : null}
          <div className="mt-3">
            <Presence
              me={{ id: user.id, name: profile.full_name, avatar: profile.avatar_url }}
              room={`team-${team.id}`}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild className="h-11 px-5 font-bold" variant="outline">
            <Link href={`/equipos/${team.id}/presentaciones`}>
              <Mic2 className="size-4" /> Exposiciones
            </Link>
          </Button>
          {canVote && canVoteThisTeam ? (
            <Button asChild className="h-11 px-5 font-bold">
              <Link href={`/equipos/${team.id}/evaluar`}>
                {evaluation?.status === "submitted"
                  ? "Ver mi evaluación"
                  : evaluation
                    ? "Continuar evaluación"
                    : "Evaluar equipo"}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <aside className="space-y-4">
          <div className="rounded-xl border border-line bg-white p-4 dark:border-[#262838] dark:bg-[#151621]">
            <h2 className="mb-2 font-display text-lg">Integrantes</h2>
            {members.length ? (
              <ul className="space-y-1 text-sm">
                {members.map((member) => (
                  <li key={member.id}>{member.full_name}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Sin integrantes.</p>
            )}
          </div>
          {isAdmin ? (
            <details className="rounded-xl border border-line bg-white p-4 dark:border-[#262838] dark:bg-[#151621]">
              <summary className="cursor-pointer font-display text-lg">
                Editar equipo (admin)
              </summary>
              <div className="mt-4">
                <AdminTeamEditor
                  allowDelete={false}
                  challenges={challenges ?? []}
                  team={team as unknown as AdminTeam}
                />
              </div>
            </details>
          ) : null}
          <div className="rounded-xl border border-line bg-white p-4 dark:border-[#262838] dark:bg-[#151621]">
            <h2 className="mb-2 font-display text-lg">Entregas</h2>
            <TeamLinks
              canEdit={isAdmin || (isMyTeam && !eventClosed)}
              driveUrl={words.materials.driveUrl}
              eventId={event.id}
              initialLinks={links}
              instructions={isMyTeam ? words.materials.instructions : null}
              teamId={team.id}
            />
          </div>
          {team.description ? (
            <div className="rounded-xl border border-line bg-white p-4 text-sm leading-6 dark:border-[#262838] dark:bg-[#151621]">
              <h2 className="mb-2 font-display text-lg">Proyecto</h2>
              {team.description}
            </div>
          ) : null}
        </aside>

        <div>
          <h2 className="mb-3 font-display text-2xl">Notas</h2>
          <NotesPanel
            eventId={event.id}
            initialNotes={(notes ?? []) as unknown as Note[]}
            teamId={team.id}
            userId={user.id}
          />
        </div>
      </div>
    </div>
  );
}
