import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";
import { SESSION_COOKIE } from "@/lib/access-code";

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) await (await supabaseServer()).auth.signOut();
  const res = NextResponse.redirect(new URL("/login", req.url), { status: 303 });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
