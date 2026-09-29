"use client";
import { useRef, useState } from "react";
import type { Candidate } from "@/lib/board";
import type { Role } from "@/lib/rubric";
import { api, ApiError } from "./api-client";
import { Button, Chip, cx, SectionLabel, Spinner } from "./ui";

type ItemState = "queued" | "uploading" | "scoring" | "done" | "needs_text" | "duplicate" | "failed";
interface Item {
  key: string;
  file: File;
  role: Role | "";
  state: ItemState;
  id?: string;
  existingId?: string;
  error?: string;
  warnings?: string[];
  startedAt?: number;
  ms?: number;
}

const ACCEPT = ".pdf,.docx,.txt,application/pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CONCURRENCY = 3;

export function UploadPanel({
  candidates,
  onBusyChange,
  onChanged,
  onOpen,
  demo,
}: {
  candidates: Candidate[];
  onBusyChange: (b: boolean) => void;
  onChanged: () => void;
  onOpen: (c: Candidate) => void;
  demo: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [defaultRole, setDefaultRole] = useState<Role | "">("");
  const [running, setRunning] = useState(false);
  const [batchMs, setBatchMs] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  function add(files: FileList | File[]) {
    const next: Item[] = [...files].map((f) => ({
      key: `${f.name}-${f.size}-${f.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
      file: f,
      role: defaultRole,
      state: "queued",
    }));
    setItems((xs) => [...xs, ...next]);
  }

  async function processOne(it: Item, force = false) {
    const t0 = performance.now();
    update(it.key, { state: "uploading", error: undefined, startedAt: Date.now() });
    try {
      const fd = new FormData();
      fd.append("file", it.file);
      fd.append("role", it.role);
      if (force) fd.append("force", "true");
      const { applicant } = await api<{ applicant: { id: string; status: string; warnings: string[] } }>("/api/applicants", { method: "POST", body: fd });
      if (applicant.status === "needs_text") {
        update(it.key, { state: "needs_text", id: applicant.id, warnings: applicant.warnings, ms: performance.now() - t0 });
        return;
      }
      update(it.key, { state: "scoring", id: applicant.id, warnings: applicant.warnings });
      onChanged();
      await api(`/api/applicants/${applicant.id}/score`, { method: "POST" });
      update(it.key, { state: "done", ms: performance.now() - t0 });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && e.body.existingId) {
        update(it.key, { state: "duplicate", existingId: String(e.body.existingId), error: e.message });
      } else {
        update(it.key, { state: "failed", error: (e as Error).message, ms: performance.now() - t0 });
      }
    } finally {
      onChanged();
    }
  }

  async function start() {
    const queue = items.filter((x) => x.state === "queued" && x.role);
    if (!queue.length) return;
    setRunning(true);
    onBusyChange(true);
    const t0 = performance.now();
    let i = 0;
    const worker = async () => {
      while (i < queue.length) await processOne(queue[i++]);
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setBatchMs(performance.now() - t0);
    setRunning(false);
    onBusyChange(false);
  }

  async function retryScore(id: string, key?: string) {
    if (key) update(key, { state: "scoring", error: undefined });
    try {
      await api(`/api/applicants/${id}/score`, { method: "POST" });
      if (key) update(key, { state: "done" });
    } catch (e) {
      if (key) update(key, { state: "failed", error: (e as Error).message });
    }
    onChanged();
  }

  const counts = items.reduce<Record<string, number>>((m, x) => ((m[x.state] = (m[x.state] ?? 0) + 1), m), {});
  const done = (counts.done ?? 0) + (counts.failed ?? 0) + (counts.needs_text ?? 0) + (counts.duplicate ?? 0);
  const missingRole = items.some((x) => x.state === "queued" && !x.role);
  const stuck = candidates.filter((c) => c.applicant.status === "needs_text" || c.applicant.status === "failed");

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            add(e.dataTransfer.files);
          }}
          className={cx("rounded-lg border-2 border-dashed bg-card px-6 py-8 text-center", drag ? "border-accent bg-accent-soft/40" : "border-line-strong")}
        >
          <p className="font-serif text-[18px]">Drop CVs here</p>
          <p className="mt-1 text-[12.5px] text-muted">PDF, DOCX, or TXT, up to 8 MB each. Choose the role each person applied for.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Button onClick={() => input.current?.click()}>Choose files</Button>
            <label className="flex items-center gap-1.5 text-[12.5px] text-ink-2">
              Default role for new files
              <select value={defaultRole} onChange={(e) => setDefaultRole(e.target.value as Role)} className="rounded-md border border-line-strong bg-card px-2 py-1 text-[12.5px]">
                <option value="">Choose…</option>
                <option value="PM">Product Manager</option>
                <option value="SPM">Senior Product Manager</option>
              </select>
            </label>
          </div>
          <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => e.target.files && add(e.target.files)} />
        </div>

        {items.length > 0 && (
          <div className="rounded-lg border border-line bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
              <div className="text-[12.5px] text-ink-2">
                {items.length} files · {done} finished
                {counts.done ? ` · ${counts.done} scored` : ""}
                {counts.needs_text ? ` · ${counts.needs_text} need text` : ""}
                {counts.duplicate ? ` · ${counts.duplicate} duplicate` : ""}
                {counts.failed ? ` · ${counts.failed} failed` : ""}
                {batchMs !== null && !running && <span className="text-muted"> · batch took {(batchMs / 1000).toFixed(1)}s</span>}
              </div>
              <div className="flex items-center gap-2">
                {missingRole && <span className="text-[11.5px] text-warn">Choose a role for every file</span>}
                <Button variant="ghost" disabled={running} onClick={() => setItems((xs) => xs.filter((x) => !["done", "duplicate"].includes(x.state)))}>
                  Clear finished
                </Button>
                <Button variant="primary" disabled={running || !items.some((x) => x.state === "queued" && x.role)} onClick={start}>
                  {running ? <Spinner /> : null}
                  {running ? "Processing…" : "Process files"}
                </Button>
              </div>
            </div>
            <div className="h-1 bg-line">
              <div className="h-1 bg-accent transition-all" style={{ width: `${items.length ? (done / items.length) * 100 : 0}%` }} />
            </div>
            <ul className="divide-y divide-line/70">
              {items.map((it) => (
                <li key={it.key} className="px-4 py-2.5">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{it.file.name}</span>
                      <span className="text-[11px] text-muted">
                        {(it.file.size / 1024).toFixed(0)} KB{it.ms ? ` · ${(it.ms / 1000).toFixed(1)}s` : ""}
                      </span>
                    </span>
                    <select
                      value={it.role}
                      disabled={it.state !== "queued"}
                      onChange={(e) => update(it.key, { role: e.target.value as Role })}
                      className={cx("rounded-md border bg-card px-2 py-1 text-[12px]", !it.role ? "border-warn" : "border-line-strong")}
                      aria-label={`Role for ${it.file.name}`}
                    >
                      <option value="">Role…</option>
                      <option value="PM">PM</option>
                      <option value="SPM">SPM</option>
                    </select>
                    <ItemBadge s={it.state} />
                  </div>
                  {it.error && it.state !== "duplicate" && <p className="mt-1 text-[12px] text-bad">{it.error}</p>}
                  {it.state === "failed" && it.id && (
                    <Button className="mt-1.5" onClick={() => retryScore(it.id!, it.key)}>Retry scoring</Button>
                  )}
                  {it.state === "failed" && !it.id && (
                    <Button className="mt-1.5" onClick={() => processOne(it)}>Retry upload</Button>
                  )}
                  {it.state === "duplicate" && (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-warn">
                      This exact file was already uploaded, so it was skipped.
                      <button className="underline" onClick={() => processOne(it, true)}>Upload anyway</button>
                    </div>
                  )}
                  {it.state === "needs_text" && it.id && <PasteText id={it.id} warnings={it.warnings} onDone={() => { update(it.key, { state: "scoring" }); retryScore(it.id!, it.key); }} />}
                  {it.state === "done" && it.warnings?.some((w) => /duplicate/i.test(w)) && <p className="mt-1 text-[12px] text-warn">Possible duplicate of another applicant. Check Second Look.</p>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside className="space-y-3">
        <div className="rounded-lg border border-line bg-card px-4 py-3 text-[12.5px] text-ink-2">
          <SectionLabel>What happens to each file</SectionLabel>
          <ol className="list-decimal space-y-1 pl-4">
            <li>The original is stored privately.</li>
            <li>Text is extracted. Scanned or unreadable files stop here and ask for pasted text; nothing is guessed.</li>
            <li>Name, email, phone, links, and demographic lines are separated on the server and stored with restricted access. Education is withheld.</li>
            <li>Only the anonymised work history is sent to the AI, which scores it against both the PM and SPM rubrics. Totals are computed by the app.</li>
            <li>A brief and both email drafts are prepared. Nothing is sent without you.</li>
          </ol>
          {demo && <p className="mt-2 text-warn">Demo mode: uploads are scored with simulated rules and stored in a local file.</p>}
        </div>

        {stuck.length > 0 && (
          <div className="rounded-lg border border-line bg-card px-4 py-3">
            <SectionLabel>Needs attention</SectionLabel>
            <ul className="space-y-3">
              {stuck.map((c) => (
                <li key={c.applicant.id} className="text-[12.5px]">
                  <div className="flex items-center justify-between gap-2">
                    <button className="truncate font-medium underline-offset-2 hover:underline" onClick={() => onOpen(c)}>
                      {c.name ?? c.applicant.source_filename}
                    </button>
                    <Chip tone={c.applicant.status === "failed" ? "bad" : "warn"}>{c.applicant.status === "failed" ? "Failed" : "Needs text"}</Chip>
                  </div>
                  {c.applicant.status === "failed" ? (
                    <>
                      <p className="mt-0.5 text-[11.5px] text-bad">{c.applicant.error}</p>
                      <Button className="mt-1" onClick={() => retryScore(c.applicant.id)}>Retry scoring</Button>
                    </>
                  ) : (
                    <PasteText id={c.applicant.id} warnings={c.applicant.warnings} onDone={() => retryScore(c.applicant.id)} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </div>
  );
}

function ItemBadge({ s }: { s: ItemState }) {
  const map: Record<ItemState, [string, Parameters<typeof Chip>[0]["tone"]]> = {
    queued: ["Queued", "neutral"],
    uploading: ["Reading file", "info"],
    scoring: ["Scoring", "info"],
    done: ["Scored", "good"],
    needs_text: ["Needs text", "warn"],
    duplicate: ["Duplicate", "warn"],
    failed: ["Failed", "bad"],
  };
  const [label, tone] = map[s];
  return (
    <Chip tone={tone}>
      {s === "uploading" || s === "scoring" ? <Spinner /> : null}
      {label}
    </Chip>
  );
}

function PasteText({ id, warnings, onDone }: { id: string; warnings?: string[]; onDone: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-1.5 rounded-md border border-warn/30 bg-warn-soft/50 p-2.5">
      <p className="text-[12px] text-warn">{warnings?.[0] ?? "No readable text found."} Paste the CV text below, or upload a readable copy.</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Paste the full CV text here"
        className="mt-1.5 w-full rounded-md border border-line-strong bg-card px-2 py-1.5 text-[12.5px]"
      />
      <div className="mt-1 flex items-center gap-2">
        <Button
          variant="primary"
          disabled={busy || text.trim().length < 200}
          onClick={async () => {
            setBusy(true);
            setErr(null);
            try {
              await api(`/api/applicants/${id}/text`, { method: "POST", json: { text } });
              onDone();
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Use this text
        </Button>
        {err && <span className="text-[12px] text-bad">{err}</span>}
      </div>
    </div>
  );
}
