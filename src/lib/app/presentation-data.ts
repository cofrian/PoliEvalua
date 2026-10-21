import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { JuryReportRecord, PresentationRecord } from "@/components/app/presentation-studio";

/** Grabaciones e informes de jurado de un grupo (la RLS decide qué ve cada perfil). */
export async function loadPresentationData(
  supabase: SupabaseClient,
  eventId: string,
  teamId: string,
): Promise<{ records: PresentationRecord[]; juryReports: JuryReportRecord[] }> {
  const [{ data: recordings }, { data: juryReports }] = await Promise.all([
    supabase
      .from("presentation_recordings")
      .select(
        "id, title, status, visibility, duration_seconds, size_bytes, segments_expected, transcript, summary, key_points, outline, action_items, mind_map, error_message, audio_deleted_at, created_at, created_by, creator:profiles!presentation_recordings_created_by_fkey(full_name), segments:presentation_segments(seq, status, transcript)",
      )
      .eq("event_id", eventId)
      .eq("team_id", teamId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("seq", { referencedTable: "presentation_segments" }),
    supabase
      .from("presentation_jury_reports")
      .select("recording_id, criteria_evidence, questions, risks")
      .eq("event_id", eventId)
      .eq("team_id", teamId),
  ]);

  return {
    records: (recordings ?? []) as unknown as PresentationRecord[],
    juryReports: (juryReports ?? []) as unknown as JuryReportRecord[],
  };
}

export function recordingDisabledReason(enabled: boolean, isAdmin: boolean) {
  if (enabled) return null;
  return isAdmin
    ? "La grabación está desactivada en este espacio. Actívala en Admin → Grabaciones: todas las personas verán antes un aviso."
    : "La grabación de exposiciones no está activada en este espacio.";
}
