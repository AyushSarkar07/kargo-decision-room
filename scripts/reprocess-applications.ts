// Re-sanitizes and re-scores every non-synthetic applicant on the deployed app from its stored
// original (after a redaction fix). Decisions and sends are untouched.
// Usage: npx tsx scripts/reprocess-applications.ts [--failed] [baseUrl]
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const BASE = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "https://kargo-decision-room.vercel.app";
const code = readFileSync(path.join(root, ".env.local"), "utf8").match(/^ACCESS_CODE=(.*)$/m)![1];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const auth = await fetch(`${BASE}/auth/code`, { method: "POST", body: new URLSearchParams({ code }), redirect: "manual" });
  const cookie = auth.headers.get("set-cookie")!.split(";")[0];
  const state = await (await fetch(`${BASE}/api/state`, { headers: { cookie } })).json();
  const onlyFailed = process.argv.includes("--failed");
  const targets = state.candidates.filter(
    (c: { applicant: { is_synthetic: boolean; status: string } }) => !c.applicant.is_synthetic && (!onlyFailed || c.applicant.status !== "scored"),
  );
  console.log(`Reprocessing ${targets.length} applicants on ${BASE}`);
  let next = 0, done = 0, ok = 0;
  const failed: string[] = [];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < targets.length) {
        const c = targets[next++];
        let status = "failed", err = "";
        for (let attempt = 1; attempt <= 4; attempt++) {
          let r: Response;
          try {
            r = await fetch(`${BASE}/api/applicants/${c.applicant.id}/reprocess`, { method: "POST", headers: { cookie } });
          } catch (e) {
            err = `network: ${(e as Error).message}`; // local network drop: retry
            await sleep(4000 * attempt);
            continue;
          }
          const b = await r.json().catch(() => ({}));
          if (r.ok) { status = b.applicant.status; break; }
          err = `${r.status} ${String(b.error ?? "").slice(0, 120)}`;
          if (r.status === 422) break; // blocked by the privacy guard or no name: do not retry
          await sleep(4000 * attempt);
        }
        done++;
        if (status === "scored") ok++; else failed.push(`${c.applicant.source_filename}: ${err || status}`);
        console.log(`[${String(done).padStart(2)}/${targets.length}] ${status.padEnd(8)} ${c.applicant.source_filename}${err && status !== "scored" ? `  (${err})` : ""}`);
      }
    }),
  );
  console.log(`\nDone: ${ok} scored, ${failed.length} not scored`);
  failed.forEach((f) => console.log("  " + f));
}
main();
