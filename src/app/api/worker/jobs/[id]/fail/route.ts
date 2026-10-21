import { z } from "zod";

import { failJob, isWorkerRequest } from "@/lib/app/transcription-queue";
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
    .from("transcription_jobs")
    .select("id")
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .maybeSingle();
  if (!job) {
    return Response.json({ error: "El trabajo ya no es tuyo." }, { status: 409 });
  }

  await failJob(admin, job.id, parsed.data.error, parsed.data.retryable);
  return Response.json({ ok: true });
}
