"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/app/session";

/**
 * Activa o desactiva la vista de jurado para la gestión. Solo cambia lo que se
 * ve en este dispositivo: los permisos reales no se tocan.
 */
export async function setJuryViewAction(enabled: boolean) {
  const { realAdmin } = await getSession();
  if (!realAdmin) return;
  const store = await cookies();
  if (enabled) {
    store.set("jury_view", "1", { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  } else {
    store.delete("jury_view");
  }
  revalidatePath("/", "layout");
}
