// Checks rubric.json against the hire CVs: weights, criterion counts, and that
// every quoted hire excerpt appears verbatim in the named hire's file.
// Hire CVs live in source/hires (gitignored); excerpt checks are skipped if absent.
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import { validateRubric } from "../src/lib/rubric";

const root = path.resolve(__dirname, "..");
const rubric = JSON.parse(readFileSync(path.join(root, "rubric.json"), "utf8"));

const norm = (s: string) => s.replace(/\s+/g, " ").replace(/[‘’]/g, "'").trim().toLowerCase();

async function main() {
  const problems = validateRubric(rubric);
  const hiresDir = path.join(root, "source", "hires");
  let checked = 0;
  if (existsSync(hiresDir)) {
    const texts: Record<string, string> = {};
    for (const h of rubric.hires) {
      const file = path.join(hiresDir, h.file);
      if (!existsSync(file)) {
        problems.push(`Missing hire profile: ${h.file} (${h.name})`);
        continue;
      }
      const { value } = await mammoth.extractRawText({ path: file });
      if (value.trim().length < 200) problems.push(`Unreadable hire profile: ${h.file}`);
      texts[h.id] = norm(value);
    }
    const quotes: { hire: string; excerpt: string; where: string }[] = [];
    for (const p of rubric.patterns) {
      for (const e of [...p.supporting, ...p.counterexamples]) quotes.push({ ...e, where: p.id });
    }
    for (const c of rubric.criteria) {
      for (const e of c.hire_evidence) quotes.push({ ...e, where: c.id });
    }
    for (const q of quotes) {
      const text = texts[q.hire];
      if (!text) continue;
      checked++;
      if (!text.includes(norm(q.excerpt))) problems.push(`[${q.where}] excerpt not found in ${q.hire}: "${q.excerpt}"`);
    }
  } else {
    console.log("source/hires not present — skipping verbatim excerpt checks");
  }
  if (problems.length) {
    console.error(problems.map((p) => "✗ " + p).join("\n"));
    process.exit(1);
  }
  console.log(`✓ rubric ${rubric.version}: weights valid, ${checked} hire excerpts matched verbatim`);
}

main();
