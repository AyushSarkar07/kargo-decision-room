import rubricJson from "../../rubric.json";

export type Role = "PM" | "SPM";
export const ROLES: Role[] = ["PM", "SPM"];
export const ROLE_LABEL: Record<Role, string> = { PM: "Product Manager", SPM: "Senior Product Manager" };
export const otherRole = (r: Role): Role => (r === "PM" ? "SPM" : "PM");

export type AnchorSet = Record<"0" | "1" | "2" | "3" | "4", string>;

export interface HireEvidence {
  hire: string;
  excerpt: string;
  supports: boolean;
  note?: string;
}

export interface Criterion {
  id: string;
  name: string;
  definition: string;
  pattern_ids: string[];
  hire_evidence: HireEvidence[];
  weights: Record<Role, number>;
  anchors: Record<Role, AnchorSet>;
  spm_ownership: string;
  insufficient_evidence: string;
}

export interface Hire {
  id: string;
  name: string;
  role: string;
  joined: string;
  rating: string;
  group: "higher" | "other";
  file: string;
}

export interface Pattern {
  id: string;
  name: string;
  strength: string;
  summary: string;
  supporting: { hire: string; excerpt: string; context?: string }[];
  counterexamples: { hire: string; excerpt: string; note: string }[];
  limitations: string[];
}

export interface Rubric {
  version: string;
  title: string;
  data_gaps: string[];
  hires: Hire[];
  patterns: Pattern[];
  not_used_as_patterns: { signal: string; reason: string }[];
  excluded_signals: string[];
  scale: { min: number; max: number; not_evidenced: string; zero_means: string };
  missing_evidence_policy: { summary: string; rules: string[]; incomplete_threshold: number };
  second_look_rules: string[];
  criteria: Criterion[];
  role_requirements: { note: string } & Record<Role, string[]>;
}

export const rubric = rubricJson as unknown as Rubric;
export const RUBRIC_VERSION = rubric.version;

export function hireById(id: string): Hire | undefined {
  return rubric.hires.find((h) => h.id === id);
}

export function criteriaFor(role: Role) {
  return rubric.criteria.map((c) => ({ ...c, weight: c.weights[role], anchorsForRole: c.anchors[role] }));
}

/** Structural checks that must hold before the rubric is used for scoring. */
export function validateRubric(r: Rubric): string[] {
  const problems: string[] = [];
  for (const role of ROLES) {
    const n = r.criteria.length;
    if (n < 4 || n > 6) problems.push(`${role}: expected 4–6 criteria, found ${n}`);
    const total = r.criteria.reduce((s, c) => s + (c.weights?.[role] ?? 0), 0);
    if (total !== 100) problems.push(`${role}: weights total ${total}%, expected 100%`);
  }
  const ids = new Set<string>();
  for (const c of r.criteria) {
    if (ids.has(c.id)) problems.push(`Duplicate criterion id ${c.id}`);
    ids.add(c.id);
    if (!c.definition?.trim()) problems.push(`${c.id}: missing definition`);
    if (!c.insufficient_evidence?.trim()) problems.push(`${c.id}: missing insufficient-evidence rule`);
    if (!c.spm_ownership?.trim()) problems.push(`${c.id}: missing SPM ownership note`);
    if (!c.hire_evidence?.some((e) => e.supports)) problems.push(`${c.id}: no supporting hire evidence`);
    for (const e of c.hire_evidence ?? []) {
      if (!r.hires.some((h) => h.id === e.hire)) problems.push(`${c.id}: unknown hire ${e.hire}`);
    }
    for (const role of ROLES) {
      for (const k of ["0", "1", "2", "3", "4"] as const) {
        if (!c.anchors?.[role]?.[k]?.trim()) problems.push(`${c.id}: missing ${role} anchor ${k}`);
      }
    }
  }
  return problems;
}
