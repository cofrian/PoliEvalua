import { after } from "next/server";

import {
  getOwnedRecording,
  getPresentationApiSession,
  PresentationAccessError,
  presentationErrorResponse,
} from "@/lib/app/presentation-access";
import { AUDIO_BUCKET, enqueueJob, runInternalJobs } from "@/lib/app/processing-queue";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Confirma que el segmento está subido y lo pone en la cola de transcripción. */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; seq: string }> },
) {
  try {
    const { id, seq } = await params;
    const session = await getPresentationApiSession();
    const recording = await getOwnedRecording(session, id);

    const admin = createAdminClient();
    const { data: segment } = await admin
      .from("presentation_segments")
      .select("id, status, storage_path")
      .eq("recording_id", id)
      .eq("seq", Number(seq))
      .maybeSingle();
    if (!segment) throw new PresentationAccessError(404, "No se encuentra el segmento.");
    if (segment.status !== "uploading") return Response.json({ status: segment.status });

    // Comprobamos que el archivo existe de verdad antes de encolarlo.
    const folder = segment.storage_path.slice(0, segment.storage_path.lastIndexOf("/"));
    const fileName = segment.storage_path.slice(folder.length + 1);
    const { data: files } = await admin.storage
      .from(AUDIO_BUCKET)
      .list(folder, { search: fileName, limit: 1 });
    if (!files?.some((file) => file.name === fileName)) {
      throw new PresentationAccessError(409, "El segmento todavía no se ha subido.");
    }

    await admin.from("presentation_segments").update({ status: "queued" }).eq("id", segment.id);
    await enqueueJob(admin, {
      kind: "transcribe_segment",
      recordingId: id,
      eventId: recording.event_id,
      segmentId: segment.id,
    });
    after(() => runInternalJobs(admin, 2));
    return Response.json({ status: "queued" });
  } catch (error) {
    return presentationErrorResponse(error);
  }
}
