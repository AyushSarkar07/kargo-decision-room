import { rubric } from "../rubric";
import { normalizeForMatch } from "../extract";
import type { CriterionScore, Line } from "../types";
import type { z } from "zod";
import type { CriterionOut } from "./schemas";

type RawCriterion = z.infer<typeof CriterionOut>;

/**
 * Keeps only evidence whose excerpt is found verbatim in the cited line (or anywhere
 * in the sanitized CV, re-pointing the line id). A positive score left with no
 * verifiable evidence becomes Not evidenced. Missing criteria become Not evidenced.
 */
export function verifyCriteria(raw: RawCriterion[], lines: Line[], blockedLineIds: string[] = []): CriterionScore[] {
  const byId = new Map(lines.map((l) => [l.id, normalizeForMatch(l.text)]));
  return rubric.criteria.map((c) => {
    const r = raw.find((x) => x.criterion_id === c.id);
    if (!r) {
      return { criterion_id: c.id, score: null, evidence: [], reason: "The model returned no assessment for this criterion.", uncertainty: "high" };
    }
    const evidence = [];
    for (const e of r.evidence) {
      const ex = normalizeForMatch(e.excerpt).replace(/^["']|["']$/g, "");
      if (ex.length < 12) continue;
      let lineId: string | null = byId.get(e.line_id)?.includes(ex) ? e.line_id : null;
      if (!lineId) lineId = lines.find((l) => normalizeForMatch(l.text).includes(ex))?.id ?? null;
      if (!lineId || blockedLineIds.includes(lineId)) continue;
      evidence.push({ line_id: lineId, excerpt: e.excerpt.trim() });
    }
    if (r.score !== null && r.score > 0 && evidence.length === 0) {
      return {
        criterion_id: c.id,
        score: null,
        evidence: [],
        reason: `Evidence could not be verified against the CV text, so this is treated as Not evidenced. (Model said: ${r.reason})`,
        uncertainty: "high",
      };
    }
    return { criterion_id: c.id, score: r.score, evidence, reason: r.reason, uncertainty: r.uncertainty };
  });
}

/** One array item must be exactly one sentence. */
export function isSingleSentence(s: string) {
  const t = s.trim();
  if (!/[.?!]["')]?$/.test(t)) return false;
  const inner = t.slice(0, -1).replace(/\b(e\.g|i\.e|vs|approx|etc|Pvt|Ltd|Inc|No|Mr|Ms|Dr)\./gi, "$1");
  return !/[.?!]\s+[A-Z"]/.test(inner);
}

export function validBrief(sentences: string[]): sentences is [string, string, string] {
  return sentences.length === 3 && sentences.every(isSingleSentence);
}

export function validEmailBody(body: string) {
  return body.includes("{{first_name}}") && !/\[(name|candidate)\]|\{\{(?!first_name\}\})/i.test(body);
}
