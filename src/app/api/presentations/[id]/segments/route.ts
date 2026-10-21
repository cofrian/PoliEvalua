import { z } from "zod";

import {
  getOwnedRecording,
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { AUDIO_BUCKET } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

const extensions = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
} as const;

const requestSchema = z.object({
  seq: z.number().int().min(0).max(199),
  startMs: z.number().int().min(0),
  endMs: z.number().int().positive(),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"]),
});

/** Prepara la subida directa de un segmento al almacenamiento privado. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.endMs <= parsed.data.startMs) {
      throw new PresentationAccessError(400, "El segmento no es válido (máximo 20 MB).");
    }
    const session = await getPresentationApiSession();
    const recording = await getOwnedRecording(session, id);
    if (recording.finalized_at) {
      throw new PresentationAccessError(409, "La grabación ya está cerrada.");
    }

    const admin = createAdminClient();
    const path = `${recording.storage_path}${parsed.data.seq}.${extensions[parsed.data.mimeType]}`;
    const { data: existing } = await admin
      .from("presentation_segments")
      .select("status")
      .eq("recording_id", id)
      .eq("seq", parsed.data.seq)
      .maybeSingle();
    if (existing && existing.status !== "uploading") {
      return Response.json({ alreadyUploaded: true });
    }

    const { error } = await admin.from("presentation_segments").upsert(
      {
        recording_id: id,
        event_id: recording.event_id,
        seq: parsed.data.seq,
        storage_path: path,
        mime_type: parsed.data.mimeType,
        start_ms: parsed.data.startMs,
        end_ms: parsed.data.endMs,
        size_bytes: parsed.data.sizeBytes,
        status: "uploading",
      },
      { onConflict: "recording_id,seq" },
    );
    if (error) {
      console.error("No se pudo registrar el segmento:", error.message);
      throw new PresentationAccessError(500, "No se ha podido preparar el segmento.");
    }

    // upsert: un reintento tras un corte de red sobrescribe la subida a medias.
    const { data: signed, error: signedError } = await admin.storage
      .from(AUDIO_BUCKET)
      .createSignedUploadUrl(path, { upsert: true });
    if (signedError || !signed) {
      console.error("No se pudo firmar la subida:", signedError?.message ?? "sin respuesta");
      throw new PresentationAccessError(500, "No se ha podido preparar el almacenamiento.");
    }
    return Response.json({ path: signed.path, token: signed.token });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
