import "server-only";
import { randomUUID } from "node:crypto";
import { getConfig } from "./config";
import { extractText, findInstructionLikeLines, kindFromName, MAX_FILE_BYTES, sha256, textHash, toLines } from "./extract";
import { nameFromFilename, nameTokens, separatePII } from "./pii";
import { rubric, RUBRIC_VERSION, ROLES, otherRole, type Role } from "./rubric";
import { summarize } from "./scoring";
import { getStore } from "./store";
import type { Applicant, ApplicantPII, Brief, CriterionScore, EmailDraft, Evaluation } from "./types";
import { GeminiProvider } from "./ai/gemini";
import { SimulatedProvider } from "./ai/simulated";
import type { AIProvider } from "./ai/provider";
import { validBrief, validEmailBody, verifyCriteria } from "./ai/verify";

let providerOverride: AIProvider | null = null;
export function setProviderForTests(p: AIProvider | null) {
  providerOverride = p;
}

export function getProvider(): AIProvider {
  if (providerOverride) return providerOverride;
  const c = getConfig();
  return c.ai === "gemini" ? new GeminiProvider(process.env.GEMINI_API_KEY!, c.geminiModel) : new SimulatedProvider();
}

const now = () => new Date().toISOString();

// Stored type comes from the verified extension, not the browser-supplied MIME (which may be empty).
const CONTENT_TYPES = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
} as const;

export class IngestError extends Error {
  constructor(message: string, public status = 400, public existingId?: string) {
    super(message);
  }
}

export interface IngestInput {
  data: Buffer;
  filename: string;
  mime?: string;
  role: Role;
  force?: boolean;
  isSynthetic?: boolean;
  /** false when the role applied for is not known; the applicant is scored but not ranked until a role is chosen. */
  roleConfirmed?: boolean;
}

/** Stores the file, extracts text, and separates identifying details. No AI call happens here. */
export async function ingestFile(input: IngestInput): Promise<Applicant> {
  const store = getStore();
  const kind = kindFromName(input.filename, input.mime);
  if (!kind) throw new IngestError("Unsupported file type. Upload PDF, DOCX, or TXT.", 415);
  if (input.data.length > MAX_FILE_BYTES) throw new IngestError("File is larger than 8 MB.", 413);
  if (!ROLES.includes(input.role)) throw new IngestError("Choose PM or SPM for this file.");

  const fileHash = sha256(input.data);
  const dup = await store.findApplicantByHash("file_hash", fileHash);
  if (dup && !input.force) throw new IngestError("This exact file has already been uploaded.", 409, dup.id);

  const id = randomUUID();
  const storagePath = `${id}/${kind === "txt" ? "cv.txt" : `cv.${kind}`}`;
  await store.saveFile(storagePath, input.data, CONTENT_TYPES[kind]);

  const base: Applicant = {
    id,
    dataset: store.kind === "supabase" ? "live" : "demo",
    is_synthetic: Boolean(input.isSynthetic),
    applied_role: input.role,
    role_confirmed: input.roleConfirmed ?? true,
    source_filename: input.filename.slice(0, 200),
    source_kind: kind,
    file_hash: fileHash,
    text_hash: null,
    storage_path: storagePath,
    status: "extracting",
    error: null,
    warnings: [],
    duplicate_of: null,
    lines: [],
    redaction_summary: null,
    injection_flags: [],
    work_evidence: null,
    created_at: now(),
    updated_at: now(),
  };

  const extracted = await extractText(input.data, kind);
  if (extracted.unreadable) {
    await store.createApplicant(
      { ...base, status: "needs_text", warnings: extracted.warnings },
      { applicant_id: id, full_name: nameFromFilename(input.filename), email: null, phone: null, links: [], aliases: [] },
    );
    return (await store.getApplicant(id))!;
  }
  return finishSeparation(base, extracted.text, extracted.warnings, true);
}

