import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Applicant, ApplicantPII, Brief, Decision, EmailDraft, EmailSend, Evaluation } from "../types";
import type { CalibrationRun } from "../calibration-metrics";
import { ACTIVE_SEND_STATUSES, type ClaimResult, type Store } from "./types";
import { rubric, ROLES } from "../rubric";

const BUCKET = "cv-files";

function must<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(`Database error: ${res.error.message}`);
  return res.data;
}

/** Server-only store. Uses the service role, so callers must verify the founder's session first. */
export class SupabaseStore implements Store {
  kind = "supabase" as const;
  private db: SupabaseClient;

  constructor() {
    this.db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private rubricReady: Promise<void> | null = null;

  /** Upserts the current rubric.json version into rubric_versions / rubric_criteria (once per process). */
  ensureRubric() {
    this.rubricReady ??= (async () => {
      const existing = must(await this.db.from("rubric_versions").select("version").eq("version", rubric.version).maybeSingle());
      if (existing) return;
      must(await this.db.from("rubric_versions").upsert({ version: rubric.version, rubric }, { onConflict: "version" }));
      const rows = ROLES.flatMap((role) =>
        rubric.criteria.map((c, i) => ({
          rubric_version: rubric.version,
          role,
          criterion_id: c.id,
          position: i + 1,
          name: c.name,
          definition: c.definition,
          weight: c.weights[role],
          anchors: c.anchors[role],
          spm_ownership: c.spm_ownership,
          insufficient_evidence: c.insufficient_evidence,
          hire_evidence: c.hire_evidence,
        })),
      );
      must(await this.db.from("rubric_criteria").upsert(rows, { onConflict: "rubric_version,role,criterion_id" }));
    })().catch((e) => {
      this.rubricReady = null;
      throw e;
    });
    return this.rubricReady;
  }

  async createApplicant(a: Applicant, pii: ApplicantPII) {
    await this.ensureRubric();
    must(await this.db.from("applicants").insert(a));
    must(await this.db.from("applicant_pii").insert(pii));
  }
  async updateApplicant(id: string, patch: Partial<Applicant>) {
    must(await this.db.from("applicants").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  }
  async getApplicant(id: string) {
    return must(await this.db.from("applicants").select("*").eq("id", id).maybeSingle()) as Applicant | null;
  }
  async listApplicants() {
    await this.ensureRubric();
    return must(await this.db.from("applicants").select("*").eq("dataset", "live").order("created_at")) as Applicant[];
  }
  async findApplicantByHash(field: "file_hash" | "text_hash", hash: string, excludeId?: string) {
    let q = this.db.from("applicants").select("*").eq(field, hash).limit(1);
    if (excludeId) q = q.neq("id", excludeId);
    const rows = must(await q) as Applicant[];
    return rows[0] ?? null;
  }

  async getPII(id: string) {
    return must(await this.db.from("applicant_pii").select("*").eq("applicant_id", id).maybeSingle()) as ApplicantPII | null;
  }
  async listPII() {
    return must(await this.db.from("applicant_pii").select("*")) as ApplicantPII[];
  }
  async updatePII(id: string, patch: Partial<ApplicantPII>) {
    must(await this.db.from("applicant_pii").update(patch).eq("applicant_id", id));
  }
  async findApplicantIdByEmail(email: string, excludeId?: string) {
    let q = this.db.from("applicant_pii").select("applicant_id").ilike("email", email).limit(1);
    if (excludeId) q = q.neq("applicant_id", excludeId);
    const rows = must(await q) as { applicant_id: string }[];
    return rows[0]?.applicant_id ?? null;
  }

  async saveFile(path: string, data: Buffer, contentType: string) {
    const { error } = await this.db.storage.from(BUCKET).upload(path, data, { contentType, upsert: false });
    if (error) throw new Error(`Storage error: ${error.message}`);
  }
  async readFile(path: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  }

  async saveEvaluations(evals: Evaluation[]) {
    must(await this.db.from("evaluations").upsert(evals, { onConflict: "applicant_id,role" }));
  }
  async listEvaluations() {
    return ((must(await this.db.from("evaluations").select("*")) ?? []) as Evaluation[]).map((e) => ({
      ...e,
      ranking_score: Number(e.ranking_score),
      evidenced_score: e.evidenced_score === null ? null : Number(e.evidenced_score),
    }));
  }

  async saveBriefs(briefs: Brief[]) {
    must(await this.db.from("briefs").upsert(briefs, { onConflict: "applicant_id,role" }));
  }
  async listBriefs() {
    return must(await this.db.from("briefs").select("*")) as Brief[];
  }

  async saveGeneratedDrafts(drafts: EmailDraft[]) {
    for (const d of drafts) {
      // Insert if new; otherwise replace only an unedited, unsent draft.
      must(await this.db.from("email_drafts").upsert(d, { onConflict: "applicant_id,type", ignoreDuplicates: true }));
      const { id: _id, ...rest } = d;
      void _id;
      must(
        await this.db
          .from("email_drafts")
          .update(rest)
          .eq("applicant_id", d.applicant_id)
          .eq("type", d.type)
          .eq("edited", false)
          .eq("status", "draft"),
      );
    }
  }
  async getDraft(id: string) {
    return must(await this.db.from("email_drafts").select("*").eq("id", id).maybeSingle()) as EmailDraft | null;
  }
  async listDrafts() {
    return must(await this.db.from("email_drafts").select("*")) as EmailDraft[];
  }
  async updateDraft(id: string, patch: Partial<EmailDraft>) {
    must(await this.db.from("email_drafts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  }

  async getDecision(id: string) {
    return must(await this.db.from("decisions").select("*").eq("applicant_id", id).maybeSingle()) as Decision | null;
  }
  async setDecision(d: Decision) {
    must(await this.db.from("decisions").upsert(d, { onConflict: "applicant_id" }));
  }
  async listDecisions() {
    return must(await this.db.from("decisions").select("*")) as Decision[];
  }

  async claimSend(send: EmailSend): Promise<ClaimResult> {
    const { error } = await this.db.from("email_sends").insert(send);
    if (!error) return { ok: true, send };
    if (error.code !== "23505") throw new Error(`Database error: ${error.message}`);
    const rows = must(
      await this.db
        .from("email_sends")
        .select("*")
        .or(`applicant_id.eq.${send.applicant_id},idempotency_key.eq.${send.idempotency_key}`)
        .in("status", [...ACTIVE_SEND_STATUSES, "failed"])
        .order("created_at", { ascending: false })
        .limit(1),
    ) as EmailSend[];
    return { ok: false, existing: rows[0] };
  }
  async reclaimFailedSend(id: string) {
    const { data, error } = await this.db
      .from("email_sends")
      .update({ status: "sending", error: null, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "failed")
      .select("id");
    if (error) {
      if (error.code === "23505") return false; // another send for this applicant is already active
      throw new Error(`Database error: ${error.message}`);
    }
    return (data ?? []).length === 1;
  }
  async updateSend(id: string, patch: Partial<EmailSend>) {
    must(await this.db.from("email_sends").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id));
  }
  async listSends() {
    return must(await this.db.from("email_sends").select("*").order("created_at")) as EmailSend[];
  }
  async findSendByProviderId(pid: string) {
    return must(await this.db.from("email_sends").select("*").eq("provider_message_id", pid).maybeSingle()) as EmailSend | null;
  }

  async saveCalibration(run: CalibrationRun) {
    must(await this.db.from("calibration_runs").insert(run));
  }
  async getLatestCalibration() {
    const rows = must(await this.db.from("calibration_runs").select("*").order("created_at", { ascending: false }).limit(1)) as CalibrationRun[];
    return rows[0] ?? null;
  }
}
