import { after } from "next/server";
import { z } from "zod";

import {
  getOwnedRecording,
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { maybeAssemble, runInternalJobs } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const requestSchema = z.object({
  segmentsExpected: z.number().int().min(1).max(200),
  durationSeconds: z.number().int().min(1).max(7200),
  sizeBytes: z.number().int().min(1).max(524_288_000),
});

/** Cierra la grabación: a partir de aquí se sabe cuántos segmentos esperar. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new PresentationAccessError(400, "Datos de cierre no válidos.");

    const session = await getPresentationApiSession();
    const recording = await getOwnedRecording(session, id);
    if (recording.finalized_at) return Response.json({ status: recording.status });

    const admin = createAdminClient();
    await admin
      .from("presentation_recordings")
      .update({
        segments_expected: parsed.data.segmentsExpected,
        duration_seconds: parsed.data.durationSeconds,
        size_bytes: parsed.data.sizeBytes,
        finalized_at: new Date().toISOString(),
        status: "queued",
      })
      .eq("id", id);

    await maybeAssemble(admin, id);
    after(() => runInternalJobs(admin, 2));
    return Response.json({ status: "queued" });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
