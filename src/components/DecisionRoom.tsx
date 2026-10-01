"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildRoleBoard, secondLook, type Candidate } from "@/lib/board";
import type { Role } from "@/lib/rubric";
import { api, type AppState } from "./api-client";
import { CandidateList } from "./CandidateList";
import { ReviewPanel } from "./ReviewPanel";
import { EmailPanel } from "./EmailPanel";
import { UploadPanel } from "./UploadPanel";
import { SecondLookView } from "./SecondLook";
import { RubricView } from "./RubricView";
import { SentLog } from "./SentLog";
import { CalibrationView } from "./CalibrationView";
import { Chip, cx, Spinner } from "./ui";

type Tab = Role | "second" | "upload" | "rubric" | "calibration" | "log";

export function DecisionRoom() {
  const [state, setState] = useState<AppState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("PM");
  const [selected, setSelected] = useState<Record<Role, string | null>>({ PM: null, SPM: null });
  const [uploading, setUploading] = useState(false);
  const [showSynthetic, setShowSynthetic] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setState(await api<AppState>("/api/state"));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    api<AppState>("/api/state").then(
      (s) => alive && setState(s),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);

  const candidates = useMemo(
    () => (state?.candidates ?? []).filter((c) => showSynthetic || !c.applicant.is_synthetic),
    [state, showSynthetic],
  );
  const boards = useMemo(() => ({ PM: buildRoleBoard("PM", candidates), SPM: buildRoleBoard("SPM", candidates) }), [candidates]);
  const second = useMemo(() => secondLook(candidates, [boards.PM, boards.SPM]), [candidates, boards]);
  const busy = candidates.some((c) => ["extracting", "scoring", "ready_to_score"].includes(c.applicant.status)) || uploading;

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [busy, refresh]);

  const openCandidate = (c: Candidate, role?: Role) => {
    const r = role ?? c.applicant.applied_role;
    setSelected((s) => ({ ...s, [r]: c.applicant.id }));
    setTab(r);
  };

  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        {error ? <span className="text-bad">{error}</span> : <Spinner className="h-5 w-5" />}
      </div>
    );
  }

  const role: Role | null = tab === "PM" || tab === "SPM" ? tab : null;
  const board = role ? boards[role] : null;
  const selId = role ? selected[role] ?? board?.ranked[0]?.candidate.applicant.id ?? null : null;
  const selCandidate = selId ? candidates.find((c) => c.applicant.id === selId) ?? null : null;
  const synthCount = (state.candidates ?? []).filter((c) => c.applicant.is_synthetic).length;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "PM", label: "Product Manager", count: boards.PM.ranked.length },
    { id: "SPM", label: "Senior PM", count: boards.SPM.ranked.length },
    { id: "second", label: "Second Look", count: second.length },
    { id: "upload", label: "Upload" },
    { id: "rubric", label: "Rubric" },
    { id: "calibration", label: "Calibration" },
    { id: "log", label: "Sent log", count: candidates.reduce((n, c) => n + c.sends.length, 0) },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-semibold tracking-tight">Kargo</span>
            <span className="text-line-strong">|</span>
            <span className="font-serif text-[17px] italic text-ink-2">The Decision Room</span>
          </div>
          <ModeBar state={state} />
          <div className="ml-auto flex items-center gap-3 text-[12px] text-muted">
            {synthCount > 0 && (
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={showSynthetic} onChange={(e) => setShowSynthetic(e.target.checked)} className="accent-accent" />
                Show synthetic ({synthCount})
              </label>
            )}
            {state.session.open ? (
              <Chip tone="warn" title="No sign-in: anyone with the link can view and act. Fictional data only.">Open access</Chip>
            ) : (
              <span>{state.session.demo ? "Demo session" : state.session.email}</span>
            )}
            {!state.session.demo && !state.session.open && (
              <form action="/auth/signout" method="post">
                <button className="underline-offset-2 hover:underline">Sign out</button>
              </form>
            )}
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                "relative -mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium",
                tab === t.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="tabular rounded bg-paper px-1.5 text-[11px] text-muted">{t.count}</span>}
            </button>
          ))}
        </nav>
      </header>

      {state.config.problems.length > 0 && (
        <div className="mx-auto mt-3 w-full max-w-[1500px] px-4 sm:px-6">
          <div className="rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-[12px] text-warn">{state.config.problems.join(" ")}</div>
        </div>
      )}
      {error && (
        <div className="mx-auto mt-3 w-full max-w-[1500px] px-4 sm:px-6">
          <div className="rounded-md border border-bad/30 bg-bad-soft px-3 py-2 text-[12px] text-bad">{error}</div>
        </div>
      )}

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-4 sm:px-6">
        {role && board && (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_370px]">
            <CandidateList board={board} selectedId={selId} onSelect={(id) => setSelected((s) => ({ ...s, [role]: id }))} onUpload={() => setTab("upload")} />
            {selCandidate ? (
              <>
                <ReviewPanel key={`${selCandidate.applicant.id}-${role}`} candidate={selCandidate} role={role} board={board} onChanged={refresh} onOpenOtherRole={(r) => openCandidate(selCandidate, r)} />
                <div className="lg:col-start-2 xl:col-start-auto">
                  <EmailPanel key={`${selCandidate.applicant.id}-email`} candidate={selCandidate} board={boards[selCandidate.applicant.applied_role]} config={state.config} onChanged={refresh} />
                </div>
              </>
            ) : (
              <EmptyReview onUpload={() => setTab("upload")} demo={state.session.demo} onSeeded={refresh} />
            )}
          </div>
        )}
        {tab === "second" && <SecondLookView items={second} onOpen={openCandidate} />}
        {tab === "upload" && (
          <UploadPanel candidates={candidates} onBusyChange={setUploading} onChanged={refresh} onOpen={openCandidate} demo={state.session.demo} />
        )}
        {tab === "rubric" && <RubricView version={state.rubricVersion} />}
        {tab === "calibration" && <CalibrationView />}
        {tab === "log" && <SentLog candidates={candidates} />}
      </main>
    </div>
  );
}

