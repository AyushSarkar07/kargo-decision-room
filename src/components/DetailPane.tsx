"use client";
import { useState } from "react";
import { statusOf, type Candidate, type RoleBoard } from "@/lib/board";
import type { PublicConfig } from "@/lib/config";
import type { Role } from "@/lib/rubric";
import { EmailPanel } from "./EmailPanel";
import { ReviewPanel } from "./ReviewPanel";
import { api } from "./api-client";
import { cx, roleName, StatusChip } from "./ui";

type View = "overview" | "evidence" | "decide";

/** Right half: one candidate at a time, split into three calm views instead of one long page. */
export function DetailPane({
  candidate,
  role,
  board,
  appliedBoard,
  config,
  onClose,
  onChanged,
  onOpenOtherRole,
}: {
  candidate: Candidate;
  role: Role;
  board: RoleBoard;
  appliedBoard: RoleBoard;
  config: PublicConfig;
  onClose: () => void;
  onChanged: () => void;
  onOpenOtherRole: (r: Role) => void;
}) {
  const [view, setView] = useState<View>("overview");
  const row = board.ranked.find((r) => r.candidate.applicant.id === candidate.applicant.id);
  const views: { id: View; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "evidence", label: "Evidence" },
    { id: "decide", label: "Decide & email" },
  ];
  return (
    <section className="min-w-0 rounded-xl border border-line-strong bg-card shadow-[0_2px_12px_rgba(20,33,61,0.06)]">
      <div className="sticky top-0 z-10 rounded-t-xl border-b border-line bg-card/95 px-5 pt-4 backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <button onClick={onClose} className="mb-1 text-[14px] font-medium text-muted hover:text-ink">
              ← All {role === "PM" ? "Product Manager" : "Senior PM"} candidates
            </button>
            <h2 className="truncate text-[26px] font-semibold leading-tight tracking-tight">
              {candidate.name ?? candidate.applicant.source_filename}
              {candidate.name && <EditName candidate={candidate} onChanged={onChanged} />}
            </h2>
            <p className="mt-0.5 text-[14px] text-muted">
              {candidate.applicant.role_confirmed === false ? "Role applied for not stated" : `Applied for ${roleName(candidate.applicant.applied_role)}`}
              {row && ` · #${row.rank} of ${board.ranked.length} for ${role}`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusChip status={statusOf(candidate, row?.inTopFive ?? false)} />
            <button onClick={onClose} aria-label="Close" className="rounded-md px-2 text-[22px] leading-none text-muted hover:bg-paper hover:text-ink">
              ×
            </button>
          </div>
        </div>
        <nav className="mt-3 flex gap-1" aria-label="Candidate sections">
          {views.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              aria-current={view === v.id}
              className={cx(
                "-mb-px border-b-[3px] px-3 py-2 text-[15px] font-semibold transition-colors",
                view === v.id ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink",
              )}
            >
              {v.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="p-5">
        {view === "decide" ? (
          <EmailPanel key={`${candidate.applicant.id}-email`} candidate={candidate} board={appliedBoard} config={config} onChanged={onChanged} />
        ) : (
          <ReviewPanel
            key={`${candidate.applicant.id}-${role}-${view}`}
            candidate={candidate}
            role={role}
            board={board}
            view={view}
            onChanged={onChanged}
            onOpenOtherRole={onOpenOtherRole}
          />
        )}
        {view === "overview" && (
          <div className="mt-4 flex justify-end">
            <button onClick={() => setView("decide")} className="rounded-lg bg-ink px-4 py-2 text-[15px] font-semibold text-white hover:bg-ink-2">
              Decide &amp; email →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function EditName({ candidate, onChanged }: { candidate: Candidate; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      className="ml-2 align-middle text-[13px] font-normal text-muted underline-offset-2 hover:underline"
      onClick={async () => {
        const next = window.prompt("Candidate's full name (kept private; removed before any AI call)", candidate.name ?? "");
        if (!next || next.trim() === candidate.name) return;
        setBusy(true);
        try {
          await api(`/api/applicants/${candidate.applicant.id}/pii`, { method: "PATCH", json: { full_name: next.trim() } });
          onChanged();
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "saving…" : "edit name"}
    </button>
  );
}
