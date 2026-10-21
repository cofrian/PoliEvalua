import { after } from "next/server";
import { z } from "zod";

import {
  getOwnedRecording,
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import {
  enqueueJob,
  requeueFailedJobs,
  runInternalJobs,
} from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const requestSchema = z.object({
  transcript: z.string().trim().min(20).max(200_000).optional(),
});

/**
 * Recupera una grabación: con texto pegado a mano lanza solo el análisis;
 * sin texto, vuelve a encolar los trabajos que fallaron.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      throw new PresentationAccessError(
        400,
        "La transcripción manual debe tener entre 20 y 200.000 caracteres.",
      );
    }

    const session = await getPresentationApiSession();
    const recording = await getOwnedRecording(session, id);
    const admin = createAdminClient();

    if (parsed.data.transcript) {
      await admin
        .from("presentation_recordings")
        .update({
          status: "transcribed",
          transcript: parsed.data.transcript,
          analysis_state: {},
          error_message: null,
        })
        .eq("id", id);
      // Texto nuevo: se descarta un análisis anterior y se repite desde cero.
      await admin.from("processing_jobs").delete().eq("recording_id", id).eq("kind", "analyze");
      await enqueueJob(admin, {
        kind: "analyze",
        recordingId: id,
        eventId: recording.event_id,
        priority: 50,
      });
    } else if (recording.status === "failed" && recording.audio_deleted_at) {
      throw new PresentationAccessError(
        409,
        "El audio ya no existe. Pega la transcripción para crear los materiales.",
      );
    } else if (["failed", "transcribed"].includes(recording.status)) {
      await requeueFailedJobs(admin, id);
      await admin
        .from("presentation_recordings")
        .update({ status: "queued", error_message: null })
        .eq("id", id)
        .eq("status", "failed");
    } else {
      return Response.json({ status: recording.status });
    }

    after(() => runInternalJobs(admin, 2));
    return Response.json({ status: "queued" });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
