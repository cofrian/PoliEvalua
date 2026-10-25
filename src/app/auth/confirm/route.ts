import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/** Enlaces de los correos propios (recuperar contraseña): abre la sesión y sigue a `next`. */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next");
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/espacios";

  // Se redirige al mismo host por el que se entró (cabecera Host), para que la
  // cookie de la sesión recién abierta viaje con la persona.
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const origin = host ? `${protocol}://${host}` : url.origin;
  const to = (path: string) => NextResponse.redirect(new URL(path, origin));

  if (tokenHash && type === "recovery") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return to(safeNext);
  }

  return to("/recuperar?error=enlace");
}
