import { z } from "zod";

import { handleJobFailure, isWorkerRequest } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  workerId: z.string().trim().min(1).max(120),
  error: z.string().trim().min(1).max(1000),
  retryable: z.boolean().default(true),
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
    return Response.json({ error: "Error no válido." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: job } = await admin
    .from("processing_jobs")
    .select("id, kind, runner, recording_id, segment_id, event_id, attempts, max_attempts")
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .maybeSingle();
  if (!job) {
    return Response.json({ error: "El trabajo ya no es tuyo." }, { status: 409 });
  }

  await handleJobFailure(admin, job, parsed.data.error, parsed.data.retryable);
  return Response.json({ ok: true });
}
