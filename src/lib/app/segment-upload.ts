import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listRecordings,
  listSegments,
  removeRecording,
  removeSegment,
  saveRecording,
  saveSegment,
  segmentKey,
  type PendingRecording,
  type PendingSegment,
} from "@/lib/app/segment-store";

const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

// Fuera de React no hay traductor: se usa el idioma que ha pintado la página.
const UPLOAD_ERRORS = {
  prepare: { es: "No se pudo preparar la subida.", ca: "No s'ha pogut preparar la pujada.", en: "The upload couldn't be prepared." },
  upload: { es: "No se pudo subir el audio.", ca: "No s'ha pogut pujar l'àudio.", en: "The audio couldn't be uploaded." },
} as const;

function uploadError(kind: keyof typeof UPLOAD_ERRORS) {
  const lang = (typeof document === "undefined" ? "es" : document.documentElement.lang) as "es" | "ca" | "en";
  return new Error(UPLOAD_ERRORS[kind][lang] ?? UPLOAD_ERRORS[kind].es);
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
  return payload;
}

async function withRetries<T>(task: () => Promise<T>) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const delay = RETRY_DELAYS_MS[attempt];
      if (delay === undefined) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

export async function createRecording(input: {
  teamId: string;
  title: string;
  visibility: "private" | "event";
}) {
  const { id } = await postJson<{ id: string }>("/api/presentations", input);
  await saveRecording({
    recordingId: id,
    title: input.title,
    stopped: false,
    segmentsExpected: null,
    durationSeconds: 0,
    sizeBytes: 0,
  });
  return id;
}

/** Guarda una copia local y sube el segmento; la copia se borra al confirmar. */
export async function uploadSegment(supabase: SupabaseClient, segment: PendingSegment) {
  await saveSegment(segment);
  await withRetries(async () => {
    const signed = await postJson<{ path?: string; token?: string; alreadyUploaded?: boolean }>(
      `/api/presentations/${segment.recordingId}/segments`,
      {
        seq: segment.seq,
        startMs: segment.startMs,
        endMs: segment.endMs,
        sizeBytes: segment.blob.size,
        mimeType: segment.mimeType,
      },
    );
    if (!signed.alreadyUploaded) {
      if (!signed.path || !signed.token) throw uploadError("prepare");
      const { error } = await supabase.storage
        .from("presentation-audio")
        .uploadToSignedUrl(signed.path, signed.token, segment.blob, {
          contentType: segment.mimeType,
          upsert: true,
        });
      if (error) throw uploadError("upload");
      await postJson(
        `/api/presentations/${segment.recordingId}/segments/${segment.seq}/uploaded`,
        {},
      );
    }
  });
  await removeSegment(segment.key);
}

/** Cierra la grabación cuando ya no queda ningún segmento por subir. */
export async function finalizeRecording(recording: PendingRecording) {
  if (!recording.stopped || !recording.segmentsExpected) return false;
  if ((await listSegments(recording.recordingId)).length > 0) return false;
  await withRetries(() =>
    postJson(`/api/presentations/${recording.recordingId}/finalize`, {
      segmentsExpected: recording.segmentsExpected,
      durationSeconds: recording.durationSeconds,
      sizeBytes: Math.max(1, recording.sizeBytes),
    }),
  );
  await removeRecording(recording.recordingId);
  return true;
}

export async function markStopped(
  recordingId: string,
  stats: { segmentsExpected: number; durationSeconds: number; sizeBytes: number },
) {
  const recording = (await listRecordings()).find((item) => item.recordingId === recordingId);
  const updated: PendingRecording = {
    recordingId,
    title: recording?.title ?? "",
    stopped: true,
    ...stats,
  };
  await saveRecording(updated);
  return updated;
}

/** Grabaciones que se quedaron a medias en este navegador (corte de red, cierre). */
export async function pendingUploads() {
  const recordings = await listRecordings();
  return Promise.all(
    recordings.map(async (recording) => ({
      recording,
      segments: await listSegments(recording.recordingId),
    })),
  );
}

/** Reintenta subir lo pendiente de una grabación y la cierra si ya se paró. */
export async function resumeUpload(supabase: SupabaseClient, recording: PendingRecording) {
  for (const segment of await listSegments(recording.recordingId)) {
    await uploadSegment(supabase, segment);
  }
  return finalizeRecording(recording);
}

export { segmentKey };
