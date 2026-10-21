import { z } from "zod";

import {
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  sizeBytes: z.number().int().positive().max(52_428_800),
  durationSeconds: z.number().int().min(1).max(1200),
  visibility: z.enum(["private", "event"]),
  mimeType: z.enum(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]).default("audio/webm"),
});

const extensions = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
} as const;

export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      throw new PresentationAccessError(
        400,
        "La grabación no tiene un formato válido o supera 20 minutos/50 MB.",
      );
    }

    const session = await getPresentationApiSession();
    if (!session.canCreate) {
      throw new PresentationAccessError(
        403,
        "El perfil de consulta no puede crear grabaciones.",
      );
    }

    const { data: team } = await session.supabase
      .from("teams")
      .select("id")
      .eq("id", parsed.data.teamId)
      .eq("event_id", session.eventId)
      .maybeSingle();
    if (!team) {
      throw new PresentationAccessError(404, "No se encuentra el proyecto.");
    }

    const id = crypto.randomUUID();
    const path = `events/${session.eventId}/presentations/${team.id}/${id}.${extensions[parsed.data.mimeType]}`;
    const { error: insertError } = await session.supabase
      .from("presentation_recordings")
      .insert({
        id,
        event_id: session.eventId,
        team_id: team.id,
        created_by: session.user.id,
        title: parsed.data.title,
        storage_path: path,
        mime_type: parsed.data.mimeType,
        size_bytes: parsed.data.sizeBytes,
        duration_seconds: parsed.data.durationSeconds,
        language: process.env.TRANSCRIPTION_LANGUAGE || "es",
        visibility: parsed.data.visibility,
        status: "uploading",
      });

    if (insertError) {
      console.error("No se pudo crear la grabación:", insertError.message);
      throw new PresentationAccessError(
        500,
        "No se ha podido preparar la subida.",
      );
    }

    const admin = createAdminClient();
    const { data: signed, error: signedError } = await admin.storage
      .from("presentation-audio")
      .createSignedUploadUrl(path, { upsert: false });

    if (signedError || !signed) {
      await admin
        .from("presentation_recordings")
        .update({
          status: "inactive",
          deleted_at: new Date().toISOString(),
          error_message: "No se pudo crear el enlace de subida.",
        })
        .eq("id", id)
        .eq("event_id", session.eventId);
      console.error(
        "No se pudo firmar la subida:",
        signedError?.message ?? "sin respuesta",
      );
      throw new PresentationAccessError(
        500,
        "No se ha podido preparar el almacenamiento privado.",
      );
    }

    return Response.json({ id, path: signed.path, token: signed.token });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}

