import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { LOCALE_COOKIE, isLocale } from "@/i18n/config";

const PUBLIC_ROUTES = new Set([
  "/",
  "/login",
  "/registro",
  "/auth/callback",
]);

const AUTH_ENTRY_ROUTES = new Set(["/", "/login", "/registro"]);

function copyResponseCookies(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export async function middleware(request: NextRequest) {
  // Transcriptores, el pulso de pg_cron y la sonda de salud no tienen sesión:
  // usan su propio token.
  if (
    request.nextUrl.pathname.startsWith("/api/worker/") ||
    request.nextUrl.pathname.startsWith("/api/jobs/") ||
    request.nextUrl.pathname.startsWith("/api/health/")
  ) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  // La votación del público (QR) no necesita cuenta.
  const isPublicRoute = PUBLIC_ROUTES.has(pathname) || pathname.startsWith("/votar/");

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return copyResponseCookies(response, NextResponse.redirect(loginUrl));
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("disabled, locale")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.disabled) {
      await supabase.auth.signOut({ scope: "local" });
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "?reason=disabled";
      return copyResponseCookies(response, NextResponse.redirect(loginUrl));
    }

    // El idioma elegido en el perfil manda sobre el del navegador en cualquier dispositivo.
    if (isLocale(profile.locale) && request.cookies.get(LOCALE_COOKIE)?.value !== profile.locale) {
      request.cookies.set(LOCALE_COOKIE, profile.locale);
      // Rehacer la respuesta para que el render vea la cookie sin perder las de sesión.
      response = copyResponseCookies(response, NextResponse.next({ request }));
      response.cookies.set(LOCALE_COOKIE, profile.locale, { maxAge: 60 * 60 * 24 * 365, path: "/" });
    }

    const isInvitationAccess =
      (pathname === "/login" || pathname === "/registro") &&
      request.nextUrl.searchParams.has("invite");

    if (AUTH_ENTRY_ROUTES.has(pathname) && !isInvitationAccess) {
      const spacesUrl = request.nextUrl.clone();
      spacesUrl.pathname = "/espacios";
      spacesUrl.search = "";
      return copyResponseCookies(response, NextResponse.redirect(spacesUrl));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
