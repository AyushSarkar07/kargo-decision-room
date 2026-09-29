// End-to-end timing run: upload the two held-back synthetic CVs, score them, record an
// Invite decision for the higher-ranked one, and confirm a send to the resolved test destination.
// Usage: BASE_URL=http://localhost:3100 [COOKIE="sb-...=..."] npx tsx scripts/e2e-two-new.ts
import { readFileSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const headers: Record<string, string> = process.env.COOKIE ? { cookie: process.env.COOKIE } : {};
const files = [
  { file: "s12_new_pm.txt", role: "PM" },
  { file: "s13_new_spm.txt", role: "SPM" },
];

async function call<T>(p: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + p, { ...init, headers: { ...headers, ...(init.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p} → ${res.status} ${body.error ?? ""}`);
  return body as T;
}
const json = (b: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

async function main() {
  const t0 = Date.now();
  const mark = (label: string) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s  ${label}`);
  const ids: string[] = [];
  for (const f of files) {
    const fd = new FormData();
    fd.append("file", new Blob([readFileSync(path.resolve(__dirname, "..", "fixtures", "synthetic", f.file))], { type: "text/plain" }), f.file);
    fd.append("role", f.role);
    fd.append("force", "true");
    const { applicant } = await call<{ applicant: { id: string } }>("/api/applicants", { method: "POST", body: fd });
    mark(`uploaded ${f.file} (${f.role})`);
    await call(`/api/applicants/${applicant.id}/score`, { method: "POST" });
    mark(`scored ${f.file}`);
    ids.push(applicant.id);
  }
  type C = { applicant: { id: string }; name: string; evaluations: Record<string, { ranking_score: number; coverage: number }>; briefs: Record<string, { sentences: string[] }>; drafts: Record<string, { id: string }>; sends: { status: string; provider_message_id: string; to_address: string; mode: string }[] };
  const state = await call<{ config: { ai: string; email: string }; candidates: C[] }>("/api/state");
  const mine = state.candidates.filter((c) => ids.includes(c.applicant.id));
  for (const c of mine) {
    console.log(`        ${c.name}: PM ${c.evaluations.PM.ranking_score} (${c.evaluations.PM.coverage}%) · SPM ${c.evaluations.SPM.ranking_score} (${c.evaluations.SPM.coverage}%)`);
  }
  const top = mine.sort((a, b) => b.evaluations.PM.ranking_score - a.evaluations.PM.ranking_score)[0];
  console.log(`        brief: ${top.briefs.PM.sentences.join(" ")}`);
  await call(`/api/applicants/${top.applicant.id}/decision`, json({ decision: "invite" }));
  mark(`decision recorded: invite ${top.name}`);
  const dest = await call<{ to: string; note: string }>(`/api/applicants/${top.applicant.id}/destination`);
  mark(`destination shown: ${dest.to} (${dest.note})`);
  const { send } = await call<{ send: { status: string; provider_message_id: string; mode: string } }>(`/api/drafts/${top.drafts.invite.id}/send`, json({ confirm: true, expected_to: dest.to }));
  mark(`send ${send.mode === "simulated" ? "SIMULATED (nothing delivered)" : send.status} · provider id ${send.provider_message_id}`);
  try {
    await call(`/api/drafts/${top.drafts.invite.id}/send`, json({ confirm: true, expected_to: dest.to }));
    console.log("        ✗ second send was allowed");
    process.exitCode = 1;
  } catch (e) {
    console.log(`        ✓ second send refused: ${(e as Error).message}`);
  }
  console.log(`\nAI mode: ${state.config.ai} · email mode: ${state.config.email} · total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
