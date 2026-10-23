import "server-only";

import { whisperLanguage } from "@/lib/app/recording-notice";
import { createHash, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  runPresentationGraph,
  type AnalysisState,
  type Criterion,
} from "@/lib/ai/agents/presentation-graph";
import { AiConfigError, AllModelsFailedError, aiConfigured } from "@/lib/ai/models";
import {
  cleanAdminText,
  dropPromptEcho,
  INSTRUCTIONS_MAX,
  PROMPT_VERSION,
  type SpaceKind,
  type SpaceLocale,
} from "@/lib/ai/prompts/presentation";
import { TranscriptionError, groqConfigured, transcribeWithGroq } from "@/lib/ai/transcription";
import { mergeTranscripts } from "@/lib/app/merge-transcripts";

// Cola única de procesamiento de exposiciones:
//   transcribe_segment (Groq → trabajador externo) → assemble → analyze
// Los trabajos internos los ejecuta la propia app (tras cada subida y con el
// pulso de pg_cron); los externos los recogen Kaggle/Colab/PC por /api/worker.

export const AUDIO_BUCKET = "presentation-audio";

const NVIDIA_PER_MINUTE = Number(process.env.NVIDIA_REQUESTS_PER_MINUTE) || 30;
/** El plan gratuito de Groq admite 20 peticiones por minuto. */
const GROQ_PER_MINUTE = Number(process.env.GROQ_REQUESTS_PER_MINUTE) || 18;
/** Esperas más largas que esto (cupo por hora agotado) van al trabajador externo. */
const GROQ_MAX_DEFER_SECONDS = 120;
/** Trabajos internos a la vez en toda la plataforma; el cupo real lo marcan Groq y NVIDIA. */
const MAX_INTERNAL_CONCURRENCY = Number(process.env.MAX_INTERNAL_CONCURRENCY) || 16;
const INTERNAL_LEASE_SECONDS = 290;
/** Tras este tiempo una invocación deja de reclamar trabajos (maxDuration es 300 s). */
const LANE_DEADLINE_MS = 180_000;
/** Intentos con Groq antes de pasar al respaldo; Kaggle ya se avisó en el primer fallo. */
const GROQ_MAX_ATTEMPTS = 2;
export const EXTERNAL_LEASE_SECONDS = Number(process.env.TRANSCRIPTION_LEASE_SECONDS) || 15 * 60;
const SLOT_WAIT_MS = 25_000;
/** Minutos que se espera a un trabajador externo antes de dar el trozo por fallido. */
// Incluye el arranque automático de Kaggle (aviso de GitHub Actions + carga del modelo).
const EXTERNAL_WAIT_MINUTES = Number(process.env.TRANSCRIPTION_EXTERNAL_WAIT_MINUTES) || 60;
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

type EventRow = { kind: SpaceKind; locale?: SpaceLocale; settings: { ai?: { instructions?: unknown } } | null };
type EventRelation = EventRow | EventRow[] | null;

function shortHash(text: string) {
  return createHash("sha256").update(text).digest("hex").slice(0, 12);
}

/** El trabajo debe esperar sin gastar un intento (p. ej. cupo del proveedor lleno). */
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

/** Trozos esperando a un trabajador externo (para decidir si arrancar Kaggle). */
export async function externalBacklog(admin: SupabaseClient) {
  const { count } = await admin
    .from("processing_jobs")
    .select("id", { count: "exact", head: true })
    .eq("runner", "external")
    .in("status", ["queued", "processing"]);
  return count ?? 0;
}

export function workerUrls() {
  return (process.env.TRANSCRIPTION_WORKER_URLS ?? "")
    .split(",")
    .map((url) => url.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

/**
 * Pide a GitHub Actions que arranque el transcriptor en Kaggle
 * (.github/workflows/kaggle-worker.yml). Como mucho un aviso por minuto; el
 * flujo comprueba si ya hay uno en marcha.
 */
async function dispatchKaggleWorker(admin: SupabaseClient) {
  const token = process.env.GITHUB_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY || "cofrian/valencia-hack-jurado";
  if (!token) return;
  const { data: allowed } = await admin.rpc("take_provider_slot", {
    p_provider: "kaggle-dispatch",
    p_limit: 1,
  });
  if (allowed !== true) return;
  const response = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/kaggle-worker.yml/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: "main" }),
      signal: AbortSignal.timeout(8_000),
    },
  ).catch((error: unknown) => error);
  if (!(response instanceof Response) || !response.ok) {
    console.error(
      "No se pudo avisar al transcriptor de Kaggle:",
      response instanceof Response ? `HTTP ${response.status}` : String(response),
    );
  }
}

