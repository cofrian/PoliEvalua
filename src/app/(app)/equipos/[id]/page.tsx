import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { NotesPanel, type Note } from "@/components/app/notes-panel";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/app/session";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user, canVote } = await getSession();

  const [{ data: team }, { data: notes }, { data: evaluation }] =
    await Promise.all([
      supabase
        .from("teams")
        .select(
          "id, number, name, project_title, description, table_location, challenge:challenges(name), team_members(id, full_name)",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("notes")
        .select(
          "id, body, is_shared, created_at, author_id, author:profiles(full_name)",
        )
        .eq("team_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("evaluations")
        .select("status")
        .eq("team_id", id)
        .eq("judge_id", user.id)
        .maybeSingle(),
    ]);

  if (!team) notFound();

  const challenge = team.challenge as unknown as { name: string } | null;
  const members = (team.team_members ?? []) as { id: string; full_name: string }[];

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
            {challenge?.name} · Equipo #{team.number}
            {team.table_location ? ` · Mesa ${team.table_location}` : ""}
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">{team.name}</h1>
          {team.project_title ? (
            <p className="mt-1 text-lg">{team.project_title}</p>
          ) : null}
        </div>
        {canVote ? (
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
            initialNotes={(notes ?? []) as unknown as Note[]}
            teamId={team.id}
            userId={user.id}
          />
        </div>
      </div>
    </div>
  );
}
