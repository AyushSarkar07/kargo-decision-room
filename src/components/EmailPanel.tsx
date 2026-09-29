"use client";
import { useEffect, useState } from "react";
import { latestSend, suggestedEmailType, type Candidate, type RoleBoard } from "@/lib/board";
import type { PublicConfig } from "@/lib/config";
import type { DecisionValue, EmailType } from "@/lib/types";
import { api } from "./api-client";
import { Button, Chip, cx, roleName, SectionLabel, Spinner } from "./ui";

interface Destination {
  mode: "test" | "simulated";
  to: string | null;
  candidateAddress: string | null;
  redirected: boolean;
  note: string;
}

const DECISIONS: { v: DecisionValue; label: string; hint: string }[] = [
  { v: "reviewing", label: "Review", hint: "Mark as being reviewed" },
  { v: "hold", label: "Hold", hint: "Keep for later; no email" },
  { v: "invite", label: "Invite", hint: "Invite to interview" },
  { v: "reject", label: "Reject", hint: "Decline for this role" },
];

export function EmailPanel({ candidate, board, config, onChanged }: { candidate: Candidate; board: RoleBoard; config: PublicConfig; onChanged: () => void }) {
  const a = candidate.applicant;
  const row = board.ranked.find((r) => r.candidate.applicant.id === a.id);
  const inTop = row?.inTopFive ?? false;
  const decision = candidate.decision?.decision ?? "undecided";
  const send = latestSend(candidate);
  const locked = !!send && ["sending", "accepted", "delivered"].includes(send.status);

  const [type, setType] = useState<EmailType>(send ? (candidate.drafts.invite?.id === send.draft_id ? "invite" : "rejection") : suggestedEmailType(candidate, inTop));
  const draft = candidate.drafts[type];
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [preview, setPreview] = useState(false);
  const [dest, setDest] = useState<Destination | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "bad" | "good"; text: string } | null>(null);

  // Reset the editor when a different draft (or a newly saved version) arrives.
  const draftKey = `${draft?.id}|${draft?.updated_at}`;
  const [seenKey, setSeenKey] = useState(draftKey);
  if (seenKey !== draftKey) {
    setSeenKey(draftKey);
    setSubject(draft?.subject ?? "");
    setBody(draft?.body ?? "");
  }

  useEffect(() => {
    api<Destination>(`/api/applicants/${a.id}/destination`).then(setDest, () => setDest(null));
  }, [a.id, candidate.email]);

  const dirty = !!draft && (subject !== draft.subject || body !== draft.body);
  const needed: DecisionValue = type === "invite" ? "invite" : "reject";
  const firstName = candidate.name?.split(/\s+/)[0] ?? null;
  const merged = firstName ? body.replace(/\{\{\s*first_name\s*\}\}/g, firstName) : body;
  const canSend = a.status === "scored" && !!draft && !dirty && decision === needed && !locked && !!firstName && !!dest?.to;

  async function decide(v: DecisionValue) {
    setBusy("decision");
    setMsg(null);
    try {
      await api(`/api/applicants/${a.id}/decision`, { method: "POST", json: { decision: v } });
      if (v === "invite") setType("invite");
      if (v === "reject") setType("rejection");
      onChanged();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!draft) return;
    setBusy("save");
    setMsg(null);
    try {
      await api(`/api/drafts/${draft.id}`, { method: "PATCH", json: { subject, body } });
      setMsg({ tone: "good", text: "Draft saved." });
      onChanged();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  }

  async function confirmSend() {
    if (!draft || !dest?.to) return;
    setBusy("send");
    setMsg(null);
    try {
      await api(`/api/drafts/${draft.id}/send`, { method: "POST", json: { confirm: true, expected_to: dest.to } });
      setConfirming(false);
      onChanged();
    } catch (e) {
      setMsg({ tone: "bad", text: (e as Error).message });
      setConfirming(false);
      onChanged();
    } finally {
      setBusy(null);
    }
  }

  if (a.status !== "scored") return null;

  return (
    <section className="space-y-4 xl:sticky xl:top-3 xl:max-h-[calc(100vh-24px)] xl:overflow-y-auto">
      {/* Decision */}
      <div className="rounded-lg border border-line bg-card px-4 py-3.5">
        <SectionLabel right={<span className="text-[11px] text-muted">Only you decide</span>}>Decision</SectionLabel>
        <div className="grid grid-cols-4 gap-1.5">
          {DECISIONS.map((d) => (
            <button
              key={d.v}
              title={d.hint}
              disabled={locked || busy === "decision"}
              onClick={() => decide(decision === d.v ? "undecided" : d.v)}
              className={cx(
                "rounded-md border px-2 py-1.5 text-[12.5px] font-medium transition-colors disabled:opacity-50",
                decision === d.v
                  ? d.v === "reject"
                    ? "border-bad bg-bad-soft text-bad"
                    : d.v === "invite"
                      ? "border-good bg-good-soft text-good"
                      : "border-ink bg-ink text-white"
                  : "border-line-strong bg-card text-ink-2 hover:border-ink-2/50",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted">
          {decision === "undecided"
            ? inTop
              ? "Recommended for a first call (provisional top 5). No decision recorded yet."
              : "Needs review. Nothing is rejected until you choose Reject."
            : `Decision recorded: ${DECISIONS.find((d) => d.v === decision)?.label ?? decision}.`}
          {locked && " Locked because an email has gone out."}
        </p>
      </div>

      {/* Email */}
      <div className="rounded-lg border border-line bg-card">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
          <div className="flex rounded-md border border-line-strong p-0.5 text-[12px]">
            {(["invite", "rejection"] as const).map((t) => (
              <button
                key={t}
                disabled={locked}
                onClick={() => setType(t)}
                className={cx("rounded px-2.5 py-1 font-medium capitalize", type === t ? "bg-ink text-white" : "text-ink-2 hover:bg-paper")}
              >
                {t} draft
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted">
            {draft?.edited ? "Edited by you" : draft?.generated_by === "simulated" ? "Simulated draft" : draft?.generated_by === "template-fallback" ? "Template draft" : "AI draft"}
          </span>
        </div>

        <div className="space-y-2 px-4 py-3">
          <p className="rounded bg-paper px-2 py-1 text-[11.5px] text-muted">
            This is a draft, not a decision. It is for the {roleName(a.applied_role)} role they applied for.
          </p>
          <label className="block">
            <span className="text-[11px] font-medium text-muted">Subject</span>
            <input
              value={subject}
              disabled={locked}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-0.5 w-full rounded-md border border-line-strong bg-card px-2.5 py-1.5 text-[13px] disabled:bg-paper"
            />
          </label>
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-muted">Message</span>
              <button className="text-[11px] text-accent underline-offset-2 hover:underline" onClick={() => setPreview(!preview)}>
                {preview ? "Edit" : "Preview with name"}
              </button>
            </div>
            {preview ? (
              <div className="mt-0.5 min-h-[260px] whitespace-pre-wrap rounded-md border border-line bg-paper/50 px-3 py-2 font-serif text-[14.5px] leading-relaxed">{merged}</div>
            ) : (
              <textarea
                value={body}
                disabled={locked}
                onChange={(e) => setBody(e.target.value)}
                rows={13}
                className="mt-0.5 w-full resize-y rounded-md border border-line-strong bg-card px-3 py-2 text-[13px] leading-relaxed disabled:bg-paper"
              />
            )}
            <p className="mt-1 text-[11px] text-muted">
              <code className="rounded bg-paper px-1">{"{{first_name}}"}</code> is replaced with {firstName ? <b>{firstName}</b> : "the candidate's name"} on the server when sent.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={!dirty || locked || busy === "save"}>
              {busy === "save" ? <Spinner /> : null}Save draft
            </Button>
            {dirty && (
              <Button variant="ghost" onClick={() => { setSubject(draft!.subject); setBody(draft!.body); }}>
                Discard changes
              </Button>
            )}
          </div>
        </div>

        {/* Delivery */}
        <div className="border-t border-line px-4 py-3">
          <SendState candidate={candidate} />
          {!locked && (
            <>
              <div className="mb-2 text-[12px]">
                <div className="text-muted">Delivers to</div>
                <div className="font-medium">{dest?.to ?? "No test recipient configured"}</div>
                {dest && <div className={cx("mt-0.5 text-[11.5px]", dest.redirected ? "text-warn" : "text-muted")}>{dest.note}</div>}
                {config.email === "resend-test" && <div className="mt-0.5 text-[11px] text-muted">Test mode: only allowlisted test addresses can receive email.</div>}
              </div>
              <Button variant="primary" className="w-full py-2" disabled={!canSend || busy === "send"} onClick={() => setConfirming(true)}>
                Confirm and send…
              </Button>
              <SendBlockers
                reasons={[
                  decision !== needed && `Record “${needed === "invite" ? "Invite" : "Reject"}” to send this ${type} email.`,
                  dirty && "Save or discard your edits first.",
                  !firstName && "Add the candidate's name first.",
                  !dest?.to && "Configure EMAIL_TEST_ALLOWLIST.",
                ]}
              />
            </>
          )}
          {msg && <p className={cx("mt-2 text-[12px]", msg.tone === "bad" ? "text-bad" : "text-good")}>{msg.text}</p>}
        </div>
      </div>

      {confirming && dest?.to && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" role="dialog" aria-modal>
          <div className="w-full max-w-lg rounded-lg border border-line bg-card shadow-xl">
            <div className="border-b border-line px-5 py-3">
              <h3 className="text-[15px] font-semibold">Send this {type} email?</h3>
              <p className="text-[12px] text-muted">Nothing is sent until you confirm. This cannot be unsent.</p>
            </div>
            <dl className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-1.5 px-5 py-3 text-[13px]">
              <dt className="text-muted">To</dt>
              <dd className="font-medium">
                {dest.to} {dest.mode === "simulated" ? <Chip tone="warn">simulated</Chip> : <Chip tone="info">test delivery</Chip>}
              </dd>
              {dest.redirected && (
                <>
                  <dt className="text-muted">Candidate</dt>
                  <dd className="text-warn">{dest.candidateAddress ?? "no address"}. Not used: not on the test allowlist</dd>
                </>
              )}
              <dt className="text-muted">Subject</dt>
              <dd>{subject}</dd>
            </dl>
            <div className="mx-5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-line bg-paper/50 px-3 py-2 font-serif text-[14px] leading-relaxed">{merged}</div>
            <div className="flex justify-end gap-2 px-5 py-3">
              <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button variant="primary" onClick={confirmSend} disabled={busy === "send"}>
                {busy === "send" ? <Spinner /> : null}Confirm and send
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SendBlockers({ reasons }: { reasons: (string | false)[] }) {
  const r = reasons.filter(Boolean) as string[];
  if (!r.length) return null;
  return (
    <ul className="mt-1.5 space-y-0.5">
      {r.map((x) => (
        <li key={x} className="text-[11.5px] text-muted">
          · {x}
        </li>
      ))}
    </ul>
  );
}

function SendState({ candidate }: { candidate: Candidate }) {
  const s = latestSend(candidate);
  if (!s) return null;
  const when = new Date(s.updated_at).toLocaleString();
  const box = "mb-3 rounded-md border px-3 py-2 text-[12px]";
  if (s.status === "sending")
    return (
      <div className={cx(box, "border-info/30 bg-info-soft text-info")}>
        <span className="flex items-center gap-1.5"><Spinner /> Sending to {s.to_address}…</span>
      </div>
    );
  if (s.status === "failed" || s.status === "bounced")
    return (
      <div className={cx(box, "border-bad/30 bg-bad-soft text-bad")}>
        {s.status === "bounced" ? "Provider reported the message was not delivered" : "Send failed"}: {s.error}. The draft is kept; confirm again to retry. A retry reuses the same
        idempotency key, so the provider will not send it twice.
      </div>
    );
  if (s.mode === "simulated")
    return (
      <div className={cx(box, "border-warn/30 bg-warn-soft text-warn")}>
        Simulated send recorded {when} for {s.to_address}. Nothing was delivered; email is not configured.
      </div>
    );
  return (
    <div className={cx(box, "border-good/30 bg-good-soft text-good")}>
      {s.status === "delivered" ? "Delivered" : "Accepted by Resend"} · {s.to_address} · {when}
      <div className="mt-0.5 font-mono text-[10.5px] opacity-80">id {s.provider_message_id}</div>
      {s.status === "accepted" && <div className="mt-0.5 text-[11px] opacity-90">Accepted means the provider took the message. Delivery is confirmed only by a delivery webhook.</div>}
    </div>
  );
}