/** Despierta a los trabajadores con URL pública; los demás consultan solos. */
export async function wakeWorkers(admin?: SupabaseClient) {
  if (admin) await dispatchKaggleWorker(admin);
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

  const maxAttempts =
    job.kind === "transcribe_segment" && job.runner === "internal"
      ? Math.min(job.max_attempts, GROQ_MAX_ATTEMPTS)
      : job.max_attempts;
  if (retryable && job.attempts < maxAttempts) {
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

  // Groq agotado o sin configurar: el respaldo (Whisper en Kaggle/Colab/PC) lo intenta.
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
        error_message: "@backup",
      })
      .eq("id", job.recording_id);
    await wakeWorkers(admin);
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
        error_message: `@analysisFailed:${failureReason(message)}`,
      })
      .eq("id", job.recording_id);
    return;
  }

  if (job.segment_id) {
    await admin.from("presentation_segments").update({ status: "failed" }).eq("id", job.segment_id);
  }
  // Nunca se conserva audio: tras un fallo definitivo solo queda pegar el texto a mano.
  await markRecordingFailed(
    admin,
    job.recording_id,
    `@transcribeFailed:${failureReason(message)}`,
  );
  await deleteRecordingAudio(admin, job.recording_id);
}

/** Mensaje para la persona usuaria; el detalle técnico queda en last_error. */
/**
 * Motivo de un fallo como código. error_message guarda «@tipo:motivo» y la
 * pantalla lo traduce al idioma de quien lo mira (studio.errors en messages/).
 */
export function failureReason(message: string) {
  if (/NVIDIA_API_KEY|GROQ_API_KEY|clave/i.test(message)) return "notConfigured";
  if (/ninguno de los modelos/i.test(message)) return "modelsDown";
  if (/no se detectó voz/i.test(message)) return "noSpeech";
  if (/trabajador de respaldo|transcriptor de respaldo/i.test(message)) return "backupFailed";
  if (/ejecutor no respondió|timeout|tiempo|abort/i.test(message)) return "timeout";
  if (/formato|ffmpeg|unsupported/i.test(message)) return "format";
  if (/audio temporal|ya no existe/i.test(message)) return "audioGone";
  return "failed";
}

