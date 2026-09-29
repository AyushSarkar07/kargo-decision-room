import "server-only";
import { randomUUID } from "node:crypto";
import { Resend } from "resend";
import { getConfig, type AppConfig } from "./config";
import { sha256 } from "./extract";
import { getStore } from "./store";
import type { ApplicantPII, EmailDraft, EmailSend } from "./types";

export interface Destination {
  mode: "test" | "simulated";
  /** Where the message will actually go. Null when nothing can be sent. */
  to: string | null;
  candidateAddress: string | null;
  redirected: boolean;
  note: string;
}

/** Test mode only: a message can reach an address on the explicit allowlist, never a real candidate address. */
export function resolveDestination(candidateEmail: string | null, cfg: AppConfig = getConfig()): Destination {
  const cand = candidateEmail?.trim().toLowerCase() ?? null;
  const allowed = cand !== null && cfg.testAllowlist.includes(cand);
  if (cfg.email === "simulated") {
    return {
      mode: "simulated",
      to: allowed ? cand : cfg.defaultTestRecipient ?? "simulated@localhost",
      candidateAddress: cand,
      redirected: !allowed,
      note: "Email is simulated. Nothing leaves the app, and no provider is called.",
    };
  }
  if (allowed) {
    return { mode: "test", to: cand, candidateAddress: cand, redirected: false, note: "The candidate's address is on the test allowlist." };
  }
  return {
    mode: "test",
    to: cfg.defaultTestRecipient,
    candidateAddress: cand,
    redirected: true,
    note: cand
      ? `The candidate's address (${cand}) is not on the test allowlist. This test send goes to ${cfg.defaultTestRecipient} instead.`
      : `No candidate address was found. This test send goes to ${cfg.defaultTestRecipient}.`,
  };
}

