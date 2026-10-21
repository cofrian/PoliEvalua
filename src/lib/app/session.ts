import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { recordingSettings } from "@/lib/app/recording-notice";
import { vocabulary } from "@/lib/app/vocabulary";
import { createClient } from "@/lib/supabase/server";

export type SpaceRole =
  | "owner"
  | "manager"
  | "judge"
  | "mentor"
  | "teacher"
  | "student"
  | "reviewer"
  | "viewer";

export type Role = SpaceRole;

export const roleLabels: Record<SpaceRole, string> = {
  owner: "Propietario",
  manager: "Gestor",
  judge: "Juez",
  mentor: "Mentor",
  teacher: "Docente",
  student: "Estudiante",
  reviewer: "Evaluador",
  viewer: "Consulta",
};

type EventSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "hackathon" | "class" | "awards" | "project" | "custom";
  status: "setup" | "building" | "judging" | "closed";
  audit_mode: boolean;
  settings: Record<string, unknown> | null;
};

type MembershipRow = {
  event_id: string;
  role: SpaceRole;
  status: "active" | "inactive";
  recording_notice_version: number | null;
  events: EventSummary | EventSummary[] | null;
};

function relatedEvent(value: MembershipRow["events"]) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export const getAccount = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, disabled, avatar_url, organization")
    .eq("id", user.id)
    .single();

  if (!profile || profile.disabled) redirect("/login?reason=disabled");

  return { supabase, user, profile };
});

export const getSession = cache(async () => {
  const { supabase, user, profile } = await getAccount();
  const cookieStore = await cookies();
  const preferredEventId = cookieStore.get("active_event_id")?.value;

  const { data } = await supabase
    .from("event_members")
    .select(
      "event_id, role, status, recording_notice_version, events(id, name, slug, kind, status, audit_mode, settings)",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("joined_at");

  const memberships = (data ?? []) as MembershipRow[];
  const membership =
    memberships.find((item) => item.event_id === preferredEventId) ??
    memberships[0];
  const event = membership ? relatedEvent(membership.events) : null;

  if (!membership || !event) redirect("/login?reason=no-space");

  const role = membership.role;
  const isAdmin = role === "owner" || role === "manager";
  const canVote = ["owner", "manager", "judge", "reviewer", "teacher"].includes(
    role,
  );

  return {
    supabase,
    user,
    profile: { ...profile, role },
    membership,
    memberships,
    role,
    canVote,
    isAdmin,
    event,
    eventClosed: event.status === "closed",
    recording: recordingSettings(event.settings),
    words: vocabulary(event),
  };
});
