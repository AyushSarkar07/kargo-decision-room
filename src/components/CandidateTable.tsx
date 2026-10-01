"use client";
import { useState } from "react";
import { statusOf, TOP_N, type Candidate, type RoleBoard } from "@/lib/board";
import { otherRole } from "@/lib/rubric";
import type { Evaluation } from "@/lib/types";
import { CriterionStrip } from "./CriterionStrip";
import { Chip, CoverageBar, cx, StatusChip } from "./ui";

/** Full-width shortlist shown when nobody is selected: one calm, scannable table per group. */
export function CandidateTable({ board, onSelect, onUpload }: { board: RoleBoard; onSelect: (id: string) => void; onUpload: () => void }) {
  const top = board.ranked.filter((r) => r.inTopFive);
  const rest = board.ranked.filter((r) => !r.inTopFive);
  const [showUnassigned, setShowUnassigned] = useState(false);

  if (!board.ranked.length && !board.roleNotStated.length && !board.pending.length) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong bg-card p-10 text-center">
        <p className="font-serif text-[22px]">No applicants for this role yet.</p>
        <button onClick={onUpload} className="mt-4 rounded-lg bg-accent px-4 py-2 text-[15px] font-semibold text-white">Upload CVs</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Group title={`Provisional top ${TOP_N}`} hint="Recommended for a first call. Nothing is decided until you choose.">
        {top.map((r) => (
          <Row key={r.candidate.applicant.id} rank={r.rank} c={r.candidate} e={r.evaluation} role={board.role} status={statusOf(r.candidate, true)} incomplete={r.incomplete} onSelect={onSelect} highlight />
        ))}
      </Group>

      {rest.length > 0 && (
        <Group title="Needs review" hint="Below the top five. Not rejected.">
          {rest.map((r) => (
            <Row key={r.candidate.applicant.id} rank={r.rank} c={r.candidate} e={r.evaluation} role={board.role} status={statusOf(r.candidate, false)} incomplete={r.incomplete} onSelect={onSelect} />
          ))}
        </Group>
      )}

      {board.crossRole.length > 0 && (
        <Group title={`Applied for ${otherRole(board.role)}, strong here too`} hint={`Would rank in the ${board.role} top five. Shown, not moved.`}>
          {board.crossRole.map((x) => (
            <Row key={x.candidate.applicant.id} rank={null} c={x.candidate} e={x.evaluation} role={board.role} status={statusOf(x.candidate, false)} note={`would be #${x.wouldRank}`} onSelect={onSelect} />
          ))}
        </Group>
      )}

      {board.roleNotStated.length > 0 && (
        <Group
          title={`Role not stated (${board.roleNotStated.length})`}
          hint="Scored for both roles. Open one and choose PM or SPM to rank them."
          action={
            <button onClick={() => setShowUnassigned(!showUnassigned)} className="text-[14px] font-medium text-accent underline-offset-2 hover:underline">
              {showUnassigned ? "Hide" : "Show all"}
            </button>
          }
        >
          {(showUnassigned ? board.roleNotStated : board.roleNotStated.filter((x) => x.wouldRank !== null && x.wouldRank <= TOP_N)).map((x) => (
            <Row
              key={x.candidate.applicant.id}
              rank={null}
              c={x.candidate}
              e={x.evaluation}
              role={board.role}
              status={statusOf(x.candidate, false)}
              note={x.wouldRank ? `would be #${x.wouldRank}` : undefined}
              onSelect={onSelect}
            />
          ))}
          {!showUnassigned && !board.roleNotStated.some((x) => x.wouldRank !== null && x.wouldRank <= TOP_N) && (
            <li className="px-5 py-3 text-[14px] text-muted">None of them would make the {board.role} top five. Use “Show all” to review them.</li>
          )}
        </Group>
      )}

      {board.pending.length > 0 && (
        <Group title="Not scored yet">
          {board.pending.map((c) => (
            <li key={c.applicant.id} className="flex items-center justify-between px-5 py-3">
              <span className="text-[15px] font-medium">{c.name ?? c.applicant.source_filename}</span>
              <StatusChip status={statusOf(c, false)} />
            </li>
          ))}
        </Group>
      )}
    </div>
  );
}

function Group({ title, hint, action, children }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-card shadow-[0_1px_2px_rgba(20,33,61,0.04)]">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line bg-paper/60 px-5 py-3">
        <div>
          <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
          {hint && <p className="text-[13px] text-muted">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="hidden grid-cols-[48px_minmax(0,1.6fr)_140px_110px_120px_minmax(0,1fr)] gap-4 border-b border-line px-5 py-2 text-[12px] font-semibold uppercase tracking-wide text-muted md:grid">
        <span>Rank</span>
        <span>Candidate</span>
        <span>Score</span>
        <span>Evidence</span>
        <span>Other role</span>
        <span>Status</span>
      </div>
      <ul className="divide-y divide-line">{children}</ul>
    </section>
  );
}

function Row({
  rank,
  c,
  e,
  role,
  status,
  incomplete,
  note,
  highlight,
  onSelect,
}: {
  rank: number | null;
  c: Candidate;
  e: Evaluation | null;
  role: "PM" | "SPM";
  status: ReturnType<typeof statusOf>;
  incomplete?: boolean;
  note?: string;
  highlight?: boolean;
  onSelect: (id: string) => void;
}) {
  const other = c.evaluations[otherRole(role)];
  return (
    <li>
      <button
        onClick={() => onSelect(c.applicant.id)}
        className={cx(
          "grid w-full grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-accent-soft/50 md:grid-cols-[48px_minmax(0,1.6fr)_140px_110px_120px_minmax(0,1fr)]",
          highlight && "bg-card",
        )}
      >
        <span className={cx("tabular text-[18px] font-semibold", rank && rank <= TOP_N ? "text-accent" : "text-muted")}>{rank ?? "–"}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[16px] font-semibold text-ink">{c.name ?? c.applicant.source_filename}</span>
            {c.applicant.is_synthetic && <Chip>synthetic</Chip>}
            {incomplete && <Chip tone="warn">Incomplete evidence</Chip>}
          </span>
          {e && <CriterionStrip criteria={e.criteria} role={role} className="mt-2" />}
          {note && <span className="mt-1 block text-[13px] text-muted">{note}</span>}
        </span>
        <span className="tabular text-right text-[24px] font-semibold leading-none md:text-left">{e ? e.ranking_score.toFixed(1) : "–"}</span>
        <span className="hidden md:block">{e && <CoverageBar coverage={e.coverage} />}</span>
        <span className="tabular hidden text-[14px] text-ink-2 md:block">
          {other ? (
            <>
              {otherRole(role)} <b>{other.ranking_score.toFixed(1)}</b>
            </>
          ) : (
            "–"
          )}
        </span>
        <span className="hidden md:block">
          <StatusChip status={status} />
        </span>
      </button>
    </li>
  );
}
