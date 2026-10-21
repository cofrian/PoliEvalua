import "server-only";

import { cookies } from "next/headers";

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

export function presentationErrorResponse(error: unknown) {
  if (error instanceof PresentationAccessError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(
    "Error en grabaciones de exposiciones:",
    error instanceof Error ? error.message : "Error desconocido",
  );
  return Response.json(
    { error: "No se ha podido completar la operación." },
    { status: 500 },
  );
}
