// Renders rubric.txt from rubric.json so the two never drift apart.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { rubric, hireById, ROLES, ROLE_LABEL } from "../src/lib/rubric";

const out: string[] = [];
const line = (s = "") => out.push(s);
const rule = () => line("-".repeat(78));
const who = (id: string) => {
  const h = hireById(id)!;
  return `${h.name} (${h.role}, ${h.rating})`;
};

line(`${rubric.title.toUpperCase()}`);
line(`Version ${rubric.version}`);
line();
line("Source: eight past-hire CVs and the hire outcomes table. The two job descriptions");
line("were used to understand the roles and are listed separately at the end; they are");
line("not a source for any scored criterion.");
line();
line("DATA GAPS");
rubric.data_gaps.forEach((g) => line(`  • ${g}`));
line();
line("HIRE OUTCOMES");
for (const h of rubric.hires) line(`  ${h.name.padEnd(22)} ${h.role.padEnd(26)} ${h.joined.padEnd(9)} ${h.rating}`);
line();
rule();
line("PATTERNS: WHAT THE HIGHER-RATED HIRES HAD IN COMMON");
rule();
for (const p of rubric.patterns) {
  line();
  line(`${p.id}. ${p.name}`);
  line(`   Strength: ${p.strength}`);
  line(`   ${p.summary}`);
  line("   Supporting evidence:");
  p.supporting.forEach((e) => line(`     – ${who(e.hire)}: "${e.excerpt}"`));
  line("   Counterexamples:");
  p.counterexamples.forEach((e) => line(`     – ${who(e.hire)}: "${e.excerpt}" — ${e.note}`));
  line("   Limitations:");
  p.limitations.forEach((l) => line(`     – ${l}`));
}
line();
line("Considered but not used as patterns:");
rubric.not_used_as_patterns.forEach((n) => line(`  • ${n.signal}: ${n.reason}`));
line();
line("These are hypotheses from eight mixed-role profiles, not proof of predictive accuracy.");
line();

for (const role of ROLES) {
  rule();
  line(`${ROLE_LABEL[role].toUpperCase()} (${role}) RUBRIC`);
  rule();
  const total = rubric.criteria.reduce((s, c) => s + c.weights[role], 0);
  for (const c of rubric.criteria) {
    line();
    line(`Criterion name: ${c.name}`);
    line(`Weight: ${c.weights[role]}%`);
    line(`What a strong candidate looks like: ${c.definition}`);
    line(`Drawn from: ${c.pattern_ids.join(", ")}; ${c.hire_evidence.filter((e) => e.supports).map((e) => hireById(e.hire)!.name).join(", ")}`);
    line("Scoring anchors:");
    for (const k of ["0", "1", "2", "3", "4"] as const) line(`  ${k} — ${c.anchors[role][k]}`);
    if (role === "SPM") line(`Stronger independent ownership for SPM: ${c.spm_ownership}`);
    line(`Insufficient evidence: ${c.insufficient_evidence}`);
  }
  line();
  line(`Total: ${total}%`);
  line();
}

rule();
line("SCORING AND MISSING EVIDENCE");
rule();
line(`Scale: ${rubric.scale.min}–${rubric.scale.max}, or Not evidenced.`);
line(`  Not evidenced: ${rubric.scale.not_evidenced}`);
line(`  Zero: ${rubric.scale.zero_means}`);
rubric.missing_evidence_policy.rules.forEach((r) => line(`  • ${r}`));
line();
line("Second Look — a candidate is listed if any of these hold:");
rubric.second_look_rules.forEach((r) => line(`  • ${r}`));
line();
line("Never used as scoring signals:");
rubric.excluded_signals.forEach((s) => line(`  • ${s}`));
line();
rule();
line("ROLE REQUIREMENTS FROM THE JOB DESCRIPTIONS (checklist only, not scored)");
rule();
for (const role of ROLES) {
  line(`${ROLE_LABEL[role]}:`);
  rubric.role_requirements[role].forEach((r) => line(`  • ${r}`));
}
line();

writeFileSync(path.resolve(__dirname, "..", "rubric.txt"), out.join("\n"));
console.log(`wrote rubric.txt (${out.length} lines)`);
