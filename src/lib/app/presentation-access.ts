import "server-only";

import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import es from "../../../messages/es.json";

import { createClient } from "@/lib/supabase/server";

export class PresentationAccessError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function getPresentationApiSession() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new PresentationAccessError(401, "Debes iniciar sesión.");

  const eventId = (await cookies()).get("active_event_id")?.value;
  if (!eventId) {
    throw new PresentationAccessError(409, "Selecciona primero un espacio.");
  }

  const { data: membership } = await supabase
    .from("event_members")
    .select("role, status")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.status !== "active") {
    throw new PresentationAccessError(403, "No perteneces a este espacio.");
  }

  return {
    supabase,
    user,
    eventId,
    role: membership.role as string,
    canManage: ["owner", "manager"].includes(membership.role),
    canCreate: membership.role !== "viewer",
  };
}

type PresentationSession = Awaited<ReturnType<typeof getPresentationApiSession>>;

/** Grabación del espacio activo que el usuario puede modificar (autor o gestor). */
export async function getOwnedRecording(session: PresentationSession, id: string) {
  const { data: recording } = await session.supabase
    .from("presentation_recordings")
    .select("id, event_id, team_id, created_by, status, storage_path, finalized_at, audio_deleted_at")
    .eq("id", id)
    .eq("event_id", session.eventId)
    .maybeSingle();
  if (!recording) {
    throw new PresentationAccessError(404, "No se encuentra la grabación.");
  }
  if (recording.created_by !== session.user.id && !session.canManage) {
    throw new PresentationAccessError(
      403,
      "Solo quien creó la grabación o un gestor puede modificarla.",
    );
  }
  return recording;
}

// Los errores se escriben en castellano en el código; aquí se traducen al
// idioma de quien llama buscando su clave en messages/es.json.
const apiErrorKeys = new Map(Object.entries(es.apiErrors).map(([key, text]) => [text, key]));

async function translateApiError(message: string) {
  const key = apiErrorKeys.get(message);
  if (!key) return message;
  const t = await getTranslations("apiErrors");
  return t(key as keyof typeof es.apiErrors);
}

export async function presentationErrorResponse(error: unknown) {
  if (error instanceof PresentationAccessError) {
    return Response.json({ error: await translateApiError(error.message) }, { status: error.status });
  }
  console.error(
    "Error en grabaciones de exposiciones:",
    error instanceof Error ? error.message : "Error desconocido",
  );
  return Response.json({ error: await translateApiError(es.apiErrors.generic) }, { status: 500 });
}
