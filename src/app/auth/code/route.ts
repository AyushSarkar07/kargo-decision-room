import { NextResponse } from "next/server";
import { accessCodeEnabled, codeMatches, issueSession, SESSION_COOKIE, SESSION_DAYS } from "@/lib/access-code";

// Exchanges the access code for a 30-day signed session cookie.
export async function POST(req: Request) {
  const form = await req.formData();
  const code = String(form.get("code") ?? "");
  if (!accessCodeEnabled() || !codeMatches(code)) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return NextResponse.redirect(new URL("/login?error=1", req.url), { status: 303 });
  }
  const res = NextResponse.redirect(new URL("/", req.url), { status: 303 });
  res.cookies.set(SESSION_COOKIE, issueSession(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86400,
  });
  return res;
}
