import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, requireFounder, type Session } from "./auth";
import { IngestError } from "./pipeline";
import { SendError } from "./email";
import { PIILeakError } from "./pii";
import { getStore } from "./store";
import type { Candidate } from "./board";
import type { EmailType } from "./types";
import type { Role } from "./rubric";

type Ctx = { params: Promise<Record<string, string>> };

export function handler(fn: (req: Request, params: Record<string, string>, session: Session) => Promise<unknown>) {
  return async (req: Request, ctx: Ctx) => {
    try {
      const session = await requireFounder();
      const out = await fn(req, await ctx.params, session);
      return out instanceof Response ? out : NextResponse.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e instanceof IngestError) return NextResponse.json({ error: e.message, existingId: e.existingId }, { status: e.status });
      if (e instanceof SendError) return NextResponse.json({ error: e.message, send: e.send }, { status: e.status });
      if (e instanceof PIILeakError) return NextResponse.json({ error: e.message }, { status: 422 });
      if (e instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: e.issues }, { status: 400 });
      console.error("[api]", (e as Error).message?.slice(0, 300));
      return NextResponse.json({ error: (e as Error).message ?? "Unexpected error" }, { status: 500 });
    }
  };
}

/** Everything the dashboard needs. Identifying details are included only for the signed-in founder. */
export async function loadCandidates(): Promise<Candidate[]> {
  const store = getStore();
  const [applicants, pii, evaluations, briefs, drafts, decisions, sends] = await Promise.all([
    store.listApplicants(),
    store.listPII(),
    store.listEvaluations(),
    store.listBriefs(),
    store.listDrafts(),
    store.listDecisions(),
    store.listSends(),
  ]);
  return applicants.map((a) => {
    const p = pii.find((x) => x.applicant_id === a.id);
    const ev = evaluations.filter((e) => e.applicant_id === a.id);
    const br = briefs.filter((b) => b.applicant_id === a.id);
    const dr = drafts.filter((d) => d.applicant_id === a.id);
    return {
      applicant: a,
      name: p?.full_name ?? null,
      email: p?.email ?? null,
      evaluations: Object.fromEntries(ev.map((e) => [e.role, e])) as Partial<Record<Role, (typeof ev)[number]>>,
      briefs: Object.fromEntries(br.map((b) => [b.role, b])) as Partial<Record<Role, (typeof br)[number]>>,
      drafts: Object.fromEntries(dr.map((d) => [d.type, d])) as Partial<Record<EmailType, (typeof dr)[number]>>,
      decision: decisions.find((d) => d.applicant_id === a.id) ?? null,
      sends: sends.filter((s) => s.applicant_id === a.id),
    };
  });
}
