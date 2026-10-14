"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getSession } from "@/lib/app/session";

async function requireAdmin() {
  const session = await getSession();
  if (!session.isAdmin) throw new Error("Solo el admin puede hacer esto.");
  return session;
}

const roleSchema = z.enum(["admin", "judge", "mentor"]);
const statusSchema = z.enum(["setup", "building", "judging", "closed"]);

export async function setUserRoleAction(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("id"));
  const role = roleSchema.parse(formData.get("role"));
  if (id === user.id) return; // evita que el admin se quite su propio rol

  await supabase.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin");
}

export async function toggleUserDisabledAction(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("id"));
  const disabled = formData.get("disabled") === "true";
  if (id === user.id) return;

  await supabase.from("profiles").update({ disabled }).eq("id", id);
  revalidatePath("/admin");
}

export async function updateEventAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id"));
  const status = statusSchema.parse(formData.get("status"));
  const signupCode = String(formData.get("signupCode") ?? "")
    .trim()
    .toUpperCase();

  await supabase
    .from("events")
    .update({
      status,
      signup_open: formData.get("signupOpen") === "on",
      ...(signupCode ? { signup_code: signupCode } : {}),
    })
    .eq("id", id);
  revalidatePath("/admin");
}
