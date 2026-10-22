import { TeamsBrowser, type TeamSummary } from "@/components/app/teams-browser";
import { getSession } from "@/lib/app/session";

export default async function TeamsPage() {
  const { supabase, user, canVote, isAdmin, event, words } = await getSession();

  const [{ data: challenges }, { data: teams }, { data: notes }, { data: evals }, { data: panelMemberships }, { data: panelAssignments }, { data: panels }, { data: evaluationPage }] =
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
      supabase
        .from("jury_panel_members")
        .select("panel_id")
        .eq("event_id", event.id)
        .eq("user_id", user.id),
      supabase
        .from("jury_panel_assignments")
        .select("panel_id, team_id, round")
        .eq("event_id", event.id),
      supabase
        .from("jury_panels")
        .select("id")
        .eq("event_id", event.id)
        .eq("active", true),
      supabase
        .from("evaluation_pages")
        .select("current_round")
        .eq("event_id", event.id)
        .maybeSingle(),
    ]);

  const myPanelIds = new Set((panelMemberships ?? []).map((item) => item.panel_id));
  const activePanelIds = new Set((panels ?? []).map((item) => item.id));
  const currentRound = evaluationPage?.current_round ?? 1;
  const activeAssignments = (panelAssignments ?? []).filter(
    (item) => item.round === currentRound && activePanelIds.has(item.panel_id),
  );
  const assignmentsEnabled = activeAssignments.length > 0;

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
      canEvaluate:
        canVote &&
        (isAdmin ||
          !assignmentsEnabled ||
          activeAssignments.some(
            (assignment) =>
              assignment.team_id === team.id && myPanelIds.has(assignment.panel_id),
          )),
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
      isAdmin={isAdmin}
      teams={summaries}
      title={words.units}
    />
  );
}
