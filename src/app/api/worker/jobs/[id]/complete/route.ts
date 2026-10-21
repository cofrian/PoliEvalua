import { after } from "next/server";
import { z } from "zod";

import {
  completeSegment,
  isWorkerRequest,
  runInternalJobs,
} from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const requestSchema = z.object({
  workerId: z.string().trim().min(1).max(120),
  // Un segmento sin voz (pausa larga) es válido y llega vacío.
  transcript: z.string().trim().max(50_000),
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
    .from("processing_jobs")
    .update({ status: "done", locked_until: null, last_error: null })
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .select("segment_id")
    .maybeSingle();
  if (!job?.segment_id) {
    // La reserva caducó y otro ejecutor lo tiene: se descarta este resultado.
    return Response.json({ error: "El trabajo ya no es tuyo." }, { status: 409 });
  }

  await completeSegment(admin, job.segment_id, parsed.data.transcript, "external");
  // Si era el último segmento, la unión y el análisis siguen en segundo plano.
  after(() => runInternalJobs(admin, 2));
  return Response.json({ ok: true });
}
