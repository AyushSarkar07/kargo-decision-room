import type { Role } from "./rubric";

export type Dataset = "live" | "demo";

export type ApplicantStatus =
  | "extracting"
  | "needs_text" // unreadable or scanned: waiting for pasted text or a readable file
  | "ready_to_score"
  | "scoring"
  | "scored"
  | "failed";

export interface Line {
  id: string; // "L12" — stable reference into sanitized text
  text: string;
}

export interface WorkRole {
  title: string;
  organisation_type: string;
  period: string;
  line_ids: string[];
}

export interface WorkEvidence {
  summary: string;
  roles: WorkRole[];
  total_years_experience_estimate: number | null;
  pm_years_estimate: number | null;
}

export interface Applicant {
  id: string;
  dataset: Dataset;
  is_synthetic: boolean;
  applied_role: Role;
  /** false when neither the upload nor the CV said which role; applied_role is then a placeholder. */
  role_confirmed: boolean;
  source_filename: string;
  source_kind: "pdf" | "docx" | "txt" | "pasted";
  file_hash: string;
  text_hash: string | null;
  storage_path: string | null;
  status: ApplicantStatus;
  error: string | null;
  warnings: string[];
  duplicate_of: string | null;
  /** Sanitized professional content only. No name, email, phone, links, or demographic lines. */
  lines: Line[];
  redaction_summary: RedactionSummary | null;
  injection_flags: string[];
  work_evidence: WorkEvidence | null;
  created_at: string;
  updated_at: string;
}

export interface RedactionSummary {
  name_found: boolean;
  emails: number;
  phones: number;
  links: number;
  demographic_lines: number;
  education_lines_withheld: number;
  name_mentions_replaced: number;
}

/** Stored separately with restricted access. Never sent to any AI call. */
export interface ApplicantPII {
  applicant_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  links: string[];
}

export type Uncertainty = "low" | "medium" | "high";

export interface EvidenceRef {
  line_id: string;
  excerpt: string;
}

export interface CriterionScore {
  criterion_id: string;
  score: number | null; // null = Not evidenced
  evidence: EvidenceRef[];
  reason: string;
  uncertainty: Uncertainty;
}

export interface RequirementCheck {
  requirement_index: number;
  status: "met" | "unclear" | "not_met";
  line_ids: string[];
  note: string;
}

export interface Evaluation {
  id: string;
  applicant_id: string;
  role: Role;
  rubric_version: string;
  scored_by: string; // model id, or "simulated"
  criteria: CriterionScore[];
  ranking_score: number;
  coverage: number;
  evidenced_score: number | null;
  role_requirements: RequirementCheck[];
  created_at: string;
}

export interface Brief {
  applicant_id: string;
  role: Role;
  sentences: [string, string, string];
  generated_by: string;
  rubric_version: string;
  created_at: string;
}

export type EmailType = "invite" | "rejection";
export type DraftStatus = "draft" | "sending" | "accepted" | "delivered" | "failed";

export interface EmailDraft {
  id: string;
  applicant_id: string;
  type: EmailType;
  subject: string;
  /** Plain text with a {{first_name}} placeholder; the real name is merged on the server at send time. */
  body: string;
  edited: boolean;
  generated_by: string;
  status: DraftStatus;
  updated_at: string;
}

export type DecisionValue = "undecided" | "reviewing" | "hold" | "invite" | "reject";

export interface Decision {
  applicant_id: string;
  decision: DecisionValue;
  note: string;
  decided_at: string;
}

export type SendStatus = "sending" | "accepted" | "delivered" | "failed" | "bounced";

export interface EmailSend {
  id: string;
  draft_id: string;
  applicant_id: string;
  idempotency_key: string;
  mode: "test" | "simulated";
  to_address: string;
  candidate_address: string | null;
  subject: string;
  status: SendStatus;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
