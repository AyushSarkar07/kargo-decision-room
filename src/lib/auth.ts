import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getConfig } from "./config";
import { accessCodeEnabled, openAccess, SESSION_COOKIE, verifySession } from "./access-code";

export interface Session {
  email: string;
  demo: boolean;
  /** No sign-in: anyone with the link can use the app. */
  open?: boolean;
}

export async function supabaseServer() {
  const jar = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        try {
          list.forEach(({ name, value, options }) => jar.set(name, value, options));
        } catch {
          // Called from a Server Component; the proxy refreshes cookies instead.
        }
      },
    },
  });
}

/** Returns the signed-in founder, or null. In local demo mode there is no sign-in and no real data. */
export async function getSession(): Promise<Session | null> {
  const cfg = getConfig();
  if (cfg.data === "local-demo") {
    if (process.env.VERCEL && process.env.ALLOW_DEMO_ON_DEPLOY !== "true") return null;
    return { email: "demo@localhost", demo: true };
  }
  if (openAccess()) return { email: "open access", demo: false, open: true };
  if (accessCodeEnabled()) {
    const jar = await cookies();
    return verifySession(jar.get(SESSION_COOKIE)?.value) ? { email: "founder", demo: false } : null;
  }
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email?.toLowerCase();
  if (!email || !cfg.founderEmails.includes(email)) return null;
  return { email, demo: false };
}

export class AuthError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Sign in required." : "Not allowed.");
  }
}

export async function requireFounder(): Promise<Session> {
  const s = await getSession();
  if (!s) throw new AuthError(401);
  return s;
}
