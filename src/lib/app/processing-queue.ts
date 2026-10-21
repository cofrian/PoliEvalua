import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runPresentationGraph,
  type AnalysisState,
  type Criterion,
} from "@/lib/ai/agents/presentation-graph";
import { AiConfigError, AllModelsFailedError, aiConfigured } from "@/lib/ai/models";
import { TranscriptionError, transcribeWithNvidia } from "@/lib/ai/nvidia-transcription";
import { mergeTranscripts } from "@/lib/app/merge-transcripts";

// Cola única de procesamiento de exposiciones:
//   transcribe_segment (NVIDIA → trabajador externo) → assemble → analyze
// Los trabajos internos los ejecuta la propia app (tras cada subida y con el
// pulso de pg_cron); los externos los recogen Kaggle/Colab/PC por /api/worker.

export const AUDIO_BUCKET = "presentation-audio";

const NVIDIA_PER_MINUTE = Number(process.env.NVIDIA_REQUESTS_PER_MINUTE) || 30;
const MAX_INTERNAL_CONCURRENCY = Number(process.env.MAX_INTERNAL_CONCURRENCY) || 4;
const INTERNAL_LEASE_SECONDS = 290;
export const EXTERNAL_LEASE_SECONDS = Number(process.env.TRANSCRIPTION_LEASE_SECONDS) || 15 * 60;
const SLOT_WAIT_MS = 25_000;
/** Minutos que se espera a un trabajador externo antes de dar el trozo por fallido. */
const EXTERNAL_WAIT_MINUTES = Number(process.env.TRANSCRIPTION_EXTERNAL_WAIT_MINUTES) || 30;
/** Horas que se conserva el audio de una grabación fallida para reintentarla. */
const FAILED_AUDIO_HOURS = 24;

type JobKind = "transcribe_segment" | "assemble" | "analyze";

type Job = {
  id: string;
  kind: JobKind;
  runner: "internal" | "external";
  recording_id: string;
  segment_id: string | null;
  event_id: string;
  attempts: number;
  max_attempts: number;
};

type TeamRelation =
  | { name: string; project_title: string | null; challenge_id: string | null }
  | { name: string; project_title: string | null; challenge_id: string | null }[]
  | null;

/** El trabajo debe esperar sin gastar un intento (p. ej. cupo de NVIDIA lleno). */
class DeferJob extends Error {
  /** withModelFallback no debe tratarlo como fallo del modelo. */
  readonly passthrough = true;

  constructor(public readonly seconds: number) {
    super("Aplazado");
  }
}

