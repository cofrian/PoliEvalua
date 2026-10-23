import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, localeFromAcceptLanguage } from "./config";

export default getRequestConfig(async ({ locale: requested }) => {
  // Una página puede pedir un idioma concreto (la votación pública usa el del espacio).
  let locale = isLocale(requested) ? requested : null;
  if (!locale) {
    const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
    locale = isLocale(cookie)
      ? cookie
      : localeFromAcceptLanguage((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Europe/Madrid",
  };
});
