import { z } from "zod";

import {
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { clientIp, isBlocked, recordAttempt } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  teamId: z.string().uuid(),
  title: z.string().trim().min(2).max(160),
  visibility: z.enum(["private", "event"]),
});

/** Crea una grabación vacía; el audio llega después, segmento a segmento. */
export async function POST(request: Request) {
  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new PresentationAccessError(400, "La grabación no tiene un formato válido.");
    }

    const session = await getPresentationApiSession();
    if (!session.canCreate) {
      throw new PresentationAccessError(403, "El perfil de consulta no puede crear grabaciones.");
    }

    const { data: team } = await session.supabase
      .from("teams")
      .select("id")
      .eq("id", parsed.data.teamId)
      .eq("event_id", session.eventId)
      .maybeSingle();
    if (!team) throw new PresentationAccessError(404, "No se encuentra el proyecto.");

    const admin = createAdminClient();
    const rateKeys = [
      `transcription:user:${session.user.id}`,
      `transcription:ip:${await clientIp()}`,
    ];
    if (await isBlocked(admin, "transcription", rateKeys)) {
      throw new PresentationAccessError(
        429,
        "Has alcanzado el límite de grabaciones. Inténtalo dentro de una hora.",
      );
    }
    await recordAttempt(admin, "transcription", rateKeys);

    const id = crypto.randomUUID();
    const { error } = await session.supabase.from("presentation_recordings").insert({
      id,
      event_id: session.eventId,
      team_id: team.id,
      created_by: session.user.id,
      title: parsed.data.title,
      storage_path: `events/${session.eventId}/presentations/${team.id}/${id}/`,
      mime_type: "audio/webm",
      language: process.env.TRANSCRIPTION_LANGUAGE || "es",
      visibility: parsed.data.visibility,
      status: "uploading",
    });
    if (error) {
      console.error("No se pudo crear la grabación:", error.message);
      throw new PresentationAccessError(500, "No se ha podido crear la grabación.");
    }
    return Response.json({ id });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