function ModeBar({ state }: { state: AppState }) {
  const c = state.config;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {c.data === "local-demo" ? (
        <Chip tone="warn" title="Records are stored in a local file on this machine. Synthetic applicants are labelled.">Demo mode · local data</Chip>
      ) : (
        <Chip tone="good" title="Supabase with row-level security">Live database</Chip>
      )}
      {c.ai === "gemini" ? (
        <Chip tone="good" title="Structured, validated Gemini responses">AI: {c.geminiModel}</Chip>
      ) : (
        <Chip tone="warn" title="No Gemini key. Scores come from transparent keyword rules and are labelled Simulated.">AI: simulated</Chip>
      )}
      {c.email === "resend-test" ? (
        <Chip tone="info" title={`Test delivery only. Allowed: ${c.testAllowlist.join(", ")}`}>Email: Resend test mode</Chip>
      ) : (
        <Chip tone="warn" title="Nothing is sent. Sends are recorded as simulated.">Email: simulated</Chip>
      )}
    </div>
  );
}

function EmptyReview({ onUpload, demo, onSeeded }: { onUpload: () => void; demo: boolean; onSeeded: () => void }) {
  const [seeding, setSeeding] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="rounded-lg border border-dashed border-line-strong bg-card p-8 text-sm text-ink-2">
      <p className="font-serif text-lg text-ink">No scored applicants for this role yet.</p>
      <p className="mt-1 text-muted">Upload CVs and choose the role each person applied for. Each CV is scored against both rubrics.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onUpload} className="rounded-md bg-ink px-3 py-1.5 text-[13px] font-medium text-white">Upload CVs</button>
        {demo && (
          <button
            disabled={seeding}
            onClick={async () => {
              setSeeding(true);
              try {
                const r = await api<{ results: { status: string }[] }>("/api/demo/seed", { method: "POST", json: {} });
                setMsg(`Loaded ${r.results.length} synthetic applicants.`);
                onSeeded();
              } catch (e) {
                setMsg((e as Error).message);
              } finally {
                setSeeding(false);
              }
            }}
            className="rounded-md border border-line-strong bg-card px-3 py-1.5 text-[13px] font-medium"
          >
            {seeding ? "Loading…" : "Load synthetic demo applicants"}
          </button>
        )}
      </div>
      {msg && <p className="mt-2 text-[12px] text-muted">{msg}</p>}
    </div>
  );
}
