// Pure ranking and status logic, shared by server and browser.
import { rubric, type Role } from "./rubric";
import type { Applicant, Brief, Decision, EmailDraft, EmailSend, EmailType, Evaluation } from "./types";

export const TOP_N = 5;
export const ROLE_GAP_THRESHOLD = 15;
export const EVIDENCED_GAP_THRESHOLD = 20;

export interface Candidate {
  applicant: Applicant;
  name: string | null;
  email: string | null;
  evaluations: Partial<Record<Role, Evaluation>>;
  briefs: Partial<Record<Role, Brief>>;
  drafts: Partial<Record<EmailType, EmailDraft>>;
  decision: Decision | null;
  sends: EmailSend[];
}

export type StatusLabel =
  | "Processing"
  | "Needs text"
  | "Failed"
  | "Provisional top 5"
  | "Needs review"
  | "In review"
  | "On hold"
  | "Draft ready"
  | "Sending"
  | "Sent"
  | "Simulated send"
  | "Delivered"
  | "Send failed";

export function latestSend(c: Candidate): EmailSend | null {
  return [...c.sends].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
}

export function statusOf(c: Candidate, inTopFive: boolean): StatusLabel {
  const s = c.applicant.status;
  if (s === "extracting" || s === "scoring" || s === "ready_to_score") return "Processing";
  if (s === "needs_text") return "Needs text";
  if (s === "failed") return "Failed";
  const send = latestSend(c);
  if (send) {
    if (send.mode === "simulated" && send.status === "accepted") return "Simulated send";
    if (send.status === "sending") return "Sending";
    if (send.status === "accepted") return "Sent";
    if (send.status === "delivered") return "Delivered";
    if (send.status === "failed" || send.status === "bounced") return "Send failed";
  }
  const d = c.decision?.decision;
  if (d === "invite" || d === "reject") return "Draft ready";
  if (d === "hold") return "On hold";
  if (d === "reviewing") return "In review";
  return inTopFive ? "Provisional top 5" : "Needs review";
}

/** A suggestion for which draft to show. Never a decision. */
export function suggestedEmailType(c: Candidate, inTopFive: boolean): EmailType {
  const d = c.decision?.decision;
  if (d === "invite") return "invite";
  if (d === "reject") return "rejection";
  return inTopFive ? "invite" : "rejection";
}

export interface RankedRow {
  candidate: Candidate;
  rank: number;
  evaluation: Evaluation;
  inTopFive: boolean;
  incomplete: boolean;
  status: StatusLabel;
}

export interface RoleBoard {
  role: Role;
  ranked: RankedRow[];
  pending: Candidate[]; // applied for this role but not scored yet
  crossRole: { candidate: Candidate; evaluation: Evaluation; wouldRank: number }[];
}

const incompleteThreshold = rubric.missing_evidence_policy.incomplete_threshold;

function byScore(role: Role) {
  return (a: Candidate, b: Candidate) => {
    const ea = a.evaluations[role]!;
    const eb = b.evaluations[role]!;
    return (
      eb.ranking_score - ea.ranking_score ||
      eb.coverage - ea.coverage ||
      a.applicant.created_at.localeCompare(b.applicant.created_at)
    );
  };
}

export function buildRoleBoard(role: Role, candidates: Candidate[]): RoleBoard {
  const scored = candidates.filter((c) => c.applicant.status === "scored" && c.evaluations[role]);
  const applied = scored.filter((c) => c.applicant.applied_role === role).sort(byScore(role));
  const ranked = applied.map((c, i) => {
    const evaluation = c.evaluations[role]!;
    const inTopFive = i < TOP_N;
    return { candidate: c, rank: i + 1, evaluation, inTopFive, incomplete: evaluation.coverage < incompleteThreshold, status: statusOf(c, inTopFive) };
  });
  const pending = candidates.filter((c) => c.applicant.applied_role === role && c.applicant.status !== "scored");
  // Cross-role: applicants for the other role who would sit in this role's top five. Shown, never moved.
  const cutoff = ranked[TOP_N - 1]?.evaluation.ranking_score ?? 0;
  const crossRole = scored
    .filter((c) => c.applicant.applied_role !== role)
    .map((c) => {
      const evaluation = c.evaluations[role]!;
      const wouldRank = ranked.filter((r) => r.evaluation.ranking_score > evaluation.ranking_score).length + 1;
      return { candidate: c, evaluation, wouldRank };
    })
    .filter((x) => x.wouldRank <= TOP_N || x.evaluation.ranking_score >= cutoff)
    .sort((a, b) => b.evaluation.ranking_score - a.evaluation.ranking_score);
  return { role, ranked, pending, crossRole };
}

export interface SecondLookItem {
  candidate: Candidate;
  reasons: string[];
}

export function secondLook(candidates: Candidate[], boards: RoleBoard[]): SecondLookItem[] {
  const topIds = new Set(boards.flatMap((b) => b.ranked.filter((r) => r.inTopFive).map((r) => r.candidate.applicant.id)));
  const out: SecondLookItem[] = [];
  for (const c of candidates) {
    const reasons: string[] = [];
    const a = c.applicant;
    if (a.status === "needs_text") reasons.push("File could not be read. Paste the CV text to score it.");
    if (a.status === "failed") reasons.push(`Processing failed: ${a.error ?? "unknown error"}`);
    if (a.status === "scored") {
      const own = c.evaluations[a.applied_role];
      const pm = c.evaluations.PM;
      const spm = c.evaluations.SPM;
      if (own && own.coverage < incompleteThreshold) reasons.push(`Incomplete evidence: ${own.coverage}% coverage for the role applied for.`);
      if (pm && spm && Math.abs(pm.ranking_score - spm.ranking_score) >= ROLE_GAP_THRESHOLD)
        reasons.push(`PM and SPM results differ materially (${pm.ranking_score} vs ${spm.ranking_score}).`);
      if (own && own.evidenced_score !== null && own.evidenced_score - own.ranking_score >= EVIDENCED_GAP_THRESHOLD && !topIds.has(a.id))
        reasons.push(`Strong on what is evidenced (${own.evidenced_score}) but many gaps pull the ranking score down to ${own.ranking_score}.`);
    }
    if (a.injection_flags.length) reasons.push("CV contains instruction-like text. It was treated as data, not obeyed; check the flagged lines.");
    if (a.warnings.some((w) => /pages had no readable text|duplicate/i.test(w))) reasons.push(...a.warnings.filter((w) => /pages had no readable text|duplicate/i.test(w)));
    if (reasons.length) out.push({ candidate: c, reasons });
  }
  return out;
}
