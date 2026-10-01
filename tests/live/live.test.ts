// Live verification against the configured Supabase project, Gemini model, and Resend (test mode).
// Uses synthetic applicants only (fixtures/synthetic, example.com addresses), marked is_synthetic.
// Writes measured timings to docs/live-results.json. Never prints keys or CV text.
import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..", "..");
// Next's loader skips .env.local under NODE_ENV=test, so read it directly.
for (const line of readFileSync(path.join(root, ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
}

const results: Record<string, unknown> = { started_at: new Date().toISOString() };
const ms = (t0: number) => Math.round(performance.now() - t0);

describe("live services", () => {
  let lib: {
    getConfig: typeof import("@/lib/config").getConfig;
    ingestFile: typeof import("@/lib/pipeline").ingestFile;
    scoreApplicant: typeof import("@/lib/pipeline").scoreApplicant;
    getStore: typeof import("@/lib/store").getStore;
    sendDraft: typeof import("@/lib/email").sendDraft;
    resolveDestination: typeof import("@/lib/email").resolveDestination;
    outboundLog: typeof import("@/lib/ai/provider").outboundLog;
    nameTokens: typeof import("@/lib/pii").nameTokens;
    runCalibration: typeof import("@/lib/calibration").runCalibration;
  };

  beforeAll(async () => {
    lib = {
      ...(await import("@/lib/config")),
      ...(await import("@/lib/pipeline")),
      ...(await import("@/lib/store")),
      ...(await import("@/lib/email")),
      ...(await import("@/lib/ai/provider")),
      ...(await import("@/lib/pii")),
      ...(await import("@/lib/calibration")),
    } as typeof lib;
    const cfg = lib.getConfig();
    results.config = { data: cfg.data, ai: cfg.ai, email: cfg.email, model: cfg.geminiModel };
    expect(cfg.data).toBe("supabase");
    expect(cfg.ai).toBe("gemini");
    expect(cfg.email).toBe("resend-test");
  });

  const fixture = (f: string) => readFileSync(path.join(root, "fixtures", "synthetic", f));
  const ids: Record<string, string> = {};

  it("processes the three required applicants end to end with Gemini and Supabase", async () => {
    const timings: Record<string, number> = {};
    for (const [key, file, role] of [
      ["strong_pm", "s01_strong_pm.txt", "PM"],
      ["weak_spm", "s02_weak_spm.txt", "SPM"],
      ["ambiguous", "s03_ambiguous_pm.txt", "PM"],
    ] as const) {
      const t0 = performance.now();
      const a = await lib.ingestFile({ data: fixture(file), filename: file, role, mime: "text/plain", isSynthetic: true, force: true });
      const scored = await lib.scoreApplicant(a.id);
      timings[key] = ms(t0);
      expect(scored!.status).toBe("scored");
      ids[key] = a.id;
    }
    results.three_applicants_ms = timings;

    const store = lib.getStore();
    const evals = await store.listEvaluations();
    const briefs = await store.listBriefs();
    const drafts = await store.listDrafts();
    const summary: Record<string, unknown> = {};
    for (const [key, id] of Object.entries(ids)) {
      const a = (await store.getApplicant(id))!;
      const pii = (await store.getPII(id))!;
      expect(pii.full_name && pii.email && pii.phone).toBeTruthy();
      const content = a.lines.map((l) => l.text).join("\n").toLowerCase();
      expect(content).not.toContain(pii.email!.toLowerCase());
      for (const t of lib.nameTokens(pii.full_name)) expect(content).not.toMatch(new RegExp(`\\b${t.toLowerCase()}\\b`));
      const mine = evals.filter((e) => e.applicant_id === id);
      expect(mine.map((e) => e.role).sort()).toEqual(["PM", "SPM"]);
      for (const e of mine) expect(e.scored_by).toBe(lib.getConfig().geminiModel);
      for (const role of ["PM", "SPM"]) expect(briefs.find((b) => b.applicant_id === id && b.role === role)!.sentences).toHaveLength(3);
      expect(drafts.filter((d) => d.applicant_id === id).map((d) => d.type).sort()).toEqual(["invite", "rejection"]);
      summary[key] = Object.fromEntries(
        mine.map((e) => [
          e.role,
          {
            ranking_score: e.ranking_score,
            coverage: e.coverage,
            not_evidenced: e.criteria.filter((c) => c.score === null).map((c) => c.criterion_id),
            evidence_items: e.criteria.reduce((n, c) => n + c.evidence.length, 0),
          },
        ]),
      );
      summary[`${key}_brief_generated_by`] = briefs.find((b) => b.applicant_id === id && b.role === a.applied_role)!.generated_by;
      summary[`${key}_drafts_generated_by`] = drafts.filter((d) => d.applicant_id === id).map((d) => d.generated_by);
    }
    results.three_applicants = summary;

    // No personal details in any request actually sent to Gemini.
    const allPII = await Promise.all(Object.values(ids).map((id) => store.getPII(id)));
    expect(lib.outboundLog.length).toBeGreaterThanOrEqual(6);
    for (const req of lib.outboundLog) {
      const payload = (req.system + req.input).toLowerCase();
      for (const p of allPII) {
        expect(payload).not.toContain(p!.email!.toLowerCase());
        expect(payload.replace(/\D/g, "")).not.toContain(p!.phone!.replace(/\D/g, "").slice(-10));
        for (const t of lib.nameTokens(p!.full_name)) expect(payload).not.toMatch(new RegExp(`\\b${t.toLowerCase()}\\b`));
      }
    }
    results.gemini_requests_checked_for_pii = lib.outboundLog.length;
    // Expected ordering on these fixtures: strong PM above ambiguous PM.
    const pm = (id: string) => evals.find((e) => e.applicant_id === id && e.role === "PM")!.ranking_score;
    expect(pm(ids.strong_pm)).toBeGreaterThan(pm(ids.ambiguous));
  });

  it("refuses to send without a decision, sends once via Resend after one, and refuses a repeat", async () => {
    const store = lib.getStore();
    const invite = (await store.listDrafts()).find((d) => d.applicant_id === ids.strong_pm && d.type === "invite")!;
    const pii = await store.getPII(ids.strong_pm);
    const dest = lib.resolveDestination(pii!.email);
    expect(dest.to).toBe("delivered@resend.dev");
    await expect(lib.sendDraft(invite.id, dest.to!)).rejects.toThrow(/Record an "Invite" decision/);
    await store.setDecision({ applicant_id: ids.strong_pm, decision: "invite", note: "live check", decided_at: new Date().toISOString() });
    const t0 = performance.now();
    const sent = await lib.sendDraft(invite.id, dest.to!);
    results.send = { ms: ms(t0), status: sent.status, provider_message_id: sent.provider_message_id, to: dest.to, redirected_from_candidate: dest.redirected };
    expect(sent.status).toBe("accepted");
    expect(sent.provider_message_id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(lib.sendDraft(invite.id, dest.to!)).rejects.toThrow(/already/);
    const rows = (await store.listSends()).filter((s) => s.applicant_id === ids.strong_pm);
    expect(rows).toHaveLength(1);
  });

  it("runs calibration on the past hires with Gemini", async () => {
    const t0 = performance.now();
    const run = await lib.runCalibration();
    results.calibration = {
      ms: ms(t0),
      scored_by: run.scored_by,
      scored: run.results.filter((r) => r.status === "scored").length,
      failed: run.results.filter((r) => r.status !== "scored").map((r) => ({ hire: r.hire_id, status: r.status, error: r.error })),
      concordance: {
        PM: { pairs: run.concordance.PM.pairs, concordant: run.concordance.PM.concordant, ties: run.concordance.PM.ties, discordant: run.concordance.PM.discordant },
        SPM: { pairs: run.concordance.SPM.pairs, concordant: run.concordance.SPM.concordant, ties: run.concordance.SPM.ties, discordant: run.concordance.SPM.discordant },
      },
      scores: run.results.map((r) => ({ hire: r.hire_id, group: r.group, PM: r.PM?.ranking_score, SPM: r.SPM?.ranking_score, PM_cov: r.PM?.coverage, SPM_cov: r.SPM?.coverage })),
    };
    expect(run.results.filter((r) => r.status === "scored").length).toBe(8);
  });

  it("times two new CVs from upload to a confirmed test send", async () => {
    const store = lib.getStore();
    const t0 = performance.now();
    const steps: Record<string, number> = {};
    const newIds: string[] = [];
    for (const [file, role] of [["s12_new_pm.txt", "PM"], ["s13_new_spm.txt", "SPM"]] as const) {
      const a = await lib.ingestFile({ data: fixture(file), filename: file, role, mime: "text/plain", isSynthetic: true, force: true });
      steps[`uploaded_${file}`] = ms(t0);
      await lib.scoreApplicant(a.id);
      steps[`scored_${file}`] = ms(t0);
      newIds.push(a.id);
    }
    const evals = await store.listEvaluations();
    const top = newIds.sort(
      (x, y) =>
        evals.find((e) => e.applicant_id === y && e.role === "PM")!.ranking_score - evals.find((e) => e.applicant_id === x && e.role === "PM")!.ranking_score,
    )[0];
    await store.setDecision({ applicant_id: top, decision: "invite", note: "live e2e", decided_at: new Date().toISOString() });
    const invite = (await store.listDrafts()).find((d) => d.applicant_id === top && d.type === "invite")!;
    const dest = lib.resolveDestination((await store.getPII(top))!.email);
    const sent = await lib.sendDraft(invite.id, dest.to!);
    steps.send_accepted = ms(t0);
    results.two_new_cvs = { total_ms: ms(t0), steps, send_status: sent.status, provider_message_id: sent.provider_message_id };
    expect(sent.status).toBe("accepted");
  });

  it("writes the measured results", () => {
    results.finished_at = new Date().toISOString();
    writeFileSync(path.join(root, "docs", "live-results.json"), JSON.stringify(results, null, 2));
  });
});
