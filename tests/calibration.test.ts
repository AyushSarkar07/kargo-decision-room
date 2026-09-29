import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { concordance, type CalibrationHireResult } from "@/lib/calibration-metrics";
import { runCalibration } from "@/lib/calibration";
import { outboundLog } from "@/lib/ai/provider";
import { nameTokens, separatePII } from "@/lib/pii";
import { rubric } from "@/lib/rubric";
import { freshStore } from "./helpers";

const res = (hire_id: string, group: "higher" | "other", score: number | null): CalibrationHireResult =>
  score === null
    ? { hire_id, group, status: "missing" }
    : { hire_id, group, status: "scored", PM: { ranking_score: score, coverage: 100, evidenced_score: score, criteria: [] } };

describe("calibration concordance", () => {
  it("counts every (higher, other) pair and lists the discordant ones", () => {
    const c = concordance([res("a", "higher", 80), res("b", "higher", 40), res("x", "other", 50), res("y", "other", 40)], "PM");
    expect(c.pairs).toBe(4);
    expect(c.concordant).toBe(2); // a>x, a>y
    expect(c.ties).toBe(1); // b=y
    expect(c.discordant).toEqual([{ higher: "b", other: "x", higherScore: 40, otherScore: 50 }]);
  });
  it("skips hires that were not scored", () => {
    expect(concordance([res("a", "higher", 80), res("x", "other", null)], "PM").pairs).toBe(0);
  });
});

const hiresDir = path.resolve(__dirname, "..", "source", "hires");
describe.skipIf(!existsSync(hiresDir))("calibration run on the real hire CVs (local only)", () => {
  it("scores all 8 hires for both roles without sending any hire's personal details to the AI", async () => {
    const { store } = freshStore();
    const run = await runCalibration();
    expect(run.results.filter((r) => r.status === "scored")).toHaveLength(8);
    for (const r of run.results) expect(r.PM && r.SPM).toBeTruthy();
    expect(run.concordance.PM.pairs).toBe(15);
    expect(await store.getLatestCalibration()).toMatchObject({ id: run.id });

    expect(outboundLog).toHaveLength(8);
    for (const h of rubric.hires) {
      const { value } = await mammoth.extractRawText({ buffer: readFileSync(path.join(hiresDir, h.file)) });
      const pii = separatePII(value).pii;
      for (const req of outboundLog) {
        const payload = (req.system + req.input).toLowerCase();
        expect(payload).not.toContain(pii.email!.toLowerCase());
        expect(payload.replace(/\D/g, "")).not.toContain(pii.phone!.replace(/\D/g, "").slice(-10));
        for (const link of pii.links) expect(payload).not.toContain(link.toLowerCase());
        for (const tok of nameTokens(pii.full_name)) expect(payload).not.toMatch(new RegExp(`\\b${tok.toLowerCase()}\\b`));
      }
    }
  });
});
