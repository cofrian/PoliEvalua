import { after } from "next/server";
import { z } from "zod";

import {
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import {
  analyzeRecording,
  enqueueTranscription,
  wakeWorkers,
  workerUrls,
} from "@/lib/app/transcription-queue";
import { clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

const requestSchema = z.object({
  transcript: z.string().trim().min(20).max(200_000).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => ({})),
    );
    if (!parsed.success) {
      throw new PresentationAccessError(
        400,
        "La transcripción manual debe tener entre 20 y 200.000 caracteres.",
      );
    }

    const session = await getPresentationApiSession();
    const { data: recording } = await session.supabase
      .from("presentation_recordings")
      .select("id, event_id, created_by, status, audio_deleted_at")
      .eq("id", id)
      .eq("event_id", session.eventId)
      .maybeSingle();

    if (!recording) {
      throw new PresentationAccessError(404, "No se encuentra la grabación.");
    }
    if (recording.created_by !== session.user.id && !session.canManage) {
      throw new PresentationAccessError(
        403,
        "Solo quien creó la grabación o un gestor puede procesarla.",
      );
    }

    const admin = createAdminClient();
    const rateKeys = [
      `transcription:user:${session.user.id}`,
      `transcription:ip:${await clientIp()}`,
    ];
    if (await isBlocked(admin, "transcription", rateKeys)) {
      throw new PresentationAccessError(
        429,
        "Has alcanzado el límite de procesamiento. Inténtalo dentro de una hora.",
      );
    }
    await recordAttempt(admin, "transcription", rateKeys);

    // Texto pegado o corregido a mano: no hace falta pasar por la cola.
    if (parsed.data.transcript) {
      await admin
        .from("presentation_recordings")
        .update({
          status: "transcribed",
          transcript: parsed.data.transcript,
          error_message: null,
        })
        .eq("id", recording.id)
        .eq("event_id", session.eventId);
      return Response.json(await analyzeRecording(admin, recording.id));
    }

    if (recording.audio_deleted_at) {
      throw new PresentationAccessError(
        409,
        "El audio ya no existe. Pega la transcripción para crear los materiales.",
      );
    }
    if (["queued", "transcribing", "analyzing"].includes(recording.status)) {
      return Response.json({ status: recording.status });
    }
    await enqueueTranscription(admin, recording);
    // Los trabajadores sin URL pública (Kaggle, Colab, PC) consultan solos la cola.
    if (workerUrls().length > 0) after(wakeWorkers);
    return Response.json({ status: "queued" });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
