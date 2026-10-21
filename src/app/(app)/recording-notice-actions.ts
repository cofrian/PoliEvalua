"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/app/session";

export async function acknowledgeRecordingNoticeAction() {
  const { supabase, event } = await getSession();
  const { error } = await supabase.rpc("acknowledge_recording_notice", {
    target_event: event.id,
  });
  if (error) throw new Error("No se ha podido guardar la confirmación. Inténtalo de nuevo.");
  revalidatePath("/", "layout");
}
