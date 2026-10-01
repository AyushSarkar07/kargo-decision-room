"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { buildRoleBoard, secondLook, type Candidate } from "@/lib/board";
import type { Role } from "@/lib/rubric";
import { api, type AppState } from "./api-client";
import { CandidateList } from "./CandidateList";
import { CandidateTable } from "./CandidateTable";
import { DetailPane } from "./DetailPane";
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
  // Nobody is pre-selected: the full list comes first, a profile opens only when clicked.
  const selId = role ? selected[role] : null;
  const selCandidate = selId ? candidates.find((c) => c.applicant.id === selId) ?? null : null;
  const synthCount = (state.candidates ?? []).filter((c) => c.applicant.is_synthetic).length;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "PM", label: "Product Manager", count: boards.PM.ranked.length },
    { id: "SPM", label: "Senior PM", count: boards.SPM.ranked.length },
    { id: "second", label: "Second Look", count: second.length },
    { id: "log", label: "Sent log", count: candidates.reduce((n, c) => n + c.sends.length, 0) },
  ];
  const reference: { id: Tab; label: string }[] = [
    { id: "rubric", label: "Rubric" },
    { id: "calibration", label: "Calibration" },
  ];
  const unassigned = boards.PM.roleNotStated.length;
  const titles: Record<Tab, [string, string]> = {
    PM: ["Product Manager shortlist", `${boards.PM.ranked.length} ranked · top five are a recommendation, not a decision${unassigned ? ` · ${unassigned} with no stated role below` : ""}`],
    SPM: ["Senior Product Manager shortlist", `${boards.SPM.ranked.length} ranked · top five are a recommendation, not a decision${unassigned ? ` · ${unassigned} with no stated role below` : ""}`],
    second: ["Second Look", "People who could be missed for reasons other than a weak record"],
    upload: ["Upload CVs", "PDF, DOCX or TXT · choose the role each person applied for"],
    rubric: ["Rubric", "Where the scoring comes from: Kargo's past hires"],
    calibration: ["Calibration", "The past hires scored with today's rubric"],
    log: ["Sent log", "Every email attempt and where it went"],
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line-strong bg-card">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <div className="flex items-baseline gap-2">
            <span className="text-[19px] font-bold tracking-tight">Kargo</span>
            <span className="text-line-strong">|</span>
            <span className="font-serif text-[21px] italic text-ink-2">The Decision Room</span>
          </div>
          <ModeBar state={state} />
          <div className="ml-auto flex items-center gap-4 text-[13px] text-muted">
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
            <button
              onClick={() => setTab("upload")}
              className={cx(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[15px] font-semibold text-white shadow-sm transition-colors",
                tab === "upload" ? "bg-ink" : "bg-accent hover:bg-[#b85a17]",
              )}
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
                <path d="M10 3a1 1 0 0 1 .7.3l4 4a1 1 0 1 1-1.4 1.4L11 6.4V13a1 1 0 1 1-2 0V6.4L6.7 8.7a1 1 0 0 1-1.4-1.4l4-4A1 1 0 0 1 10 3Zm-6 12a1 1 0 0 1 1 1h10a1 1 0 1 1 2 0 2 2 0 0 1-2 2H5a2 2 0 0 1-2-2 1 1 0 0 1 1-1Z" />
              </svg>
              Upload CVs
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-[1500px] items-center gap-2 overflow-x-auto px-4 pb-3 sm:px-6" aria-label="Sections">
          <div className="flex gap-1 rounded-xl bg-paper p-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-[15px] font-semibold transition-colors",
                  tab === t.id ? "bg-ink text-white shadow-sm" : "text-ink-2 hover:bg-card hover:text-ink",
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className={cx("tabular rounded-md px-1.5 text-[13px]", tab === t.id ? "bg-white/20 text-white" : "bg-card text-muted")}>{t.count}</span>
                )}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-1">
            {reference.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cx(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-[14px] font-medium",
                  tab === t.id ? "bg-ink text-white" : "text-muted hover:bg-paper hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
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

      <main className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 sm:px-6">
        <div className="mb-5">
          <h1 className="font-serif text-[30px] leading-tight text-ink">{titles[tab][0]}</h1>
          <p className="mt-1 text-[15px] text-muted">{titles[tab][1]}</p>
        </div>
        {role && board && !selCandidate && (
          <CandidateTable board={board} onSelect={(id) => setSelected((s) => ({ ...s, [role]: id }))} onUpload={() => setTab("upload")} />
        )}
        {role && board && selCandidate && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(320px,2fr)_minmax(0,3fr)]">
            <div className="hidden lg:block">
              <CandidateList board={board} selectedId={selId} onSelect={(id) => setSelected((s) => ({ ...s, [role]: id }))} onUpload={() => setTab("upload")} />
            </div>
            <DetailPane
              key={selCandidate.applicant.id}
              candidate={selCandidate}
              role={role}
              board={board}
              appliedBoard={boards[selCandidate.applicant.applied_role]}
              config={state.config}
              onClose={() => setSelected((s) => ({ ...s, [role]: null }))}
              onChanged={refresh}
              onOpenOtherRole={(r) => openCandidate(selCandidate, r)}
            />
          </div>
        )}
        {role && board && !board.ranked.length && !board.roleNotStated.length && state.session.demo && (
          <EmptyReview onUpload={() => setTab("upload")} demo={state.session.demo} onSeeded={refresh} />
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
