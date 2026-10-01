// File-backed store for demo mode. Everything lives under DEMO_DATA_DIR (default .data/),
// which is gitignored. Not for production: single process, no access control beyond the app.
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Applicant, ApplicantPII, Brief, Decision, EmailDraft, EmailSend, Evaluation } from "../types";
import type { CalibrationRun } from "../calibration-metrics";
import { ACTIVE_SEND_STATUSES, type ClaimResult, type Store } from "./types";

interface Data {
  applicants: Applicant[];
  pii: ApplicantPII[];
  evaluations: Evaluation[];
  briefs: Brief[];
  drafts: EmailDraft[];
  decisions: Decision[];
  sends: EmailSend[];
  calibration: CalibrationRun[];
}

const empty = (): Data => ({ applicants: [], pii: [], evaluations: [], briefs: [], drafts: [], decisions: [], sends: [], calibration: [] });

export class LocalStore implements Store {
  kind = "local-demo" as const;
  private file: string;
  private filesDir: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private dir = process.env.DEMO_DATA_DIR ?? path.join(process.cwd(), ".data")) {
    this.file = path.join(dir, "store.json");
    this.filesDir = path.join(dir, "files");
  }

  private async load(): Promise<Data> {
    if (!existsSync(this.file)) return empty();
    return { ...empty(), ...JSON.parse(await readFile(this.file, "utf8")) };
  }

  private async persist(d: Data) {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(d));
    await rename(tmp, this.file);
  }

  /** Serialises every read-modify-write so claims are atomic within the process. */
  private tx<T>(fn: (d: Data) => T | Promise<T>): Promise<T> {
    const run = this.queue.then(async () => {
      const d = await this.load();
      const out = await fn(d);
      await this.persist(d);
      return out;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private read<T>(fn: (d: Data) => T): Promise<T> {
    const run = this.queue.then(async () => fn(await this.load()));
    this.queue = run.catch(() => undefined);
    return run;
  }

  async reset() {
    await this.tx((d) => Object.assign(d, empty()));
  }

  createApplicant(a: Applicant, pii: ApplicantPII) {
    return this.tx((d) => {
      d.applicants.push(a);
      d.pii.push(pii);
    });
  }
  updateApplicant(id: string, patch: Partial<Applicant>) {
    return this.tx((d) => {
      const a = d.applicants.find((x) => x.id === id);
      if (a) Object.assign(a, patch, { updated_at: new Date().toISOString() });
    });
  }
  getApplicant(id: string) {
    return this.read((d) => d.applicants.find((x) => x.id === id) ?? null);
  }
  listApplicants() {
    return this.read((d) => d.applicants);
  }
  findApplicantByHash(field: "file_hash" | "text_hash", hash: string, excludeId?: string) {
    return this.read((d) => d.applicants.find((a) => a[field] === hash && a.id !== excludeId) ?? null);
  }

  getPII(id: string) {
    return this.read((d) => d.pii.find((p) => p.applicant_id === id) ?? null);
  }
  listPII() {
    return this.read((d) => d.pii);
  }
  updatePII(id: string, patch: Partial<ApplicantPII>) {
    return this.tx((d) => {
      const p = d.pii.find((x) => x.applicant_id === id);
      if (p) Object.assign(p, patch);
    });
  }
  findApplicantIdByEmail(email: string, excludeId?: string) {
    return this.read((d) => d.pii.find((p) => p.email?.toLowerCase() === email.toLowerCase() && p.applicant_id !== excludeId)?.applicant_id ?? null);
  }

  async saveFile(p: string, data: Buffer) {
    const full = path.join(this.filesDir, p);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
  }
  async readFile(p: string) {
    const full = path.join(this.filesDir, p);
    return existsSync(full) ? readFile(full) : null;
  }

  saveEvaluations(evals: Evaluation[]) {
    return this.tx((d) => {
      for (const e of evals) {
        d.evaluations = d.evaluations.filter((x) => !(x.applicant_id === e.applicant_id && x.role === e.role));
        d.evaluations.push(e);
      }
    });
  }
  listEvaluations() {
    return this.read((d) => d.evaluations);
  }

  saveBriefs(briefs: Brief[]) {
    return this.tx((d) => {
      for (const b of briefs) {
        d.briefs = d.briefs.filter((x) => !(x.applicant_id === b.applicant_id && x.role === b.role));
        d.briefs.push(b);
      }
    });
  }
  listBriefs() {
    return this.read((d) => d.briefs);
  }

  saveGeneratedDrafts(drafts: EmailDraft[]) {
    return this.tx((d) => {
      for (const n of drafts) {
        const existing = d.drafts.find((x) => x.applicant_id === n.applicant_id && x.type === n.type);
        if (!existing) d.drafts.push(n);
        else if (!existing.edited && existing.status === "draft") Object.assign(existing, { ...n, id: existing.id });
      }
    });
  }
  getDraft(id: string) {
    return this.read((d) => d.drafts.find((x) => x.id === id) ?? null);
  }
  listDrafts() {
    return this.read((d) => d.drafts);
  }
  updateDraft(id: string, patch: Partial<EmailDraft>) {
    return this.tx((d) => {
      const x = d.drafts.find((y) => y.id === id);
      if (x) Object.assign(x, patch, { updated_at: new Date().toISOString() });
    });
  }

  getDecision(id: string) {
    return this.read((d) => d.decisions.find((x) => x.applicant_id === id) ?? null);
  }
  setDecision(dec: Decision) {
    return this.tx((d) => {
      d.decisions = d.decisions.filter((x) => x.applicant_id !== dec.applicant_id);
      d.decisions.push(dec);
    });
  }
  listDecisions() {
    return this.read((d) => d.decisions);
  }

  claimSend(send: EmailSend): Promise<ClaimResult> {
    return this.tx((d) => {
      const existing = d.sends.find(
        (s) => s.applicant_id === send.applicant_id && (ACTIVE_SEND_STATUSES as readonly string[]).includes(s.status),
      );
      if (existing) return { ok: false as const, existing };
      d.sends.push(send);
      return { ok: true as const, send };
    });
  }
  reclaimFailedSend(id: string) {
    return this.tx((d) => {
      const s = d.sends.find((x) => x.id === id);
      const blocked = d.sends.some(
        (x) => x.id !== id && x.applicant_id === s?.applicant_id && (ACTIVE_SEND_STATUSES as readonly string[]).includes(x.status),
      );
      if (!s || s.status !== "failed" || blocked) return false;
      Object.assign(s, { status: "sending", error: null, updated_at: new Date().toISOString() });
      return true;
    });
  }
  updateSend(id: string, patch: Partial<EmailSend>) {
    return this.tx((d) => {
      const s = d.sends.find((x) => x.id === id);
      if (s) Object.assign(s, patch, { updated_at: new Date().toISOString() });
    });
  }
  listSends() {
    return this.read((d) => d.sends);
  }
  findSendByProviderId(pid: string) {
    return this.read((d) => d.sends.find((s) => s.provider_message_id === pid) ?? null);
  }

  saveCalibration(run: CalibrationRun) {
    return this.tx((d) => {
      d.calibration.push(run);
    });
  }
  getLatestCalibration() {
    return this.read((d) => d.calibration.at(-1) ?? null);
  }
}
