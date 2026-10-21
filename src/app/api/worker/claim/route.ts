import { z } from "zod";

import {
  AUDIO_BUCKET,
  isWorkerRequest,
  JOB_LEASE_SECONDS,
  sweepQueue,
} from "@/lib/app/transcription-queue";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  workerId: z.string().trim().min(1).max(120),
});

/** Entrega al trabajador el siguiente audio pendiente, o 204 si no hay. */
export async function POST(request: Request) {
  if (!isWorkerRequest(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Falta workerId." }, { status: 400 });
  }

  const admin = createAdminClient();
  await sweepQueue(admin);

  const { data: jobs, error } = await admin.rpc("claim_transcription_job", {
    p_worker_id: parsed.data.workerId,
    p_lease_seconds: JOB_LEASE_SECONDS,
  });
  if (error) {
    console.error("No se pudo reclamar un trabajo:", error.message);
    return Response.json({ error: "Cola no disponible." }, { status: 500 });
  }
  const job = (jobs as { id: string; recording_id: string; attempts: number }[] | null)?.[0];
  if (!job) return new Response(null, { status: 204 });

  const { data: recording } = await admin
    .from("presentation_recordings")
    .update({ status: "transcribing", error_message: null })
    .eq("id", job.recording_id)
    .select("id, storage_path, mime_type, language, duration_seconds")
    .maybeSingle();
  if (!recording) {
    await admin.from("transcription_jobs").update({ status: "failed" }).eq("id", job.id);
    return new Response(null, { status: 204 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(recording.storage_path, 15 * 60);
  if (signedError || !signed) {
    console.error("No se pudo firmar la descarga:", signedError?.message ?? "sin respuesta");
    return Response.json({ error: "Audio no disponible." }, { status: 500 });
  }

  return Response.json({
    jobId: job.id,
    attempt: job.attempts,
    audioUrl: signed.signedUrl,
    mimeType: recording.mime_type,
    language: recording.language.split("-")[0],
    durationSeconds: recording.duration_seconds,
    leaseSeconds: JOB_LEASE_SECONDS,
  });
}