function safeEqual(header: string | null, expected: string | undefined) {
  if (!expected || !header?.startsWith("Bearer ")) return false;
  const received = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function isWorkerRequest(request: Request) {
  return safeEqual(request.headers.get("authorization"), process.env.TRANSCRIPTION_WORKER_TOKEN);
}

export function isCronRequest(request: Request) {
  return safeEqual(request.headers.get("authorization"), process.env.JOBS_CRON_SECRET);
}

export function workerUrls() {
  return (process.env.TRANSCRIPTION_WORKER_URLS ?? "")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/** Despierta a los trabajadores con URL pública; los demás consultan solos. */
export async function wakeWorkers() {
  const headers: HeadersInit = process.env.HF_TOKEN
    ? { Authorization: `Bearer ${process.env.HF_TOKEN}` }
    : {};
  await Promise.allSettled(
    workerUrls().map((url) =>
      fetch(`${url}/wake`, { method: "POST", headers, signal: AbortSignal.timeout(8_000) }),
    ),
  );
}

export async function enqueueJob(
  admin: SupabaseClient,
  job: {
    kind: JobKind;
    recordingId: string;
    eventId: string;
    segmentId?: string;
    priority?: number;
  },
) {
  const { error } = await admin.from("processing_jobs").insert({
    kind: job.kind,
    recording_id: job.recordingId,
    event_id: job.eventId,
    segment_id: job.segmentId ?? null,
    priority: job.priority ?? 100,
  });
  // 23505: ya estaba encolado (subida repetida o doble confirmación).
  if (error && error.code !== "23505") {
    throw new Error(`No se pudo encolar ${job.kind}: ${error.message}`);
  }
}

/** Vuelve a poner en cola los trabajos fallidos de una grabación. */
export async function requeueFailedJobs(admin: SupabaseClient, recordingId: string) {
  await admin
    .from("processing_jobs")
    .update({
      status: "queued",
      runner: "internal",
      attempts: 0,
      run_after: new Date().toISOString(),
      locked_until: null,
      last_error: null,
    })
    .eq("recording_id", recordingId)
    .eq("status", "failed");
}

async function deleteSegmentAudio(
  admin: SupabaseClient,
  segment: { id: string; storage_path: string },
) {
  const { error } = await admin.storage.from(AUDIO_BUCKET).remove([segment.storage_path]);
  if (error) {
    console.error("No se pudo borrar el audio temporal:", error.message);
    return;
  }
  await admin
    .from("presentation_segments")
    .update({ audio_deleted_at: new Date().toISOString() })
    .eq("id", segment.id);
}

export async function deleteRecordingAudio(admin: SupabaseClient, recordingId: string) {
  const { data: segments } = await admin
    .from("presentation_segments")
    .select("id, storage_path")
    .eq("recording_id", recordingId)
    .is("audio_deleted_at", null);
  for (const segment of segments ?? []) await deleteSegmentAudio(admin, segment);
  await admin
    .from("presentation_recordings")
    .update({ audio_deleted_at: new Date().toISOString() })
    .eq("id", recordingId);
}

async function finishJob(admin: SupabaseClient, jobId: string) {
  await admin
    .from("processing_jobs")
    .update({ status: "done", locked_until: null, last_error: null })
    .eq("id", jobId);
}

async function deferJob(admin: SupabaseClient, job: Job, seconds: number) {
  await admin
    .from("processing_jobs")
    .update({
      status: "queued",
      attempts: Math.max(0, job.attempts - 1),
      run_after: new Date(Date.now() + seconds * 1000).toISOString(),
      locked_until: null,
    })
    .eq("id", job.id);
}

async function markRecordingFailed(admin: SupabaseClient, recordingId: string, message: string) {
  await admin
    .from("presentation_recordings")
    .update({ status: "failed", error_message: message.slice(0, 500) })
    .eq("id", recordingId);
}

/**
 * Decide qué hacer tras un fallo: reintentar con espera creciente, pasar la
 * transcripción al trabajador externo, o dar el trabajo por fallido.
 */
export async function handleJobFailure(
  admin: SupabaseClient,
  job: Job,
  message: string,
  retryable: boolean,
) {
  const lastError = message.slice(0, 1000);

  if (retryable && job.attempts < job.max_attempts) {
    const delaySeconds = 15 * 2 ** Math.max(0, job.attempts - 1);
    await admin
      .from("processing_jobs")
      .update({
        status: "queued",
        run_after: new Date(Date.now() + delaySeconds * 1000).toISOString(),
        locked_until: null,
        last_error: lastError,
      })
      .eq("id", job.id);
    return;
  }

  // NVIDIA agotado: el respaldo (Whisper en Kaggle/Colab/PC) lo intenta.
  if (job.kind === "transcribe_segment" && job.runner === "internal") {
    await admin
      .from("processing_jobs")
      .update({
        status: "queued",
        runner: "external",
        attempts: 0,
        run_after: new Date().toISOString(),
        locked_until: null,
        last_error: lastError,
      })
      .eq("id", job.id);
    if (job.segment_id) {
      await admin
        .from("presentation_segments")
        .update({ status: "queued" })
        .eq("id", job.segment_id);
    }
    await admin
      .from("presentation_recordings")
      .update({
        error_message:
          "NVIDIA no ha podido transcribir una parte. Esperando al transcriptor de respaldo.",
      })
      .eq("id", job.recording_id);
    await wakeWorkers();
    return;
  }

  await admin
    .from("processing_jobs")
    .update({ status: "failed", locked_until: null, last_error: lastError })
    .eq("id", job.id);

  if (job.kind === "analyze") {
    // El texto ya está guardado: solo falta el análisis, que se puede reintentar.
    await admin
      .from("presentation_recordings")
      .update({
        status: "transcribed",
        error_message: `La transcripción está lista, pero no se pudo generar el análisis: ${friendlyError(message)}`,
      })
      .eq("id", job.recording_id);
    return;
  }

  if (job.segment_id) {
    await admin.from("presentation_segments").update({ status: "failed" }).eq("id", job.segment_id);
  }
  // El audio se conserva hasta FAILED_AUDIO_HOURS para poder pulsar «Reintentar»;
  // sweepQueue lo borra después.
  await markRecordingFailed(
    admin,
    job.recording_id,
    `No se pudo transcribir el audio: ${friendlyError(message)}`,
  );
}

/** Mensaje para la persona usuaria; el detalle técnico queda en last_error. */
export function friendlyError(message: string) {
  if (/NVIDIA_API_KEY|clave/i.test(message)) return "la IA no está configurada en el servidor.";
  if (/ninguno de los modelos/i.test(message)) return "los modelos de IA no están disponibles ahora mismo.";
  if (/no se detectó voz/i.test(message)) return "no se detectó voz en la grabación.";
  if (/trabajador de respaldo|transcriptor de respaldo/i.test(message)) return message;
  if (/ejecutor no respondió|timeout|tiempo|abort/i.test(message)) return "el servicio tardó demasiado en responder.";
  if (/formato|ffmpeg|unsupported/i.test(message)) return "el formato del audio no es compatible.";
  if (/audio temporal|ya no existe/i.test(message)) return "el audio temporal ya no está disponible.";
  return "el servicio de IA ha fallado. Pulsa «Reintentar» en unos minutos.";
}

/** Espera turno en el limitador global de NVIDIA o aplaza el trabajo. */
async function acquireNvidiaSlot(admin: SupabaseClient) {
  const deadline = Date.now() + SLOT_WAIT_MS;
  while (Date.now() < deadline) {
    const { data } = await admin.rpc("take_provider_slot", {
      p_provider: "nvidia",
      p_limit: NVIDIA_PER_MINUTE,
    });
    if (data === true) return;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new DeferJob(20);
}

/** Guarda el texto de un segmento (venga de NVIDIA o del trabajador externo). */
export async function completeSegment(
  admin: SupabaseClient,
  segmentId: string,
  transcript: string,
  provider: "nvidia" | "external",
) {
  const { data: segment } = await admin
    .from("presentation_segments")
    .update({ status: "done", transcript, provider })
    .eq("id", segmentId)
    .select("id, recording_id, event_id, storage_path")
    .maybeSingle();
  if (!segment) return;
  await deleteSegmentAudio(admin, segment);
  await maybeAssemble(admin, segment.recording_id);
}

/** Cuando están todos los segmentos de una grabación cerrada, se une el texto. */
export async function maybeAssemble(admin: SupabaseClient, recordingId: string) {
  const { data: recording } = await admin
    .from("presentation_recordings")
    .select("id, event_id, segments_expected, finalized_at")
    .eq("id", recordingId)
    .maybeSingle();
  if (!recording?.finalized_at || !recording.segments_expected) return;

  const { count } = await admin
    .from("presentation_segments")
    .select("id", { count: "exact", head: true })
    .eq("recording_id", recordingId)
    .eq("status", "done");
  if ((count ?? 0) < recording.segments_expected) return;

  await enqueueJob(admin, {
    kind: "assemble",
    recordingId,
    eventId: recording.event_id,
    priority: 10,
  });
}

async function runTranscribeSegment(admin: SupabaseClient, job: Job) {
  const { data: segment } = await admin
    .from("presentation_segments")
    .update({ status: "transcribing" })
    .eq("id", job.segment_id)
    .select("id, seq, recording_id, storage_path, mime_type")
    .maybeSingle();
  if (!segment) throw new TranscriptionError("El segmento ya no existe.", false);

  await admin
    .from("presentation_recordings")
    .update({ status: "transcribing", error_message: null })
    .eq("id", segment.recording_id)
    .in("status", ["uploading", "queued"]);

  const { data: audio, error } = await admin.storage
    .from(AUDIO_BUCKET)
    .download(segment.storage_path);
  if (error || !audio) throw new TranscriptionError("No se pudo leer el audio temporal.", true);

  await acquireNvidiaSlot(admin);
  const text = await transcribeWithNvidia({
    audio: new Blob([audio], { type: segment.mime_type }),
    fileName: segment.storage_path.split("/").at(-1) ?? `${segment.seq}.webm`,
  });
  await completeSegment(admin, segment.id, text, "nvidia");
}

async function runAssemble(admin: SupabaseClient, job: Job) {
  const { data: segments } = await admin
    .from("presentation_segments")
    .select("seq, transcript")
    .eq("recording_id", job.recording_id)
    .eq("status", "done")
    .order("seq");
  const transcript = mergeTranscripts((segments ?? []).map((s) => s.transcript ?? ""));
  if (!transcript) {
    throw new TranscriptionError("No se detectó voz en la grabación.", false);
  }

  await admin
    .from("presentation_recordings")
    .update({ status: "transcribed", transcript: transcript.slice(0, 200_000), error_message: null })
    .eq("id", job.recording_id);
  await deleteRecordingAudio(admin, job.recording_id);
  await enqueueJob(admin, {
    kind: "analyze",
    recordingId: job.recording_id,
    eventId: job.event_id,
    priority: 50,
  });
}

async function rubricCriteria(
  admin: SupabaseClient,
  eventId: string,
): Promise<Criterion[]> {
  const { data: rubric } = await admin
    .from("rubrics")
    .select("id")
    .eq("event_id", eventId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!rubric) return [];
  const { data: criteria } = await admin
    .from("rubric_criteria")
    .select("title, description")
    .eq("rubric_id", rubric.id)
    .is("deleted_at", null)
    .order("order");
  return criteria ?? [];
}

async function runAnalyze(admin: SupabaseClient, job: Job) {
  if (!aiConfigured()) {
    throw new TranscriptionError("Falta configurar NVIDIA_API_KEY para generar el análisis.", false);
  }
  const deadlineMs = Date.now() + (INTERNAL_LEASE_SECONDS - 20) * 1000;
  const { data: recording } = await admin
    .from("presentation_recordings")
    .update({ status: "analyzing", error_message: null })
    .eq("id", job.recording_id)
    .select("id, event_id, team_id, transcript, analysis_state, team:teams(name, project_title, challenge_id)")
    .maybeSingle();
  if (!recording?.transcript) throw new TranscriptionError("No hay transcripción.", false);

  const teamValue = recording.team as unknown as TeamRelation;
  const team = Array.isArray(teamValue) ? teamValue[0] : teamValue;
  const state: AnalysisState = { ...(recording.analysis_state as AnalysisState) };

  const { insights, jury } = await runPresentationGraph({
    transcript: recording.transcript,
    teamName: team?.name ?? "Proyecto",
    projectTitle: team?.project_title ?? null,
    criteria: await rubricCriteria(admin, recording.event_id),
    previous: state,
    deps: {
      acquireSlot: () => acquireNvidiaSlot(admin),
      deadlineMs,
      saveNode: async (node, value) => {
        state[node] = value as never;
        await admin
          .from("presentation_recordings")
          .update({ analysis_state: state })
          .eq("id", recording.id);
      },
    },
  });

  await admin.from("presentation_jury_reports").upsert({
    recording_id: recording.id,
    event_id: recording.event_id,
    team_id: recording.team_id,
    criteria_evidence: jury.criteria,
    questions: jury.questions,
    risks: jury.risks,
  });
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
    .eq("id", recording.id);
}

/**
 * Limpieza oportunista: cierra trabajos cuyo ejecutor murió tras agotar los
 * intentos y borra el audio de grabaciones abandonadas a medias.
 */
export async function sweepQueue(admin: SupabaseClient) {
  const now = new Date();
  const { data: expired } = await admin
    .from("processing_jobs")
    .select("id, kind, runner, recording_id, segment_id, event_id, attempts, max_attempts")
    .eq("status", "processing")
    .lt("locked_until", now.toISOString())
    .limit(50);
  for (const job of (expired ?? []) as Job[]) {
    if (job.attempts >= job.max_attempts) {
      await handleJobFailure(admin, job, "El ejecutor no respondió a tiempo.", false);
    }
  }

  // Respaldo externo que nunca llegó: sin trabajador conectado el trabajo
  // esperaría para siempre.
  const orphanBefore = new Date(now.getTime() - EXTERNAL_WAIT_MINUTES * 60 * 1000).toISOString();
  const { data: orphaned } = await admin
    .from("processing_jobs")
    .select("id, kind, runner, recording_id, segment_id, event_id, attempts, max_attempts")
    .eq("status", "queued")
    .eq("runner", "external")
    .eq("attempts", 0)
    .lt("run_after", orphanBefore)
    .limit(50);
  for (const job of (orphaned ?? []) as Job[]) {
    await handleJobFailure(
      admin,
      { ...job, attempts: job.max_attempts },
      "NVIDIA no pudo transcribir y no hay ningún transcriptor de respaldo conectado. Pulsa «Reintentar» o pega el texto a mano.",
      false,
    );
  }

  // Audio de grabaciones fallidas: se guarda un tiempo para reintentar y luego se borra.
  const failedBefore = new Date(now.getTime() - FAILED_AUDIO_HOURS * 60 * 60 * 1000).toISOString();
  const { data: failedRecordings } = await admin
    .from("presentation_recordings")
    .select("id")
    .eq("status", "failed")
    .is("audio_deleted_at", null)
    .lt("created_at", failedBefore)
    .limit(20);
  for (const recording of failedRecordings ?? []) {
    await deleteRecordingAudio(admin, recording.id);
  }

  const staleBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
  const { data: abandoned } = await admin
    .from("presentation_recordings")
    .select("id")
    .eq("status", "uploading")
    .is("finalized_at", null)
    .is("audio_deleted_at", null)
    .lt("created_at", staleBefore)
    .limit(20);
  for (const recording of abandoned ?? []) {
    await deleteRecordingAudio(admin, recording.id);
    await admin
      .from("presentation_recordings")
      .update({ status: "inactive", deleted_at: now.toISOString() })
      .eq("id", recording.id);
  }
}

async function executeJob(admin: SupabaseClient, job: Job) {
  try {
    if (job.kind === "transcribe_segment") await runTranscribeSegment(admin, job);
    else if (job.kind === "assemble") await runAssemble(admin, job);
    else await runAnalyze(admin, job);
    await finishJob(admin, job.id);
  } catch (error) {
    if (error instanceof DeferJob) {
      await deferJob(admin, job, error.seconds);
      return;
    }
    const message = error instanceof Error ? error.message : "Error desconocido";
    const retryable =
      error instanceof TranscriptionError
        ? error.retryable
        : error instanceof AllModelsFailedError
          ? error.retryable
          : !(error instanceof AiConfigError);
    console.error(`Trabajo ${job.kind} ${job.id} falló:`, message);
    await handleJobFailure(admin, job, message, retryable);
  }
}

/**
 * Ejecuta hasta `budget` trabajos internos respetando el límite global de
 * concurrencia. Se llama tras cada subida (con after()) y desde el pulso.
 */
export async function runInternalJobs(admin: SupabaseClient, budget = 2) {
  const workerId = `vercel-${crypto.randomUUID().slice(0, 8)}`;
  let processed = 0;
  while (processed < budget) {
    const { data: running } = await admin.rpc("count_running_jobs", { p_runner: "internal" });
    if ((running ?? 0) >= MAX_INTERNAL_CONCURRENCY) break;

    const { data: jobs, error } = await admin.rpc("claim_processing_job", {
      p_worker_id: workerId,
      p_runner: "internal",
      p_lease_seconds: INTERNAL_LEASE_SECONDS,
    });
    if (error) {
      console.error("No se pudo reclamar un trabajo interno:", error.message);
      break;
    }
    const job = (jobs as Job[] | null)?.[0];
    if (!job) break;
    await executeJob(admin, job);
    processed += 1;
  }
  return processed;
}