async function finishSeparation(base: Applicant, rawText: string, warnings: string[], isNew: boolean, nameOverride?: string | null) {
  const store = getStore();
  const sep = separatePII(rawText, nameOverride, base.source_filename);
  const lines = toLines(sep.sanitizedLines);
  const tHash = textHash(lines);
  const w = [...warnings];
  if (!sep.pii.full_name) w.push("No name was detected. Add it before sending any email.");
  if (!sep.pii.email) w.push("No email address was found in the CV.");

  let duplicateOf: string | null = null;
  const sameText = await store.findApplicantByHash("text_hash", tHash, base.id);
  if (sameText) duplicateOf = sameText.id;
  else if (sep.pii.email) {
    // A shared mailbox (e.g. a test inbox used on many CVs) is not a duplicate: require the name to match too.
    const other = await store.findApplicantIdByEmail(sep.pii.email, base.id);
    const otherName = other ? (await store.getPII(other))?.full_name : null;
    const norm = (n: string | null | undefined) => nameTokens(n ?? null).map((t) => t.toLowerCase()).sort().join(" ");
    if (other && otherName && norm(otherName) !== "" && norm(otherName) === norm(sep.pii.full_name)) duplicateOf = other;
  }
  if (duplicateOf) w.push("Possible duplicate of another applicant (same CV text, or same email and name).");

  const patch: Partial<Applicant> = {
    status: "ready_to_score",
    lines,
    text_hash: tHash,
    redaction_summary: sep.summary,
    injection_flags: findInstructionLikeLines(lines),
    warnings: w,
    duplicate_of: duplicateOf,
    error: null,
  };
  const pii: ApplicantPII = { applicant_id: base.id, ...sep.pii, aliases: sep.redactedTokens };
  if (isNew) await store.createApplicant({ ...base, ...patch, updated_at: now() }, pii);
  else {
    await store.updateApplicant(base.id, patch);
    await store.updatePII(base.id, { ...sep.pii, aliases: sep.redactedTokens });
  }
  return (await store.getApplicant(base.id))!;
}

/**
 * Re-runs extraction and PII separation from the stored original, then re-scores.
 * Overwrites sanitized lines, evaluations, briefs and unedited drafts; decisions and sends are untouched.
 */
export async function reprocessApplicant(id: string, nameOverride?: string | null) {
  const store = getStore();
  const a = await store.getApplicant(id);
  if (!a) throw new IngestError("Applicant not found.", 404);
  if (!a.storage_path || a.source_kind === "pasted") throw new IngestError("No stored original to reprocess.", 409);
  const data = await store.readFile(a.storage_path);
  if (!data) throw new IngestError("Stored original is missing.", 409);
  const ex = await extractText(data, a.source_kind as "pdf" | "docx" | "txt");
  if (ex.unreadable) {
    await store.updateApplicant(id, { status: "needs_text", warnings: ex.warnings, lines: [] });
    return store.getApplicant(id);
  }
  await finishSeparation(a, ex.text, ex.warnings, false, nameOverride);
  return scoreApplicant(id);
}

/** Recovery path for scanned or unreadable files: the founder pastes the CV text. */
export async function submitPastedText(id: string, text: string) {
  const store = getStore();
  const a = await store.getApplicant(id);
  if (!a) throw new IngestError("Applicant not found.", 404);
  if (text.trim().length < 200) throw new IngestError("Paste the full CV text (at least a few lines of work history).");
  return finishSeparation({ ...a, source_kind: a.source_kind }, text, ["Text was pasted by the founder for an unreadable file."], false);
}

