import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/auth";

export async function POST(req: Request) {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) await (await supabaseServer()).auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
