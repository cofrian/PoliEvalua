import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { cache } from "react";

import { recordingSettings } from "@/lib/app/recording-notice";
import { vocabulary } from "@/lib/app/vocabulary";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/config";

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

type EventSummary = {
  id: string;
  name: string;
  slug: string;
  kind: "hackathon" | "class" | "awards" | "project" | "custom";
  status: "setup" | "building" | "judging" | "closed";
  audit_mode: boolean;
  locale: Locale;
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
    .select("id, full_name, disabled, avatar_url, organization, locale")
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
      "event_id, role, status, recording_notice_version, events(id, name, slug, kind, status, audit_mode, settings, locale)",
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
  const { data: branding } = await supabase
    .from("event_branding")
    .select("logo_light_url, accent_color")
    .eq("event_id", event.id)
    .maybeSingle();
  const locale = (await getLocale()) as Locale;
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
    locale,
    words: vocabulary(event, locale),
    /** Logo y color del espacio (Ajustes → Imagen del espacio). */
    branding: {
      logoUrl: branding?.logo_light_url ?? null,
      color: branding?.accent_color && branding.accent_color !== "#59CBE8" ? branding.accent_color : null,
    },
  };
});
