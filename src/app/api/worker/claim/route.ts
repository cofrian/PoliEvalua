import { z } from "zod";

import {
  AUDIO_BUCKET,
  EXTERNAL_LEASE_SECONDS,
  isWorkerRequest,
  sweepQueue,
} from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  workerId: z.string().trim().min(1).max(120),
});

/** Entrega al trabajador externo el siguiente segmento pendiente, o 204. */
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

  const { data: jobs, error } = await admin.rpc("claim_processing_job", {
    p_worker_id: parsed.data.workerId,
    p_runner: "external",
    p_lease_seconds: EXTERNAL_LEASE_SECONDS,
  });
  if (error) {
    console.error("No se pudo reclamar un trabajo:", error.message);
    return Response.json({ error: "Cola no disponible." }, { status: 500 });
  }
  const job = (
    jobs as { id: string; recording_id: string; segment_id: string | null; attempts: number }[] | null
  )?.[0];
  if (!job?.segment_id) return new Response(null, { status: 204 });

  const { data: segment } = await admin
    .from("presentation_segments")
    .update({ status: "transcribing" })
    .eq("id", job.segment_id)
    .select("storage_path, mime_type, start_ms, end_ms, recording:presentation_recordings(language)")
    .maybeSingle();
  if (!segment) {
    await admin.from("processing_jobs").update({ status: "failed" }).eq("id", job.id);
    return new Response(null, { status: 204 });
  }

  const { data: signed, error: signedError } = await admin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(segment.storage_path, 15 * 60);
  if (signedError || !signed) {
    console.error("No se pudo firmar la descarga:", signedError?.message ?? "sin respuesta");
    return Response.json({ error: "Audio no disponible." }, { status: 500 });
  }

  const recording = segment.recording as unknown as { language: string } | null;
  return Response.json({
    jobId: job.id,
    attempt: job.attempts,
    audioUrl: signed.signedUrl,
    mimeType: segment.mime_type,
    language: (recording?.language ?? "es").split("-")[0],
    durationSeconds: Math.round((segment.end_ms - segment.start_ms) / 1000),
    leaseSeconds: EXTERNAL_LEASE_SECONDS,
  });
}
