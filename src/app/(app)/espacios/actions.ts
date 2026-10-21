"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAccount } from "@/lib/app/session";

const spaceSchema = z.object({
  name: z.string().trim().min(3).max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(["hackathon", "class", "awards", "project", "custom"]),
  accessCode: z.string().trim().min(6).max(40),
  description: z.string().trim().max(500).optional(),
});

export type CreateSpaceState = {
  error?: string;
};

async function setActiveSpace(eventId: string) {
  const cookieStore = await cookies();
  cookieStore.set("active_event_id", eventId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function selectSpaceAction(formData: FormData) {
  const { supabase, user } = await getAccount();
  const eventId = String(formData.get("eventId") ?? "");
  const { data: membership } = await supabase
    .from("event_members")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) throw new Error("No tienes acceso activo a este espacio.");
  await setActiveSpace(membership.event_id);
  redirect("/equipos");
}

export async function createSpaceAction(
  _previousState: CreateSpaceState,
  formData: FormData,
): Promise<CreateSpaceState> {
  const parsed = spaceSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    kind: formData.get("kind"),
    accessCode: formData.get("accessCode"),
    description: formData.get("description"),
  });

  if (!parsed.success) {
    return {
      error:
        "Revisa el nombre, el identificador y el código de acceso (mínimo 6 caracteres).",
    };
  }

  const { supabase } = await getAccount();
  const { data, error } = await supabase.rpc("create_event_space", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_kind: parsed.data.kind,
    p_signup_code: parsed.data.accessCode.toUpperCase(),
    p_description: parsed.data.description || null,
  });

  if (error || typeof data !== "string") {
    const duplicate = error?.message.toLowerCase().includes("duplicate");
    return {
      error: duplicate
        ? "Ese identificador o código de acceso ya está en uso."
        : "No se ha podido crear el espacio. Inténtalo de nuevo.",
    };
  }

  await setActiveSpace(data);
  redirect("/admin");
}
