import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  if (!user && !isPublicRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    return copyResponseCookies(response, NextResponse.redirect(loginUrl));
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("disabled")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile || profile.disabled) {
      await supabase.auth.signOut({ scope: "local" });
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = "/login";
      loginUrl.search = "?reason=disabled";
      return copyResponseCookies(response, NextResponse.redirect(loginUrl));
    }

    if (AUTH_ENTRY_ROUTES.has(pathname)) {
      const teamsUrl = request.nextUrl.clone();
      teamsUrl.pathname = "/equipos";
      teamsUrl.search = "";
      return copyResponseCookies(response, NextResponse.redirect(teamsUrl));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
