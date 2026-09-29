import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { extractText, toLines } from "./extract";
import { separatePII } from "./pii";
import { getProvider } from "./pipeline";
import { rubric, RUBRIC_VERSION, ROLES } from "./rubric";
import { summarize } from "./scoring";
import { getStore } from "./store";
import { verifyCriteria } from "./ai/verify";
import { concordance, type CalibrationHireResult, type CalibrationRun } from "./calibration-metrics";

/** Hire CVs contain personal details, so they are read from a local, gitignored folder and never stored. */
export const calibrationDir = () => process.env.CALIBRATION_DIR ?? path.join(process.cwd(), "source", "hires");

export function calibrationFilesAvailable() {
  const dir = calibrationDir();
  return rubric.hires.map((h) => ({ hire_id: h.id, available: existsSync(path.join(dir, h.file)) }));
}

/**
 * Scores the past hires with the current rubric through the same privacy-safe path as applicants:
 * text extraction → local PII separation → AI scoring of sanitized lines → excerpt verification →
 * totals computed in code. Only scores and verified excerpts are stored; names come from rubric.json.
 */
export async function runCalibration(): Promise<CalibrationRun> {
  const provider = getProvider();
  const dir = calibrationDir();
  const results: CalibrationHireResult[] = [];
  for (const h of rubric.hires) {
    const file = path.join(dir, h.file);
    if (!existsSync(file)) {
      results.push({ hire_id: h.id, group: h.group, status: "missing", error: `${h.file} not found` });
      continue;
    }
    try {
      const ex = await extractText(await readFile(file), "docx");
      if (ex.unreadable) {
        results.push({ hire_id: h.id, group: h.group, status: "unreadable", error: ex.warnings.join(" ") });
        continue;
      }
      const sep = separatePII(ex.text);
      const lines = toLines(sep.sanitizedLines);
      const out = await provider.score(lines, "PM", { ...sep.pii });
      const r: CalibrationHireResult = { hire_id: h.id, group: h.group, status: "scored" };
      for (const role of ROLES) {
        const criteria = verifyCriteria(out.evaluations[role].criteria, lines);
        const s = summarize(role, criteria);
        r[role] = { ranking_score: s.ranking_score, coverage: s.coverage, evidenced_score: s.evidenced_score, criteria };
      }
      results.push(r);
    } catch (e) {
      results.push({ hire_id: h.id, group: h.group, status: "failed", error: (e as Error).message.slice(0, 300) });
    }
  }
  const run: CalibrationRun = {
    id: randomUUID(),
    rubric_version: RUBRIC_VERSION,
    scored_by: provider.id,
    created_at: new Date().toISOString(),
    results,
    concordance: { PM: concordance(results, "PM"), SPM: concordance(results, "SPM") },
  };
  await getStore().saveCalibration(run);
  return run;
}
