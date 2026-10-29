import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { hasSupabaseEnv, supabaseEnv } from "./env";

const PUBLIC_PATHS = ["/login", "/forgot-password", "/auth/callback", "/auth/confirm"];

// Keeps the session fresh on every request and sends signed-out visitors to /login.
// This is only a fast first check; every page and action checks access again.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!hasSupabaseEnv()) return response;

  const { url, key } = supabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const signedIn = !!data?.claims;
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path === p || path.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    to.search = "";
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  // Invited but no password yet: finish setup first (they'd otherwise be locked out next time).
  const meta = data?.claims?.user_metadata as { needs_password?: boolean } | undefined;
  if (signedIn && meta?.needs_password && !isPublic && path !== "/reset-password" && !path.startsWith("/api/")) {
    const to = request.nextUrl.clone();
    to.pathname = "/reset-password";
    to.search = "?welcome=1";
    const redirect = NextResponse.redirect(to);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}