export function firstName(pii: Pick<ApplicantPII, "full_name"> | null) {
  const n = pii?.full_name?.trim();
  return n ? n.split(/\s+/)[0] : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Server-side merge of the candidate's real name. The name never passes through the AI. */
export function renderEmail(draft: Pick<EmailDraft, "subject" | "body">, pii: Pick<ApplicantPII, "full_name"> | null) {
  const name = firstName(pii);
  if (!name) throw new SendError("Add the candidate's name before sending.", 422);
  const text = draft.body.replace(/\{\{\s*first_name\s*\}\}/g, name);
  const subject = draft.subject.replace(/\{\{\s*first_name\s*\}\}/g, name);
  if (/\{\{|\}\}|\[name\]/i.test(text + subject)) throw new SendError("The draft still contains a placeholder. Edit it before sending.", 422);
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.55;color:#14213d">${text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("")}</div>`;
  return { subject, text, html };
}

export class SendError extends Error {
  constructor(message: string, public status = 400, public send?: EmailSend) {
    super(message);
  }
}

export interface Transport {
  send(msg: { from: string; to: string; subject: string; text: string; html: string }, idempotencyKey: string): Promise<{ id: string }>;
}

let transportOverride: Transport | null = null;
export function setTransportForTests(t: Transport | null) {
  transportOverride = t;
}

function transport(cfg: AppConfig): Transport | null {
  if (transportOverride) return transportOverride;
  if (cfg.email !== "resend-test") return null;
  const resend = new Resend(process.env.RESEND_API_KEY);
  return {
    async send(msg, idempotencyKey) {
      const { data, error } = await resend.emails.send(
        { from: msg.from, to: [msg.to], subject: msg.subject, text: msg.text, html: msg.html },
        { idempotencyKey },
      );
      if (error || !data) throw new Error(error?.message ?? "Resend returned no message id");
      return { id: data.id };
    },
  };
}

/**
 * Sends one draft after the founder's explicit confirmation.
 * - requires a matching invite/reject decision
 * - requires the founder to have seen the actual destination (expectedTo)
 * - claims the send atomically, so double clicks and retries cannot send twice
 */
export async function sendDraft(draftId: string, expectedTo: string, cfg: AppConfig = getConfig()) {
  const store = getStore();
  const draft = await store.getDraft(draftId);
  if (!draft) throw new SendError("Draft not found.", 404);
  const applicant = await store.getApplicant(draft.applicant_id);
  if (!applicant || applicant.status !== "scored") throw new SendError("This applicant has not finished processing.", 409);
  const decision = await store.getDecision(draft.applicant_id);
  const needed = draft.type === "invite" ? "invite" : "reject";
  if (decision?.decision !== needed)
    throw new SendError(`Record an "${needed === "invite" ? "Invite" : "Reject"}" decision before sending this ${draft.type} email.`, 409);

  const pii = await store.getPII(draft.applicant_id);
  const dest = resolveDestination(pii?.email ?? null, cfg);
  if (!dest.to) throw new SendError("No test recipient is configured.", 409);
  if (dest.mode === "test" && !cfg.testAllowlist.includes(dest.to)) throw new SendError("Destination is not on the test allowlist.", 403);
  if (expectedTo.trim().toLowerCase() !== dest.to) throw new SendError("The destination changed since you reviewed it. Check it and confirm again.", 409);

  const rendered = renderEmail(draft, pii);
  const idempotencyKey = `kargo-send/${draft.applicant_id}/${sha256(`${dest.to}\n${rendered.subject}\n${rendered.text}`).slice(0, 32)}`;

  const sends = await store.listSends();
  const mine = sends.filter((s) => s.applicant_id === draft.applicant_id);
  const active = mine.find((s) => s.status === "sending" || s.status === "accepted" || s.status === "delivered");
  if (active) throw new SendError(active.status === "sending" ? "A send is already in progress." : "An email has already been sent to this candidate.", 409, active);

  let send: EmailSend;
  const retry = mine.find((s) => s.idempotency_key === idempotencyKey && s.status === "failed");
  if (retry) {
    if (!(await store.reclaimFailedSend(retry.id))) throw new SendError("A send is already in progress.", 409);
    send = { ...retry, status: "sending", error: null };
  } else {
    const claim = await store.claimSend({
      id: randomUUID(),
      draft_id: draft.id,
      applicant_id: draft.applicant_id,
      idempotency_key: idempotencyKey,
      mode: dest.mode,
      to_address: dest.to,
      candidate_address: dest.candidateAddress,
      subject: rendered.subject,
      status: "sending",
      provider_message_id: null,
      error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (!claim.ok) throw new SendError("An email is already in progress or sent for this candidate.", 409, claim.existing);
    send = claim.send;
  }
  await store.updateDraft(draft.id, { status: "sending" });

  const t = transport(cfg);
  try {
    let providerId: string;
    if (!t) {
      providerId = `simulated-${randomUUID()}`;
    } else {
      const res = await t.send({ from: cfg.emailFrom!, to: dest.to, ...rendered }, idempotencyKey);
      providerId = res.id;
    }
    await store.updateSend(send.id, { status: "accepted", provider_message_id: providerId, error: null });
    await store.updateDraft(draft.id, { status: "accepted" });
    return { ...send, status: "accepted" as const, provider_message_id: providerId };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    await store.updateSend(send.id, { status: "failed", error: msg });
    await store.updateDraft(draft.id, { status: "failed" });
    throw new SendError(`Send failed: ${msg}. The draft is saved; you can retry.`, 502);
  }
}

/** Applies a Resend delivery webhook. Provider acceptance and confirmed delivery stay distinct. */
export async function applyDeliveryEvent(type: string, providerId: string) {
  const store = getStore();
  const send = await store.findSendByProviderId(providerId);
  if (!send) return false;
  if (type === "email.delivered") {
    await store.updateSend(send.id, { status: "delivered" });
    await store.updateDraft(send.draft_id, { status: "delivered" });
  } else if (type === "email.bounced" || type === "email.failed" || type === "email.suppressed") {
    await store.updateSend(send.id, { status: "bounced", error: type });
    await store.updateDraft(send.draft_id, { status: "failed" });
  }
  return true;
}
