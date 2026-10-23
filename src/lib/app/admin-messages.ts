import "server-only";

import { getTranslations } from "next-intl/server";

type Values = Record<string, string | number>;

/** Mensajes de las acciones de gestión, en el idioma de quien las usa. */
export async function adminMessage(key: string, values?: Values) {
  const t = await getTranslations("adminMessages");
  return t(key as never, values as never);
}
