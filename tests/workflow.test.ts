import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { ingestFile, scoreApplicant, submitPastedText, IngestError } from "@/lib/pipeline";
import { sendDraft, setTransportForTests, resolveDestination, SendError, type Transport } from "@/lib/email";
import { buildRoleBoard, secondLook, TOP_N } from "@/lib/board";
import { LocalStore } from "@/lib/store/local";
import { setStoreForTests } from "@/lib/store";
import { outboundLog } from "@/lib/ai/provider";
import { loadCandidates } from "@/lib/api";
import { rubric, type Role } from "@/lib/rubric";
import { nameTokens } from "@/lib/pii";
import { fixture, freshStore, testConfig } from "./helpers";
import { makePdf } from "./pdf";

async function addAndScore(file: string, role: Role) {
  const a = await ingestFile({ data: fixture(file), filename: file, role, mime: "text/plain", isSynthetic: true });
  return (await scoreApplicant(a.id))!;
}

function recordingTransport(fail = 0) {
  const calls: { to: string; key: string; text: string }[] = [];
  let failures = fail;
  const t: Transport = {
    async send(msg, key) {
      calls.push({ to: msg.to, key, text: msg.text });
      if (failures-- > 0) throw new Error("network timeout");
      return { id: `msg_${calls.length}` };
    },
  };
  return { t, calls };
}

