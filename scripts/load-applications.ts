// Uploads a folder of application CVs through the deployed app's own endpoints (the same path as
// the Upload tab): sign in with ACCESS_CODE, POST each file with its role, then score it.
// Role comes from the filename prefix: pm_ → PM, spm_ → SPM, anything else → "Not stated".
// Usage: npx tsx scripts/load-applications.ts [folder] [baseUrl]
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const dir = process.argv[2] ?? path.join(root, "source", "applications");
const BASE = process.argv[3] ?? "https://kargo-decision-room.vercel.app";
const CONCURRENCY = 3;

const env = Object.fromEntries(
  readFileSync(path.join(root, ".env.local"), "utf8")
    .split("\n")
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m![1], m![2].replace(/^"(.*)"$/, "$1")]),
);

const roleFor = (f: string) => (/^spm_/i.test(f) ? "SPM" : /^pm_/i.test(f) ? "PM" : "unstated");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function signIn() {
  const res = await fetch(`${BASE}/auth/code`, { method: "POST", body: new URLSearchParams({ code: env.ACCESS_CODE }), redirect: "manual" });
  const cookie = res.headers.get("set-cookie")?.split(";")[0];
  if (!cookie?.startsWith("kdr_session=")) throw new Error("Sign-in failed: check ACCESS_CODE");
  return cookie;
}

type Result = { file: string; role: string; status: string; id?: string; ms: number; attempts: number; error?: string };

async function main() {
  const cookie = await signIn();
  const files = readdirSync(dir).filter((f) => /\.(pdf|docx|txt)$/i.test(f)).sort();
  console.log(`Loading ${files.length} files from ${dir} → ${BASE}`);
  const results: Result[] = [];
  const t0 = Date.now();
  let next = 0;
  let done = 0;

  async function one(file: string): Promise<Result> {
    const role = roleFor(file);
    const start = Date.now();
    let id: string | undefined;
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        if (!id) {
          const fd = new FormData();
          const type = file.endsWith(".pdf") ? "application/pdf" : file.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain";
          fd.append("file", new Blob([readFileSync(path.join(dir, file))], { type }), file);
          fd.append("role", role);
          const up = await fetch(`${BASE}/api/applicants`, { method: "POST", body: fd, headers: { cookie } });
          const body = await up.json().catch(() => ({}));
          if (up.status === 409 && body.existingId) return { file, role, status: "duplicate", id: body.existingId, ms: Date.now() - start, attempts: attempt };
          if (!up.ok) throw new Error(`upload ${up.status}: ${body.error ?? ""}`);
          id = body.applicant.id;
          if (body.applicant.status === "needs_text") return { file, role, status: "needs_text", id, ms: Date.now() - start, attempts: attempt };
        }
        const sc = await fetch(`${BASE}/api/applicants/${id}/score`, { method: "POST", headers: { cookie } });
        const body = await sc.json().catch(() => ({}));
        if (!sc.ok) throw new Error(`score ${sc.status}: ${String(body.error ?? "").slice(0, 160)}`);
        return { file, role, status: "scored", id, ms: Date.now() - start, attempts: attempt };
      } catch (e) {
        if (attempt === 4) return { file, role, status: "failed", id, ms: Date.now() - start, attempts: attempt, error: (e as Error).message };
        await sleep(4000 * attempt); // back off (rate limits, cold starts)
      }
    }
    throw new Error("unreachable");
  }

  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < files.length) {
        const f = files[next++];
        const r = await one(f);
        results.push(r);
        done++;
        console.log(`[${String(done).padStart(2)}/${files.length}] ${r.status.padEnd(10)} ${r.role.padEnd(8)} ${(r.ms / 1000).toFixed(1).padStart(5)}s  ${f}${r.error ? `  (${r.error})` : ""}`);
      }
    }),
  );

  const count = (s: string) => results.filter((r) => r.status === s).length;
  const summary = {
    finished_at: new Date().toISOString(),
    total_s: Math.round((Date.now() - t0) / 1000),
    files: files.length,
    scored: count("scored"),
    needs_text: count("needs_text"),
    duplicate: count("duplicate"),
    failed: count("failed"),
    by_role: { PM: results.filter((r) => r.role === "PM").length, SPM: results.filter((r) => r.role === "SPM").length, unstated: results.filter((r) => r.role === "unstated").length },
    results: results.sort((a, b) => a.file.localeCompare(b.file)),
  };
  // Filenames contain (fictional) names, so the log stays in the gitignored source/ folder.
  writeFileSync(path.join(root, "source", "applications-load.json"), JSON.stringify(summary, null, 2));
  console.log(`\nDone in ${summary.total_s}s: ${summary.scored} scored, ${summary.needs_text} need text, ${summary.duplicate} duplicate, ${summary.failed} failed`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
