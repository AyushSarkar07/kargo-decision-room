// Pure calibration types and metrics, shared by server and browser.
import type { Role } from "./rubric";
import type { CriterionScore } from "./types";

export interface CalibrationRoleResult {
  ranking_score: number;
  coverage: number;
  evidenced_score: number | null;
  criteria: CriterionScore[];
}

export interface CalibrationHireResult {
  hire_id: string;
  group: "higher" | "other";
  status: "scored" | "missing" | "unreadable" | "failed";
  error?: string;
  PM?: CalibrationRoleResult;
  SPM?: CalibrationRoleResult;
}

export interface Concordance {
  /** Pairs of (higher-rated hire, other hire) where both were scored. */
  pairs: number;
  /** Pairs where the higher-rated hire scored strictly higher. */
  concordant: number;
  ties: number;
  /** Pairs where the other hire scored higher: the cases to look at. */
  discordant: { higher: string; other: string; higherScore: number; otherScore: number }[];
}

export interface CalibrationRun {
  id: string;
  rubric_version: string;
  scored_by: string;
  created_at: string;
  results: CalibrationHireResult[];
  concordance: Record<Role, Concordance>;
}

/**
 * Pairwise check: for every (Exceeds hire, Meets/Below hire) pair, did the rubric put the
 * Exceeds hire higher? 8 hires → 5 × 3 = 15 pairs per role. This is in-sample: the rubric was
 * derived from these same people, so agreement shows internal consistency, not predictive power.
 */
export function concordance(results: CalibrationHireResult[], role: Role): Concordance {
  const scored = results.filter((r) => r.status === "scored" && r[role]);
  const higher = scored.filter((r) => r.group === "higher");
  const other = scored.filter((r) => r.group === "other");
  const out: Concordance = { pairs: 0, concordant: 0, ties: 0, discordant: [] };
  for (const h of higher) {
    for (const o of other) {
      const hs = h[role]!.ranking_score;
      const os = o[role]!.ranking_score;
      out.pairs++;
      if (hs > os) out.concordant++;
      else if (hs === os) out.ties++;
      else out.discordant.push({ higher: h.hire_id, other: o.hire_id, higherScore: hs, otherScore: os });
    }
  }
  return out;
}
