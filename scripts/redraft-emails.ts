// Rewrites every unedited, unsent email draft on the deployed app so each names something specific
// from the person's CV (no re-scoring). Usage: npx tsx scripts/redraft-emails.ts [baseUrl]
const BASE = process.argv[2] ?? "https://kargo-decision-room.vercel.app";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function main() {
  const state = await (await fetch(`${BASE}/api/state`)).json();
  if (!state.candidates) throw new Error("Could not read state (is the site signed-in only?)");
  const targets = state.candidates.filter((c: { applicant: { status: string } }) => c.applicant.status === "scored");
  console.log(`Redrafting ${targets.length} applicants on ${BASE}`);
  const tally: Record<string, number> = {};
  let next = 0, done = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < targets.length) {
        const c = targets[next++];
        let line = "failed";
        for (let attempt = 1; attempt <= 4; attempt++) {
          try {
            const r = await fetch(`${BASE}/api/applicants/${c.applicant.id}/redraft`, { method: "POST" });
            const b = await r.json().catch(() => ({}));
            if (r.ok) {
              line = b.drafts.map((d: { type: string; generated_by: string }) => `${d.type}:${d.generated_by}`).join("  ");
              for (const d of b.drafts) tally[d.generated_by] = (tally[d.generated_by] ?? 0) + 1;
              break;
            }
            line = `failed ${r.status} ${String(b.error ?? "").slice(0, 100)}`;
            if (r.status === 409 || r.status === 422) break;
          } catch (e) {
            line = `network: ${(e as Error).message}`;
          }
          await sleep(4000 * attempt);
        }
        done++;
        console.log(`[${String(done).padStart(2)}/${targets.length}] ${c.applicant.source_filename.padEnd(28)} ${line}`);
      }
    }),
  );
  console.log("\nHow each draft was personalised:", tally);
}
main();