function fallbackBrief(criteria: (CriterionScore & { name: string })[]): [string, string, string] {
  const scored = criteria.filter((c) => c.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const best = scored[0];
  const gap = criteria.find((c) => c.score === null) ?? [...scored].reverse()[0];
  return [
    best?.evidence[0]
      ? `The strongest evidence is for ${best.name.toLowerCase()}: "${best.evidence[0].excerpt}".`
      : "No criterion has verified evidence yet.",
    `The key uncertainty is ${gap.name.toLowerCase()}, which the CV ${gap.score === null ? "does not evidence" : `supports only at ${gap.score}/4`}.`,
    `Ask for a specific example that shows ${gap.name.toLowerCase()} and what happened as a result.`,
  ];
}

const FALLBACK_EMAIL = {
  invite: {
    subject: "Kargo: next step on your application",
    body: "Hi {{first_name}},\n\nThank you for applying to Kargo. I read your application and would like to talk. Would you have 30 minutes for a call this week or next? Reply with a few times that suit you.\n\nArjun Mehta, Founder, Kargo",
  },
  rejection: {
    subject: "Your application to Kargo",
    body: "Hi {{first_name}},\n\nThank you for applying to Kargo and for the time you put into it. We are not moving forward with your application for this role right now. I appreciated reading about your work and wish you well with what comes next.\n\nArjun Mehta, Founder, Kargo",
  },
};

/** Scores against BOTH rubrics, then writes briefs and drafts. Human decisions and sends are never touched. */
export async function scoreApplicant(id: string) {
  const store = getStore();
  const a = await store.getApplicant(id);
  if (!a) throw new IngestError("Applicant not found.", 404);
  if (a.status === "needs_text") throw new IngestError("This file has no readable text yet. Paste the CV text first.", 409);
  if (!a.lines.length) throw new IngestError("No sanitized text to score.", 409);
  const pii = await store.getPII(id);
  // Fail closed: without a known name we cannot prove it was removed, so nothing goes to the AI.
  if (!pii?.full_name) {
    await store.updateApplicant(id, {
      status: "failed",
      error: "Name not detected. Add the candidate's name (edit name) so it can be removed before scoring.",
    });
    throw new IngestError("Name not detected. Add the candidate's name so it can be removed before scoring.", 422);
  }
  const guard = { full_name: pii.full_name, email: pii.email, phone: pii.phone, links: pii.links ?? [], aliases: pii.aliases ?? [] };
  const provider = getProvider();

  await store.updateApplicant(id, { status: "scoring", error: null });
  try {
    const appliedRole = a.role_confirmed === false ? null : a.applied_role;
    const out = await provider.score(a.lines, appliedRole, guard);
    const flags = [...new Set([...a.injection_flags])];
    const evaluations: Evaluation[] = ROLES.map((role) => {
      const criteria = verifyCriteria(out.evaluations[role].criteria, a.lines, flags);
      const s = summarize(role, criteria);
      return {
        id: randomUUID(),
        applicant_id: id,
        role,
        rubric_version: RUBRIC_VERSION,
        scored_by: provider.id,
        criteria,
        ranking_score: s.ranking_score,
        coverage: s.coverage,
        evidenced_score: s.evidenced_score,
        role_requirements: out.evaluations[role].role_requirements.filter((r) => r.requirement_index < rubric.role_requirements[role].length),
        created_at: now(),
      };
    });

    const named = (role: Role) => {
      const e = evaluations.find((x) => x.role === role)!;
      return {
        ranking_score: e.ranking_score,
        coverage: e.coverage,
        criteria: e.criteria.map((c) => ({ ...c, name: rubric.criteria.find((r) => r.id === c.criterion_id)!.name })),
      };
    };
    const byRole = { PM: named("PM"), SPM: named("SPM") };
    const syn = await provider.synthesize({ appliedRole, summary: out.work_evidence.summary, byRole }, guard);

    const briefs: Brief[] = ROLES.map((role) => {
      const raw = role === (appliedRole ?? "PM") ? syn.brief_applied : syn.brief_other;
      const ok = validBrief(raw);
      return {
        applicant_id: id,
        role,
        sentences: ok ? raw : fallbackBrief(byRole[role].criteria),
        generated_by: ok ? provider.id : "template-fallback",
        rubric_version: RUBRIC_VERSION,
        created_at: now(),
      };
    });

    const drafts: EmailDraft[] = (["invite", "rejection"] as const).map((type) => {
      const gen = syn[type];
      const ok = validEmailBody(gen.body);
      return {
        id: randomUUID(),
        applicant_id: id,
        type,
        subject: ok ? gen.subject : FALLBACK_EMAIL[type].subject,
        body: ok ? gen.body : FALLBACK_EMAIL[type].body,
        edited: false,
        generated_by: ok ? provider.id : "template-fallback",
        status: "draft",
        updated_at: now(),
      };
    });

    await store.saveEvaluations(evaluations);
    await store.saveBriefs(briefs);
    await store.saveGeneratedDrafts(drafts);
    if (out.instruction_like_text_found && !flags.length) flags.push("model-flagged");
    await store.updateApplicant(id, { status: "scored", work_evidence: out.work_evidence, injection_flags: flags, error: null });
  } catch (e) {
    const msg = (e as Error).message;
    // Never log CV content; the message is safe (it names only which PII type was blocked).
    console.error(`[score] applicant ${id} failed: ${msg.slice(0, 300)}`);
    await store.updateApplicant(id, { status: "failed", error: msg.slice(0, 500) });
    throw e;
  }
  return store.getApplicant(id);
}

export { otherRole };
