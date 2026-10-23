"use server";

import { cookies } from "next/headers";

import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { createClient } from "@/lib/supabase/server";

/** Cambia el idioma desde cualquier pantalla; con sesión, también queda en el perfil. */
export async function setLocaleAction(locale: string) {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
}
