import { rubric, type Role } from "./rubric";
import type { CriterionScore } from "./types";

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface ScoreSummary {
  /** Σ weight × score/4, Not evidenced counts as 0. Used for ranking. */
  ranking_score: number;
  /** Σ weight of evidenced criteria, 0–100. */
  coverage: number;
  /** ranking_score ÷ coverage × 100. Reference only; null when nothing is evidenced. */
  evidenced_score: number | null;
  incomplete: boolean;
}

/** Weighted totals are always computed here, never by the model. */
export function summarize(role: Role, scores: CriterionScore[]): ScoreSummary {
  let weighted = 0;
  let coverage = 0;
  for (const c of rubric.criteria) {
    const s = scores.find((x) => x.criterion_id === c.id);
    const w = c.weights[role];
    if (s && s.score !== null) {
      if (!Number.isInteger(s.score) || s.score < 0 || s.score > 4) throw new Error(`Invalid score ${s.score} for ${c.id}`);
      weighted += (w * s.score) / 4;
      coverage += w;
    }
  }
  return {
    ranking_score: round1(weighted),
    coverage,
    evidenced_score: coverage > 0 ? round1((weighted / coverage) * 100) : null,
    incomplete: coverage < rubric.missing_evidence_policy.incomplete_threshold,
  };
}
