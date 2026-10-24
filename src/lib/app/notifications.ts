// Avisos de la campana: lo que cada persona tiene pendiente en el espacio.
// Se calcula en el servidor en cada navegación; no se guarda nada.

import { peerReviewSettings } from "@/lib/app/peer-review";
import type { getSession } from "@/lib/app/session";

type Session = Awaited<ReturnType<typeof getSession>>;

export type Notice =
  | { kind: "evaluations"; count: number; href: string }
  | { kind: "peer"; count: number; href: string }
  | { kind: "turn"; team: string; minutes: number; href: string }
  | { kind: "live"; team: string; href: string }
  | { kind: "recordingNotice"; count: number; href: string };

/** Minutos antes del turno en que se avisa. */
const TURN_WINDOW_MINUTES = 30;

export async function loadNotifications(session: Session): Promise<Notice[]> {
  const { supabase, user, event, isAdmin, canVote, role, recording } = session;
  const notices: Notice[] = [];
  const now = Date.now();
  const isStudent = role === "student";
  const evaluator = canVote && !isAdmin;
  const peer = peerReviewSettings(event.settings);

  const [{ data: slots }, { data: myTeams }] = await Promise.all([
    supabase
      .from("presentation_slots")
      .select("team_id, starts_at, status, teams(name)")
      .eq("event_id", event.id)
      .in("status", ["pending", "live"]),
    isStudent
      ? supabase.from("team_members").select("team_id").eq("event_id", event.id).eq("user_id", user.id)
      : Promise.resolve({ data: [] as { team_id: string }[] }),
  ]);
  const myTeamIds = new Set((myTeams ?? []).map((item) => item.team_id));
  const teamName = (slot: { teams: unknown }) => {
    const relation = slot.teams as { name: string } | { name: string }[] | null;
    return (Array.isArray(relation) ? relation[0]?.name : relation?.name) ?? "";
  };

  // Turnos: el alumnado ve el suyo cuando se acerca; el jurado, quién expone ahora.
  for (const slot of slots ?? []) {
    if (isStudent && myTeamIds.has(slot.team_id) && slot.status === "pending" && slot.starts_at) {
      const minutes = Math.round((new Date(slot.starts_at).getTime() - now) / 60_000);
      if (minutes >= 0 && minutes <= TURN_WINDOW_MINUTES) {
        notices.push({ kind: "turn", team: teamName(slot), minutes, href: "/agenda" });
      }
    }
    if (evaluator && slot.status === "live") notices.push({ kind: "live", team: teamName(slot), href: "/sala" });
  }

  if (evaluator) {
    const [{ data: page }, { data: teams }, { data: totals }, { data: panelMemberships }, { data: assignments }, { data: panels }] =
      await Promise.all([
        supabase.from("evaluation_pages").select("status, current_round").eq("event_id", event.id).maybeSingle(),
        supabase.from("teams").select("id").eq("event_id", event.id),
        supabase.from("evaluation_totals").select("team_id, status").eq("event_id", event.id).eq("judge_id", user.id),
        supabase.from("jury_panel_members").select("panel_id").eq("event_id", event.id).eq("user_id", user.id),
        supabase.from("jury_panel_assignments").select("panel_id, team_id, round").eq("event_id", event.id),
        supabase.from("jury_panels").select("id").eq("event_id", event.id).eq("active", true),
      ]);
    if (page?.status === "published") {
      // Mismo criterio que la lista de equipos: si hay tribunales, solo los asignados.
      const myPanels = new Set((panelMemberships ?? []).map((item) => item.panel_id));
      const activePanels = new Set((panels ?? []).map((item) => item.id));
      const round = page.current_round ?? 1;
      const active = (assignments ?? []).filter((item) => item.round === round && activePanels.has(item.panel_id));
      const submitted = new Set((totals ?? []).filter((item) => item.status === "submitted").map((item) => item.team_id));
      const count = (teams ?? []).filter(
        (team) =>
          !submitted.has(team.id) &&
          (!active.length || active.some((item) => item.team_id === team.id && myPanels.has(item.panel_id))),
      ).length;
      if (count) notices.push({ kind: "evaluations", count, href: "/equipos" });
    }
  }

  if (isStudent && peer.enabled) {
    const [{ data: assigned }, { data: reviews }] = await Promise.all([
      supabase.from("peer_assignments").select("team_id").eq("event_id", event.id).eq("reviewer_id", user.id),
      supabase
        .from("peer_reviews")
        .select("team_id, kind")
        .eq("event_id", event.id)
        .eq("reviewer_id", user.id)
        .eq("status", "submitted"),
    ]);
    const done = new Set((reviews ?? []).map((item) => `${item.kind}:${item.team_id}`));
    const pending =
      (peer.peer ? (assigned ?? []).filter((item) => !done.has(`peer:${item.team_id}`)).length : 0) +
      (peer.self ? [...myTeamIds].filter((id) => !done.has(`self:${id}`)).length : 0);
    if (pending) notices.push({ kind: "peer", count: pending, href: "/coevaluacion" });
  }

  if (isAdmin && recording.enabled) {
    const { data: members } = await supabase
      .from("event_members")
      .select("recording_notice_version")
      .eq("event_id", event.id)
      .eq("status", "active");
    const count = (members ?? []).filter(
      (member) => (member.recording_notice_version ?? -1) < recording.noticeVersion,
    ).length;
    if (count) notices.push({ kind: "recordingNotice", count, href: "/admin/grabaciones" });
  }

  return notices;
}
