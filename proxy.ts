import { createServerClient } from "@supabase/ssr";
import createIntlMiddleware from "next-intl/middleware";
import { type NextRequest, NextResponse } from "next/server";
import { routing } from "@/i18n/routing";
import { isSupabaseConfigured, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

const handleI18n = createIntlMiddleware(routing);

// Signed-in area: /th/app/..., /en/app/...
const PROTECTED = /^\/(th|en)\/app(\/|$)/;

export default async function proxy(request: NextRequest) {
  // When a sign-in's return address isn't on Supabase's allowed list, Supabase sends the user to its Site URL with
  // ?code=… instead. If that is this site, finish the sign-in here rather than dropping the code (the PKCE proof is
  // in this site's cookies, so it only works on the same address the sign-in started from).
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/callback";
    url.search = "";
    url.searchParams.set("code", code);
    url.searchParams.set("next", "/th/app");
    return NextResponse.redirect(url);
  }

  const response = handleI18n(request);
  if (!isSupabaseConfigured()) return response;

  // Refresh the Supabase session cookie on every request and gate the app area.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getClaims();

  const { pathname } = request.nextUrl;
  if (!data?.claims && PROTECTED.test(pathname)) {
    const locale = pathname.split("/")[1];
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    url.search = "";
    url.searchParams.set("next", pathname + request.nextUrl.search);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  return response;
}

export const config = {
  // Skip API routes, the auth callback, Next internals and files with an extension.
  matcher: ["/((?!api|auth|_next|_vercel|.*\\..*).*)"],
};
