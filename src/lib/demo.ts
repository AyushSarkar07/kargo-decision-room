import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config";
import { ingestFile, scoreApplicant } from "./pipeline";
import { getStore } from "./store";
import type { Role } from "./rubric";

const DIR = path.join(process.cwd(), "fixtures", "synthetic");
/** s12 and s13 are held back as the "two new CVs" for the end-to-end run. */
const HELD_BACK = new Set(["s12_new_pm.txt", "s13_new_spm.txt"]);

export const roleFromFixture = (f: string): Role => (/_spm\.txt$/.test(f) ? "SPM" : "PM");

/** Loads the synthetic population into the local demo store. Refuses to run against the live database. */
export async function seedDemo() {
  if (getConfig().data !== "local-demo") throw new Error("Synthetic data can only be loaded in local demo mode.");
  const files = (await readdir(DIR)).filter((f) => /^s\d+_.+\.txt$/.test(f) && !HELD_BACK.has(f)).sort();
  const results: { file: string; status: string; error?: string }[] = [];
  for (const f of files) {
    try {
      const a = await ingestFile({ data: await readFile(path.join(DIR, f)), filename: f, role: roleFromFixture(f), isSynthetic: true, mime: "text/plain" });
      const scored = a.status === "ready_to_score" ? await scoreApplicant(a.id) : a;
      results.push({ file: f, status: scored?.status ?? "unknown" });
    } catch (e) {
      results.push({ file: f, status: "error", error: (e as Error).message });
    }
  }
  return results;
}

export async function resetDemo() {
  const store = getStore();
  if (store.kind !== "local-demo") throw new Error("Reset is only available in local demo mode.");
  await (store as unknown as { reset(): Promise<void> }).reset();
}
