import type { Role } from "../rubric";
import type { CalibrationRun } from "../calibration-metrics";
import type { Applicant, ApplicantPII, Brief, Decision, EmailDraft, EmailSend, Evaluation } from "../types";

export const ACTIVE_SEND_STATUSES = ["sending", "accepted", "delivered"] as const;

export type ClaimResult = { ok: true; send: EmailSend } | { ok: false; existing: EmailSend };

export interface Store {
  kind: "local-demo" | "supabase";

  createApplicant(a: Applicant, pii: ApplicantPII): Promise<void>;
  updateApplicant(id: string, patch: Partial<Applicant>): Promise<void>;
  getApplicant(id: string): Promise<Applicant | null>;
  listApplicants(): Promise<Applicant[]>;
  findApplicantByHash(field: "file_hash" | "text_hash", hash: string, excludeId?: string): Promise<Applicant | null>;

  getPII(applicantId: string): Promise<ApplicantPII | null>;
  listPII(): Promise<ApplicantPII[]>;
  updatePII(applicantId: string, patch: Partial<ApplicantPII>): Promise<void>;
  findApplicantIdByEmail(email: string, excludeId?: string): Promise<string | null>;

  saveFile(path: string, data: Buffer, contentType: string): Promise<void>;
  readFile(path: string): Promise<Buffer | null>;

  /** Replaces the evaluation for (applicant, role). Decisions and sends are untouched. */
  saveEvaluations(evals: Evaluation[]): Promise<void>;
  listEvaluations(): Promise<Evaluation[]>;

  saveBriefs(briefs: Brief[]): Promise<void>;
  listBriefs(): Promise<Brief[]>;

  /** Inserts generated drafts, or replaces an existing one only if it was never edited and never sent. */
  saveGeneratedDrafts(drafts: EmailDraft[]): Promise<void>;
  getDraft(id: string): Promise<EmailDraft | null>;
  listDrafts(): Promise<EmailDraft[]>;
  updateDraft(id: string, patch: Partial<EmailDraft>): Promise<void>;

  getDecision(applicantId: string): Promise<Decision | null>;
  setDecision(d: Decision): Promise<void>;
  listDecisions(): Promise<Decision[]>;

  /** Atomically records a new send unless the applicant already has one sending, accepted, or delivered. */
  claimSend(send: EmailSend): Promise<ClaimResult>;
  /** Atomically moves a failed send back to "sending" for a retry with the same idempotency key. */
  reclaimFailedSend(id: string): Promise<boolean>;
  updateSend(id: string, patch: Partial<EmailSend>): Promise<void>;
  listSends(): Promise<EmailSend[]>;
  findSendByProviderId(providerId: string): Promise<EmailSend | null>;

  saveCalibration(run: CalibrationRun): Promise<void>;
  getLatestCalibration(): Promise<CalibrationRun | null>;
}

export type { Role };
