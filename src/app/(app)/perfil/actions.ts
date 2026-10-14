"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/app/session";

export type ProfileState = { ok: boolean; message: string } | null;

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const { supabase, user } = await getSession();
  const fullName = String(formData.get("fullName") ?? "").trim();
  const organization = String(formData.get("organization") ?? "").trim();
  const avatar = formData.get("avatar");

  if (fullName.length < 2) {
    return { ok: false, message: "Escribe tu nombre completo." };
  }

  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size) {
    if (!avatar.type.startsWith("image/")) {
      return { ok: false, message: "La foto debe ser una imagen." };
    }
    if (avatar.size > 4 * 1024 * 1024) {
      return { ok: false, message: "La foto no puede pasar de 4 MB." };
    }
    const extension = avatar.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `avatars/${user.id}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("public-assets")
      .upload(path, avatar, { contentType: avatar.type, upsert: true });
    if (error) return { ok: false, message: "No se ha podido subir la foto." };
    avatarUrl = supabase.storage.from("public-assets").getPublicUrl(path).data.publicUrl;
  }

  const removeAvatar = formData.get("removeAvatar") === "on";
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      organization: organization || null,
      ...(avatarUrl ? { avatar_url: avatarUrl } : removeAvatar ? { avatar_url: null } : {}),
    })
    .eq("id", user.id);

  if (error) return { ok: false, message: "No se ha podido guardar el perfil." };

  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil guardado." };
}
