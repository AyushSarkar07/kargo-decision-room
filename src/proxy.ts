import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { accessCodeEnabled, openAccess, SESSION_COOKIE, verifySession } from "@/lib/access-code";

// Refreshes the Supabase session cookie and sends signed-out visitors to /login.
// Every API route and server action also checks the session itself.
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // Same rule as getConfig(): live mode needs all three Supabase values; otherwise the app is in demo mode.
  if (!url || !key || !process.env.SUPABASE_SERVICE_ROLE_KEY) return NextResponse.next();
  const path = request.nextUrl.pathname;
  if (openAccess()) return path.startsWith("/login") ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();

  // Access-code sign-in: a signed cookie, checked locally.
  if (accessCodeEnabled()) {
    const ok = verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!ok && !path.startsWith("/login") && !path.startsWith("/auth/") && !path.startsWith("/api/")) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list, headers) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user && !path.startsWith("/login") && !path.startsWith("/api/")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks).*)"],
};
