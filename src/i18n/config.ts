// Idiomas de la interfaz. La URL no cambia: el idioma va en una cookie que se
// sincroniza con profiles.locale al entrar y al guardar el perfil.
export const LOCALES = ["es", "ca", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export const localeNames: Record<Locale, string> = {
  es: "Castellano",
  ca: "Valencià",
  en: "English",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** Primer idioma admitido de una cabecera Accept-Language. */
export function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    const base = tag.split("-")[0];
    // «ca-ES-valencia», «ca» y «va» se sirven en valencià.
    if (base === "ca" || base === "va") return "ca";
    if (isLocale(base)) return base;
  }
  return null;
}
