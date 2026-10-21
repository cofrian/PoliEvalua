import {
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { deleteAudio } from "@/lib/app/transcription-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await getPresentationApiSession();
    const { data: recording } = await session.supabase
      .from("presentation_recordings")
      .select("id, created_by, storage_path, audio_deleted_at")
      .eq("id", id)
      .eq("event_id", session.eventId)
      .maybeSingle();
    if (!recording) {
      throw new PresentationAccessError(404, "No se encuentra la grabación.");
    }
    if (recording.created_by !== session.user.id && !session.canManage) {
      throw new PresentationAccessError(
        403,
        "Solo quien creó la grabación o un gestor puede retirarla.",
      );
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("presentation_recordings")
      .update({
        status: "inactive",
        deleted_at: new Date().toISOString(),
      })
      .eq("id", recording.id)
      .eq("event_id", session.eventId);
    if (error) {
      console.error("No se pudo retirar la grabación:", error.message);
      throw new PresentationAccessError(
        500,
        "No se ha podido retirar la grabación.",
      );
    }

    if (!recording.audio_deleted_at) await deleteAudio(admin, recording);
    return Response.json({ ok: true });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
