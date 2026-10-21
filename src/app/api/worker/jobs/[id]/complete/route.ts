import { after } from "next/server";
import { z } from "zod";

import {
  analyzeRecording,
  deleteAudio,
  isWorkerRequest,
} from "@/lib/app/transcription-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const requestSchema = z.object({
  workerId: z.string().trim().min(1).max(120),
  transcript: z.string().trim().min(1).max(200_000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isWorkerRequest(request)) {
    return Response.json({ error: "No autorizado." }, { status: 401 });
  }
  const { id } = await params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Transcripción no válida." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("transcription_jobs")
    .update({ status: "done", locked_until: null, last_error: null })
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .select("recording_id")
    .maybeSingle();
  if (!job) {
    // La reserva caducó y otro trabajador lo tiene: se descarta este resultado.
    return Response.json({ error: "El trabajo ya no es tuyo." }, { status: 409 });
  }

  const { data: recording } = await admin
    .from("presentation_recordings")
    .update({
      status: "transcribed",
      transcript: parsed.data.transcript,
      error_message: null,
    })
    .eq("id", job.recording_id)
    .select("id, storage_path")
    .maybeSingle();
  if (recording) await deleteAudio(admin, recording);

  // El trabajador queda libre al momento; el análisis sigue en segundo plano.
  after(() => analyzeRecording(admin, job.recording_id));
  return Response.json({ ok: true });
}
