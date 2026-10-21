import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { analyzePresentation } from "@/lib/ai/presentation-analysis";

export const AUDIO_BUCKET = "presentation-audio";

// Una exposición de 15 min en un Space CPU gratuito puede tardar ~20 min.
export const JOB_LEASE_SECONDS = Number(process.env.TRANSCRIPTION_LEASE_SECONDS) || 45 * 60;

type TeamRelation =
  | { name: string; project_title: string | null }
  | { name: string; project_title: string | null }[]
  | null;

export function isWorkerRequest(request: Request) {
  const expected = process.env.TRANSCRIPTION_WORKER_TOKEN;
  const header = request.headers.get("authorization") ?? "";
  if (!expected || !header.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function workerUrls() {
  return (process.env.TRANSCRIPTION_WORKER_URLS ?? "")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * Los Spaces gratuitos se duermen sin visitas; una petición a /wake los
 * despierta y hace que consulten la cola al momento.
 */
export async function wakeWorkers() {
  const headers: HeadersInit = process.env.HF_TOKEN
    ? { Authorization: `Bearer ${process.env.HF_TOKEN}` }
    : {};
  await Promise.allSettled(
    workerUrls().map((url) =>
      fetch(`${url}/wake`, {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(8_000),
      }),
    ),
  );
}

export async function deleteAudio(
  admin: SupabaseClient,
  recording: { id: string; storage_path: string },
) {
  const { error } = await admin.storage
    .from(AUDIO_BUCKET)
    .remove([recording.storage_path]);
  if (error) {
    console.error("No se pudo borrar el audio temporal:", error.message);
    return;
  }
  await admin
    .from("presentation_recordings")
    .update({ audio_deleted_at: new Date().toISOString() })
    .eq("id", recording.id);
}

export async function enqueueTranscription(
  admin: SupabaseClient,
  recording: { id: string; event_id: string },
) {
  const { error } = await admin.from("transcription_jobs").upsert(
    {
      recording_id: recording.id,
      event_id: recording.event_id,
      status: "queued",
      attempts: 0,
      worker_id: null,
      locked_until: null,
      last_error: null,
    },
    { onConflict: "recording_id" },
  );
  if (error) throw new Error(`No se pudo encolar la grabación: ${error.message}`);

  await admin
    .from("presentation_recordings")
    .update({ status: "queued", error_message: null })
    .eq("id", recording.id);
}

/** Genera resumen, esquema y mapa mental a partir del texto ya guardado. */
export async function analyzeRecording(admin: SupabaseClient, recordingId: string) {
  const { data: recording } = await admin
    .from("presentation_recordings")
    .select("id, transcript, team:teams(name, project_title)")
    .eq("id", recordingId)
    .maybeSingle();
  if (!recording?.transcript) return { status: "failed" as const };

  if (!process.env.NVIDIA_API_KEY || !process.env.NVIDIA_MODEL) {
    return {
      status: "transcribed" as const,
      warning:
        "La transcripción está guardada. Configura NVIDIA_MODEL para generar el resumen y el mapa mental.",
    };
  }

  await admin
    .from("presentation_recordings")
    .update({ status: "analyzing", error_message: null })
    .eq("id", recordingId);

  const teamValue = recording.team as unknown as TeamRelation;
  const team = Array.isArray(teamValue) ? teamValue[0] : teamValue;

  try {
    const insights = await analyzePresentation({
      transcript: recording.transcript,
      teamName: team?.name ?? "Proyecto",
      projectTitle: team?.project_title ?? null,
    });
    if (!insights) throw new Error("El modelo no devolvió materiales.");

    await admin
      .from("presentation_recordings")
      .update({
        status: "ready",
        summary: insights.summary,
        key_points: insights.keyPoints,
        outline: insights.outline,
        action_items: insights.actionItems,
        mind_map: insights.mindMap,
        processed_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", recordingId);
    return { status: "ready" as const };
  } catch (error) {
    console.error(
      "Error al analizar la exposición:",
      error instanceof Error ? error.message : "Error desconocido",
    );
    const warning = "La transcripción está lista, pero no se pudo generar el análisis.";
    await admin
      .from("presentation_recordings")
      .update({ status: "transcribed", error_message: warning })
      .eq("id", recordingId);
    return { status: "transcribed" as const, warning };
  }
}

/**
 * Limpieza oportunista: cierra trabajos agotados y borra audios huérfanos
 * (subidas abandonadas) para que ningún audio sobreviva más de lo necesario.
 */
export async function sweepQueue(admin: SupabaseClient) {
  const now = new Date();
  const { data: exhausted } = await admin
    .from("transcription_jobs")
    .select("id, recording_id, attempts, max_attempts")
    .eq("status", "processing")
    .lt("locked_until", now.toISOString());
  for (const job of exhausted ?? []) {
    if (job.attempts < job.max_attempts) continue;
    await failJob(admin, job.id, "El transcriptor no respondió a tiempo.", false);
  }

  const staleBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: abandoned } = await admin
    .from("presentation_recordings")
    .select("id, storage_path")
    .eq("status", "uploading")
    .is("audio_deleted_at", null)
    .lt("created_at", staleBefore)
    .limit(50);
  for (const recording of abandoned ?? []) {
    await deleteAudio(admin, recording);
    await admin
      .from("presentation_recordings")
      .update({ status: "inactive", deleted_at: now.toISOString() })
      .eq("id", recording.id);
  }
}

export async function failJob(
  admin: SupabaseClient,
  jobId: string,
  message: string,
  retryable: boolean,
) {
  const { data: job } = await admin
    .from("transcription_jobs")
    .select("id, recording_id, attempts, max_attempts")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;

  const lastError = message.slice(0, 1000);
  if (retryable && job.attempts < job.max_attempts) {
    await admin
      .from("transcription_jobs")
      .update({ status: "queued", worker_id: null, locked_until: null, last_error: lastError })
      .eq("id", job.id);
    await admin
      .from("presentation_recordings")
      .update({ status: "queued" })
      .eq("id", job.recording_id);
    return;
  }

  await admin
    .from("transcription_jobs")
    .update({ status: "failed", locked_until: null, last_error: lastError })
    .eq("id", job.id);
  const { data: recording } = await admin
    .from("presentation_recordings")
    .update({
      status: "failed",
      error_message: `No se pudo transcribir el audio: ${lastError}`.slice(0, 500),
    })
    .eq("id", job.recording_id)
    .select("id, storage_path")
    .maybeSingle();
  if (recording) await deleteAudio(admin, recording);
}
