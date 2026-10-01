// Makes sure every email draft refers to something specific this person did, not generic praise.
import type { CriterionScore } from "../types";

export interface Detail {
  id: string; // "D1"
  text: string; // verified excerpt from the sanitized CV
}

const STOP = new Set(
  "the and for with from that this into over across their your have has had were was are been being within without about after before while where which what when who whom them they then than also just only very more most such each other some into onto upon our out per via".split(" "),
);

/** Up to four verified, specific CV excerpts, strongest evidence first, no near-duplicates. */
export function pickDetails(criteria: CriterionScore[]): Detail[] {
  const ranked = [...criteria]
    .filter((c) => c.score !== null && c.score > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .flatMap((c) => c.evidence.map((e) => e.excerpt.trim()));
  const out: string[] = [];
  for (const t of ranked) {
    if (t.split(/\s+/).length < 5) continue;
    if (out.some((o) => o.includes(t) || t.includes(o))) continue;
    out.push(t);
    if (out.length === 4) break;
  }
  return out.map((text, i) => ({ id: `D${i + 1}`, text }));
}

/** The distinctive words and numbers in a detail: what an email must echo to be specific. */
export function keyTerms(detail: string): string[] {
  const words = detail.toLowerCase().match(/[a-z][a-z'-]{3,}|\d[\d,.%+]*/g) ?? [];
  return [...new Set(words.filter((w) => !STOP.has(w)))];
}

/** True when the body echoes the detail: a number from it, or at least three of its distinctive words. */
export function mentionsDetail(body: string, detail: string): boolean {
  const b = body.toLowerCase();
  const terms = keyTerms(detail);
  if (terms.some((t) => /^\d/.test(t) && t.replace(/[,.%+]+$/, "").length >= 2 && b.includes(t.replace(/[,.%+]+$/, "")))) return true;
  const hits = terms.filter((t) => !/^\d/.test(t) && b.includes(t)).length;
  return hits >= Math.min(3, terms.filter((t) => !/^\d/.test(t)).length);
}

export function isPersonalised(body: string, detailId: string | undefined, details: Detail[]): boolean {
  if (!details.length) return true; // nothing specific is evidenced; the summary-based draft is the best available
  const d = details.find((x) => x.id === detailId?.trim());
  return Boolean(d && mentionsDetail(body, d.text));
}

const trimWords = (s: string, n: number) => {
  const w = s.split(/\s+/);
  return w.length <= n ? s.replace(/[.;,:]+$/, "") : `${w.slice(0, n).join(" ")}…`;
};

/** Code fallback: insert one sentence quoting the person's own CV line right after the greeting. */
export function insertDetail(body: string, detail: Detail, type: "invite" | "rejection"): string {
  const line =
    type === "invite"
      ? `One line in your application stood out to me: "${trimWords(detail.text, 24)}".`
      : `I particularly appreciated reading this in your application: "${trimWords(detail.text, 24)}".`;
  const m = body.match(/^(Hi \{\{first_name\}\},\s*\n+)/);
  return m ? `${m[1]}${line}\n\n${body.slice(m[1].length)}` : `${line}\n\n${body}`;
}
