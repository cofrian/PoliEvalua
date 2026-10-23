"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

import { getSession } from "@/lib/app/session";

export type ProfileState = { ok: boolean; message: string } | null;

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const { supabase, user } = await getSession();
  const t = await getTranslations("profile");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const organization = String(formData.get("organization") ?? "").trim();
  const avatar = formData.get("avatar");
  const localeValue = formData.get("locale");
  const locale = isLocale(localeValue) ? localeValue : null;

  if (fullName.length < 2) {
    return { ok: false, message: t("errors.name") };
  }

  let avatarUrl: string | undefined;
  if (avatar instanceof File && avatar.size) {
    if (!avatar.type.startsWith("image/")) {
      return { ok: false, message: t("errors.image") };
    }
    if (avatar.size > 4 * 1024 * 1024) {
      return { ok: false, message: t("errors.size") };
    }
    const extension = avatar.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `avatars/${user.id}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage
      .from("public-assets")
      .upload(path, avatar, { contentType: avatar.type, upsert: true });
    if (error) return { ok: false, message: t("errors.upload") };
    avatarUrl = supabase.storage.from("public-assets").getPublicUrl(path).data.publicUrl;
  }

  const removeAvatar = formData.get("removeAvatar") === "on";
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      organization: organization || null,
      locale,
      ...(avatarUrl ? { avatar_url: avatarUrl } : removeAvatar ? { avatar_url: null } : {}),
    })
    .eq("id", user.id);

  if (error) return { ok: false, message: t("errors.save") };

  const cookieStore = await cookies();
  if (locale) {
    cookieStore.set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  } else {
    cookieStore.delete(LOCALE_COOKIE);
  }

  revalidatePath("/", "layout");
  // El mensaje sale ya en el idioma recién elegido.
  const tSaved = locale ? await getTranslations({ locale, namespace: "profile" }) : t;
  return { ok: true, message: tSaved("saved") };
}