/** Espera turno en el limitador global del proveedor o aplaza el trabajo. */
async function acquireSlot(admin: SupabaseClient, provider: "nvidia" | "groq") {
  const deadline = Date.now() + SLOT_WAIT_MS;
  while (Date.now() < deadline) {
    const { data } = await admin.rpc("take_provider_slot", {
      p_provider: provider,
      p_limit: provider === "groq" ? GROQ_PER_MINUTE : NVIDIA_PER_MINUTE,
    });
    if (data === true) return;
    await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new DeferJob(20);
}

/** Guarda el texto de un segmento (venga de Groq o del trabajador externo). */
export async function completeSegment(
  admin: SupabaseClient,
  segmentId: string,
  transcript: string,
  provider: "groq" | "external",
) {
  const { data: current } = await admin
    .from("presentation_segments")
    .select("recording:presentation_recordings(asr_prompt)")
    .eq("id", segmentId)
    .maybeSingle();
  const recording = current?.recording as unknown as { asr_prompt: string | null } | null;
  const { data: segment } = await admin
    .from("presentation_segments")
    .update({ status: "done", transcript: dropPromptEcho(transcript, recording?.asr_prompt), provider })
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
    .select("id, seq, recording_id, storage_path, mime_type, recording:presentation_recordings(language, asr_prompt)")
    .maybeSingle();
  if (!segment) throw new TranscriptionError("El segmento ya no existe.", false);
  // Sin Groq no se gastan intentos: directamente al trabajador externo.
  if (!groqConfigured()) throw new TranscriptionError("Groq no está configurado.", false);

  await admin
    .from("presentation_recordings")
    .update({ status: "transcribing", error_message: null })
    .eq("id", segment.recording_id)
    .in("status", ["uploading", "queued"]);

  const { data: audio, error } = await admin.storage
    .from(AUDIO_BUCKET)
    .download(segment.storage_path);
  if (error || !audio) throw new TranscriptionError("No se pudo leer el audio temporal.", true);

  await acquireSlot(admin, "groq");
  const recording = segment.recording as unknown as {
    language: string | null;
    asr_prompt: string | null;
  } | null;
  let text: string;
  try {
    text = await transcribeWithGroq({
      audio: new Blob([audio], { type: segment.mime_type }),
      fileName: segment.storage_path.split("/").at(-1) ?? `${segment.seq}.webm`,
      language: whisperLanguage(recording?.language),
      prompt: recording?.asr_prompt ?? null,
    });
  } catch (error) {
    // Al primer fallo de Groq se arranca Kaggle en paralelo: si Groq sigue
    // fallando, el respaldo ya estará listo cuando le llegue el audio.
    await dispatchKaggleWorker(admin);
    // Cupo por minuto lleno: esperar sin gastar intento. Cupo por hora o día
    // agotado: no tiene sentido reintentar, pasa al respaldo.
    if (error instanceof TranscriptionError && error.retryAfterSeconds !== undefined) {
      if (error.retryAfterSeconds <= GROQ_MAX_DEFER_SECONDS) {
        throw new DeferJob(Math.max(5, Math.ceil(error.retryAfterSeconds)));
      }
      throw new TranscriptionError(error.message, false);
    }
    throw error;
  }
  await completeSegment(admin, segment.id, text, "groq");
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
    .select("title, description, weight, rubric_levels(score, label, descriptor)")
    .eq("rubric_id", rubric.id)
    .is("deleted_at", null)
    .order("order");
  return (criteria ?? []).map(({ rubric_levels, ...criterion }) => ({
    ...criterion,
    levels: [...(rubric_levels ?? [])].sort((a, b) => a.score - b.score),
  }));
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
    .select(
      "id, event_id, team_id, transcript, analysis_state, team:teams(name, project_title, challenge_id), event:events(kind, settings, locale)",
    )
    .maybeSingle();
  if (!recording?.transcript) throw new TranscriptionError("No hay transcripción.", false);

  const teamValue = recording.team as unknown as TeamRelation;
  const team = Array.isArray(teamValue) ? teamValue[0] : teamValue;
  const eventValue = recording.event as unknown as EventRelation;
  const event = Array.isArray(eventValue) ? eventValue[0] : eventValue;
  const kind: SpaceKind = event?.kind ?? "custom";
  const instructions = cleanAdminText(event?.settings?.ai?.instructions, INSTRUCTIONS_MAX);
  // Nodos guardados con otra versión de los prompts no se mezclan con los nuevos.
  const saved = recording.analysis_state as AnalysisState;
  const state: AnalysisState =
    saved?.promptVersion === PROMPT_VERSION ? { ...saved } : { promptVersion: PROMPT_VERSION };

  const { insights, jury, models } = await runPresentationGraph({
    transcript: recording.transcript,
    teamName: team?.name ?? "Proyecto",
    projectTitle: team?.project_title ?? null,
    criteria: await rubricCriteria(admin, recording.event_id),
    kind,
    instructions,
    locale: event?.locale ?? "es",
    previous: state,
    deps: {
      acquireSlot: () => acquireSlot(admin, "nvidia"),
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
    weaknesses: jury.weaknesses,
    prompt_version: PROMPT_VERSION,
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
      prompt_version: PROMPT_VERSION,
      analysis_meta: {
        promptVersion: PROMPT_VERSION,
        kind,
        instructionsHash: instructions ? shortHash(instructions) : null,
        // Solo los modelos de esta pasada; los nodos reutilizados no llaman a ninguno.
        models,
      },
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
      "Groq no pudo transcribir y el transcriptor de respaldo no llegó a conectarse.",
      false,
    );
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
 * Ejecuta trabajos internos en `lanes` carriles paralelos respetando el
 * límite global de concurrencia. Cada carril sigue reclamando trabajos hasta
 * vaciar la cola o agotar su tiempo. Se llama tras cada subida (con after())
 * y desde el pulso.
 */
export async function runInternalJobs(admin: SupabaseClient, lanes = 2) {
  const deadline = Date.now() + LANE_DEADLINE_MS;
  const results = await Promise.all(
    Array.from({ length: lanes }, () => runLane(admin, deadline)),
  );
  return results.reduce((sum, count) => sum + count, 0);
}

async function runLane(admin: SupabaseClient, deadline: number) {
  const workerId = `vercel-${crypto.randomUUID().slice(0, 8)}`;
  let processed = 0;
  while (Date.now() < deadline) {
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