describe("three-applicant pipeline (synthetic: strong PM, weak SPM, ambiguous)", () => {
  let ids: Record<string, string>;
  let store: LocalStore;
  let dir: string;

  beforeEach(async () => {
    ({ store, dir } = freshStore());
    ids = {
      strong: (await addAndScore("s01_strong_pm.txt", "PM")).id,
      weak: (await addAndScore("s02_weak_spm.txt", "SPM")).id,
      ambiguous: (await addAndScore("s03_ambiguous_pm.txt", "PM")).id,
    };
  });

  it("keeps personal details in the restricted record and out of sanitized content", async () => {
    for (const id of Object.values(ids)) {
      const pii = (await store.getPII(id))!;
      const a = (await store.getApplicant(id))!;
      expect(pii.full_name).toBeTruthy();
      expect(pii.email).toMatch(/@example\.com$/);
      const content = a.lines.map((l) => l.text).join("\n").toLowerCase();
      expect(content).not.toContain(pii.email!.toLowerCase());
      for (const tok of nameTokens(pii.full_name)) expect(content).not.toMatch(new RegExp(`\\b${tok.toLowerCase()}\\b`));
      expect(content.replace(/\D/g, "")).not.toContain(pii.phone!.replace(/\D/g, "").slice(-10));
    }
  });

  it("sends no personal details in any AI request payload", async () => {
    expect(outboundLog.length).toBe(6); // 3 applicants × (scoring + synthesis)
    const all = await store.listPII();
    for (const req of outboundLog) {
      const payload = (req.system + req.input).toLowerCase();
      for (const p of all) {
        expect(payload).not.toContain(p.email!.toLowerCase());
        for (const tok of nameTokens(p.full_name)) expect(payload).not.toMatch(new RegExp(`\\b${tok.toLowerCase()}\\b`));
        expect(payload.replace(/\D/g, "")).not.toContain(p.phone!.replace(/\D/g, "").slice(-10));
      }
      expect(payload).not.toMatch(/linkedin\.com|github\.com/);
    }
  });

  it("evaluates every applicant against both PM and SPM with stored detail and rubric version", async () => {
    const evals = await store.listEvaluations();
    for (const id of Object.values(ids)) {
      for (const role of ["PM", "SPM"] as const) {
        const e = evals.find((x) => x.applicant_id === id && x.role === role)!;
        expect(e).toBeTruthy();
        expect(e.rubric_version).toBe(rubric.version);
        expect(e.scored_by).toBe("simulated");
        expect(e.criteria).toHaveLength(rubric.criteria.length);
        for (const c of e.criteria) {
          expect(c.reason).toBeTruthy();
          expect(["low", "medium", "high"]).toContain(c.uncertainty);
          for (const ev of c.evidence) {
            const line = (await store.getApplicant(id))!.lines.find((l) => l.id === ev.line_id)!;
            expect(line.text.toLowerCase()).toContain(ev.excerpt.toLowerCase());
          }
        }
        // Totals recomputed from criteria must match what was stored.
        const recomputed = e.criteria.reduce((s, c) => s + (c.score === null ? 0 : (rubric.criteria.find((r) => r.id === c.criterion_id)!.weights[role] * c.score) / 4), 0);
        expect(e.ranking_score).toBeCloseTo(Math.round(recomputed * 10) / 10, 5);
      }
    }
  });

  it("ranks the strong PM above the ambiguous PM and shows missing evidence", async () => {
    const board = buildRoleBoard("PM", await loadCandidates());
    expect(board.ranked[0].candidate.applicant.id).toBe(ids.strong);
    const amb = board.ranked.find((r) => r.candidate.applicant.id === ids.ambiguous)!;
    expect(amb.evaluation.coverage).toBeLessThan(100);
    expect(amb.evaluation.criteria.some((c) => c.score === null)).toBe(true);
  });

  it("gives every processed applicant a three-sentence brief and both draft types", async () => {
    const briefs = await store.listBriefs();
    const drafts = await store.listDrafts();
    for (const id of Object.values(ids)) {
      for (const role of ["PM", "SPM"]) expect(briefs.find((b) => b.applicant_id === id && b.role === role)!.sentences).toHaveLength(3);
      expect(drafts.filter((d) => d.applicant_id === id).map((d) => d.type).sort()).toEqual(["invite", "rejection"]);
      for (const d of drafts.filter((x) => x.applicant_id === id)) expect(d.body).toContain("{{first_name}}");
    }
  });

  it("labels the provisional top five and everyone else Needs review, never rejected", async () => {
    const board = buildRoleBoard("PM", await loadCandidates());
    for (const r of board.ranked) expect(r.status).toBe(r.rank <= TOP_N ? "Provisional top 5" : "Needs review");
    expect(board.ranked.every((r) => r.candidate.decision === null)).toBe(true);
  });

  it("refuses to send without a human decision that matches the email type", async () => {
    setTransportForTests(recordingTransport().t);
    const cfg = testConfig();
    const rej = (await store.listDrafts()).find((d) => d.applicant_id === ids.weak && d.type === "rejection")!;
    await expect(sendDraft(rej.id, "inbox@example.org", cfg)).rejects.toThrow(/Record an "Reject" decision/);
    await store.setDecision({ applicant_id: ids.weak, decision: "invite", note: "", decided_at: new Date().toISOString() });
    await expect(sendDraft(rej.id, "inbox@example.org", cfg)).rejects.toThrow(SendError);
  });

  it("only ever delivers to allowlisted test addresses and merges the real name on the server", async () => {
    const { t, calls } = recordingTransport();
    setTransportForTests(t);
    const cfg = testConfig();
    await store.setDecision({ applicant_id: ids.weak, decision: "reject", note: "", decided_at: new Date().toISOString() });
    const rej = (await store.listDrafts()).find((d) => d.applicant_id === ids.weak && d.type === "rejection")!;
    // Candidate address is not allowlisted, so the destination is the test inbox, and the founder must confirm that exact address.
    expect(resolveDestination("arnav.kapoor@example.com", cfg).to).toBe("inbox@example.org");
    await expect(sendDraft(rej.id, "arnav.kapoor@example.com", cfg)).rejects.toThrow(/destination changed/);
    const sent = await sendDraft(rej.id, "inbox@example.org", cfg);
    expect(sent.status).toBe("accepted");
    expect(sent.provider_message_id).toBe("msg_1");
    expect(calls).toHaveLength(1);
    expect(calls[0].to).toBe("inbox@example.org");
    expect(calls[0].text).toMatch(/^Hi Arnav,/);
    expect(calls[0].text).not.toContain("{{");
    // Candidate whose own (test) address is allowlisted receives it directly.
    expect(resolveDestination("kavya.menon@example.com", cfg).to).toBe("kavya.menon@example.com");
  });

  it("never sends the same message twice, even with concurrent clicks", async () => {
    const { t, calls } = recordingTransport();
    setTransportForTests(t);
    const cfg = testConfig();
    await store.setDecision({ applicant_id: ids.strong, decision: "invite", note: "", decided_at: new Date().toISOString() });
    const inv = (await store.listDrafts()).find((d) => d.applicant_id === ids.strong && d.type === "invite")!;
    const results = await Promise.allSettled([sendDraft(inv.id, "kavya.menon@example.com", cfg), sendDraft(inv.id, "kavya.menon@example.com", cfg)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(sendDraft(inv.id, "kavya.menon@example.com", cfg)).rejects.toThrow(/already/);
    expect(calls).toHaveLength(1);
    expect((await store.listSends()).filter((s) => s.applicant_id === ids.strong)).toHaveLength(1);
  });

  it("preserves a failed draft and retries with the same idempotency key", async () => {
    const { t, calls } = recordingTransport(1);
    setTransportForTests(t);
    const cfg = testConfig();
    await store.setDecision({ applicant_id: ids.strong, decision: "invite", note: "", decided_at: new Date().toISOString() });
    const inv = (await store.listDrafts()).find((d) => d.applicant_id === ids.strong && d.type === "invite")!;
    await expect(sendDraft(inv.id, "kavya.menon@example.com", cfg)).rejects.toThrow(/Send failed/);
    expect((await store.getDraft(inv.id))!.status).toBe("failed");
    const ok = await sendDraft(inv.id, "kavya.menon@example.com", cfg);
    expect(ok.status).toBe("accepted");
    expect(calls).toHaveLength(2);
    expect(calls[0].key).toBe(calls[1].key);
    const sends = (await store.listSends()).filter((s) => s.applicant_id === ids.strong);
    expect(sends).toHaveLength(1);
    expect(sends[0].status).toBe("accepted");
  });

  it("keeps records, decisions, edits, and sends after a restart and after re-scoring", async () => {
    setTransportForTests(recordingTransport().t);
    await store.setDecision({ applicant_id: ids.ambiguous, decision: "hold", note: "call references", decided_at: new Date().toISOString() });
    const inv = (await store.listDrafts()).find((d) => d.applicant_id === ids.ambiguous && d.type === "invite")!;
    await store.updateDraft(inv.id, { body: "Hi {{first_name}},\n\nEdited by Arjun. Can we talk on Thursday?\n\nArjun", edited: true });
    await scoreApplicant(ids.ambiguous); // re-scoring must not overwrite human work
    const reopened = new LocalStore(dir); // simulates a refresh / server restart
    setStoreForTests(reopened);
    expect((await reopened.listApplicants()).length).toBe(3);
    expect((await reopened.getDecision(ids.ambiguous))!.note).toBe("call references");
    expect((await reopened.getDraft(inv.id))!.body).toContain("Edited by Arjun");
    expect((await reopened.listEvaluations()).length).toBe(6);
  });

  it("re-ranks as applicants are added without touching existing decisions", async () => {
    await store.setDecision({ applicant_id: ids.ambiguous, decision: "reviewing", note: "", decided_at: new Date().toISOString() });
    for (const f of ["s05_saas_pm.txt", "s06_cs_to_pm.txt", "s09_growth_pm.txt", "s10_supplychain_pm.txt", "s12_new_pm.txt"]) await addAndScore(f, "PM");
    const cands = await loadCandidates();
    const board = buildRoleBoard("PM", cands);
    expect(board.ranked).toHaveLength(7); // 2 original PM applicants + 5 new; the weak SPM applicant stays in SPM
    expect(board.ranked.filter((r) => r.inTopFive)).toHaveLength(5);
    expect(cands.find((c) => c.applicant.id === ids.ambiguous)!.decision!.decision).toBe("reviewing");
  });
});

describe("uploads: formats, duplicates, unreadable files, injection", () => {
  beforeEach(() => {
    freshStore();
  });

  it("reads a text PDF", async () => {
    const lines = fixture("s12_new_pm.txt").toString().split("\n");
    const a = await ingestFile({ data: makePdf(lines), filename: "aisha.pdf", role: "PM", mime: "application/pdf" });
    expect(a.status).toBe("ready_to_score");
    expect(a.lines.some((l) => /gate-in and pre-advice/.test(l.text))).toBe(true);
  });

  it("stops an image-only PDF at Needs text instead of inventing content, then recovers from pasted text", async () => {
    const a = await ingestFile({ data: makePdf(null), filename: "scan.pdf", role: "PM", mime: "application/pdf" });
    expect(a.status).toBe("needs_text");
    expect(a.lines).toHaveLength(0);
    await expect(scoreApplicant(a.id)).rejects.toThrow(IngestError);
    const fixed = await submitPastedText(a.id, fixture("s12_new_pm.txt").toString());
    expect(fixed.status).toBe("ready_to_score");
    expect((await scoreApplicant(a.id))!.status).toBe("scored");
  });

  const hire = path.resolve(__dirname, "..", "source", "hires", "cv_07_lavanya_iyer.docx");
  it.skipIf(!existsSync(hire))("reads a DOCX (local hire profile, not stored as an applicant)", async () => {
    const { extractText } = await import("@/lib/extract");
    const r = await extractText(readFileSync(hire), "docx");
    expect(r.unreadable).toBe(false);
    expect(r.text).toMatch(/dock scheduling/);
  });

  it("rejects an exact duplicate file and flags a same-text duplicate", async () => {
    const data = fixture("s01_strong_pm.txt");
    const first = await ingestFile({ data, filename: "a.txt", role: "PM" });
    await expect(ingestFile({ data, filename: "a-again.txt", role: "PM" })).rejects.toMatchObject({ status: 409, existingId: first.id });
    const variant = Buffer.concat([data, Buffer.from("\n")]);
    const second = await ingestFile({ data: variant, filename: "a-variant.txt", role: "PM" });
    expect(second.duplicate_of).toBe(first.id);
  });

  it("treats instruction-like CV text as data and surfaces it in Second Look", async () => {
    const a = await addAndScore("s11_injection_spm.txt", "SPM");
    expect(a.injection_flags.length).toBeGreaterThan(0);
    const cands = await loadCandidates();
    const boards = [buildRoleBoard("PM", cands), buildRoleBoard("SPM", cands)];
    expect(secondLook(cands, boards).find((s) => s.candidate.applicant.id === a.id)!.reasons.join(" ")).toMatch(/instruction-like/);
    const ev = (await import("@/lib/store")).getStore();
    const e = (await ev.listEvaluations()).find((x) => x.applicant_id === a.id && x.role === "SPM")!;
    for (const c of e.criteria) expect(c.evidence.every((x) => !a.injection_flags.includes(x.line_id))).toBe(true);
  });
});
