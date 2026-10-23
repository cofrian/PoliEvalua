import { z } from "zod";

import { buildAsrPrompt } from "@/lib/ai/prompts/presentation";
import {
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { recordingSettings } from "@/lib/app/recording-notice";
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

    const [{ data: team }, { data: event }] = await Promise.all([
      session.supabase
        .from("teams")
        .select("id, name, project_title, challenge:challenges(name)")
        .eq("id", parsed.data.teamId)
        .eq("event_id", session.eventId)
        .maybeSingle(),
      session.supabase.from("events").select("settings, locale").eq("id", session.eventId).maybeSingle(),
    ]);
    if (!team) throw new PresentationAccessError(404, "No se encuentra el proyecto.");
    // Sin activar, nadie ha visto el aviso de grabación: no se puede grabar.
    if (!recordingSettings(event?.settings).enabled) {
      throw new PresentationAccessError(
        403,
        "La grabación de exposiciones no está activada en este espacio. La gestión puede activarla en Admin → Grabaciones.",
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
        "Has alcanzado el límite de grabaciones. Inténtalo dentro de una hora.",
      );
    }
    await recordAttempt(admin, "transcription", rateKeys);

    const id = crypto.randomUUID();
    // Pista de vocabulario para Whisper: se calcula una vez por grabación.
    const { data: rubric } = await admin
      .from("rubrics")
      .select("rubric_criteria(title, deleted_at)")
      .eq("event_id", session.eventId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const challenge = team.challenge as unknown as { name: string } | { name: string }[] | null;
    const asrPrompt = buildAsrPrompt({
      teamName: team.name,
      projectTitle: team.project_title,
      challengeName: (Array.isArray(challenge) ? challenge[0] : challenge)?.name,
      criteria: ((rubric?.rubric_criteria ?? []) as { title: string; deleted_at: string | null }[])
        .filter((criterion) => !criterion.deleted_at)
        .map((criterion) => criterion.title),
    });
    const { error } = await session.supabase.from("presentation_recordings").insert({
      id,
      event_id: session.eventId,
      team_id: team.id,
      created_by: session.user.id,
      title: parsed.data.title,
      storage_path: `events/${session.eventId}/presentations/${team.id}/${id}/`,
      mime_type: "audio/webm",
      // Idioma hablado: el del espacio (Whisper entiende «ca» como valenciano).
      language: event?.locale || process.env.TRANSCRIPTION_LANGUAGE || "es",
      visibility: parsed.data.visibility,
      status: "uploading",
      asr_prompt: asrPrompt,
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
