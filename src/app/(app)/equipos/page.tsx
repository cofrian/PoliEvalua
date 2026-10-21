import { TeamsBrowser, type TeamSummary } from "@/components/app/teams-browser";
import { getSession } from "@/lib/app/session";

export default async function TeamsPage() {
  const { supabase, user, canVote, event } = await getSession();

  const [{ data: challenges }, { data: teams }, { data: notes }, { data: evals }] =
    await Promise.all([
      supabase.from("challenges").select("id, name").eq("event_id", event.id).order("order"),
      supabase
        .from("teams")
        .select("id, number, name, project_title, challenge_id, team_members(count)")
        .eq("event_id", event.id)
        .order("number"),
      supabase.from("notes").select("team_id, author_id, is_shared").eq("event_id", event.id),
      supabase
        .from("evaluation_totals")
        .select("team_id, status, scored_criteria, total_criteria")
        .eq("event_id", event.id)
        .eq("judge_id", user.id),
    ]);

  const summaries: TeamSummary[] = (teams ?? []).map((team) => {
    const teamNotes = (notes ?? []).filter((n) => n.team_id === team.id);
    const evaluation = (evals ?? []).find((e) => e.team_id === team.id);
    const members = team.team_members as unknown as { count: number }[];

    return {
      id: team.id,
      number: team.number,
      name: team.name,
      projectTitle: team.project_title,
      challengeId: team.challenge_id,
      memberCount: members?.[0]?.count ?? 0,
      myNotes: teamNotes.filter((n) => n.author_id === user.id).length,
      sharedNotes: teamNotes.filter(
        (n) => n.is_shared && n.author_id !== user.id,
      ).length,
      status: !evaluation
        ? "pending"
        : evaluation.status !== "submitted"
          ? "draft"
          : evaluation.scored_criteria < evaluation.total_criteria
            ? "incomplete"
            : "submitted",
    };
  });

  return (
    <TeamsBrowser
      canVote={canVote}
      challenges={challenges ?? []}
      teams={summaries}
    />
  );
}
