"use client";
import { statusOf, TOP_N, type RoleBoard } from "@/lib/board";
import { Chip, CoverageBar, cx, StatusChip } from "./ui";
import { CriterionStrip } from "./CriterionStrip";

export function CandidateList({
  board,
  selectedId,
  onSelect,
  onUpload,
}: {
  board: RoleBoard;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpload: () => void;
}) {
  const top = board.ranked.filter((r) => r.inTopFive);
  const rest = board.ranked.filter((r) => !r.inTopFive);

  return (
    <aside className="flex flex-col gap-3 lg:sticky lg:top-3 lg:max-h-[calc(100vh-24px)] lg:overflow-y-auto">
      <div className="rounded-lg border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-[12px] font-semibold text-ink-2">Ranked for {board.role}</span>
          <span className="text-[11px] text-muted">by ranking score</span>
        </div>
        {board.ranked.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-muted">
            Nobody has applied for this role yet.{" "}
            <button onClick={onUpload} className="text-accent underline-offset-2 hover:underline">Upload CVs</button>
          </div>
        )}
        <ol>
          {top.map((r) => (
            <Row key={r.candidate.applicant.id} r={r} selected={selectedId === r.candidate.applicant.id} onSelect={onSelect} />
          ))}
        </ol>
        {rest.length > 0 && (
          <>
            <div className="flex items-center gap-2 border-y border-dashed border-line-strong bg-paper/60 px-3 py-1.5">
              <span className="text-[11px] font-medium text-muted">Below the provisional top {TOP_N} · needs review, not rejected</span>
            </div>
            <ol>
              {rest.map((r) => (
                <Row key={r.candidate.applicant.id} r={r} selected={selectedId === r.candidate.applicant.id} onSelect={onSelect} />
              ))}
            </ol>
          </>
        )}
      </div>

      {board.pending.length > 0 && (
        <div className="rounded-lg border border-line bg-card">
          <div className="border-b border-line px-3 py-2 text-[12px] font-semibold text-ink-2">Not scored yet</div>
          <ul>
            {board.pending.map((c) => (
              <li key={c.applicant.id} className="flex items-center justify-between gap-2 border-b border-line/60 px-3 py-2 last:border-0">
                <span className="truncate text-[13px]">{c.name ?? c.applicant.source_filename}</span>
                <StatusChip status={statusOf(c, false)} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {board.roleNotStated.length > 0 && (
        <div className="rounded-lg border border-warn/30 bg-card">
          <div className="border-b border-line px-3 py-2">
            <div className="text-[12px] font-semibold text-ink-2">Role not stated ({board.roleNotStated.length})</div>
            <div className="text-[11px] text-muted">Scored for both roles. Open one to choose PM or SPM; until then they are not ranked.</div>
          </div>
          <ul className="max-h-[340px] overflow-y-auto">
            {board.roleNotStated.map((x) => (
              <li key={x.candidate.applicant.id}>
                <button
                  onClick={() => onSelect(x.candidate.applicant.id)}
                  className={cx("flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left last:border-0 hover:bg-paper", selectedId === x.candidate.applicant.id && "bg-accent-soft/60")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{x.candidate.name ?? x.candidate.applicant.source_filename}</span>
                    <span className="text-[11px] text-muted">
                      {x.evaluation ? `would be #${x.wouldRank} for ${board.role}` : x.candidate.applicant.status.replace("_", " ")}
                    </span>
                  </span>
                  {x.evaluation && <span className="tabular text-[13px] font-semibold">{x.evaluation.ranking_score.toFixed(1)}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {board.crossRole.length > 0 && (
        <div className="rounded-lg border border-line bg-card">
          <div className="border-b border-line px-3 py-2">
            <div className="text-[12px] font-semibold text-ink-2">Possible cross-role fit</div>
            <div className="text-[11px] text-muted">Applied for {board.role === "PM" ? "SPM" : "PM"}; would rank here. Shown, not moved.</div>
          </div>
          <ul>
            {board.crossRole.map((x) => (
              <li key={x.candidate.applicant.id}>
                <button
                  onClick={() => onSelect(x.candidate.applicant.id)}
                  className={cx("flex w-full items-center justify-between gap-2 border-b border-line/60 px-3 py-2 text-left last:border-0 hover:bg-paper", selectedId === x.candidate.applicant.id && "bg-accent-soft/60")}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium">{x.candidate.name ?? "Name not found"}</span>
                    <span className="text-[11px] text-muted">would be #{x.wouldRank} for {board.role}</span>
                  </span>
                  <span className="tabular text-[13px] font-semibold">{x.evaluation.ranking_score.toFixed(1)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}

function Row({ r, selected, onSelect }: { r: RoleBoard["ranked"][number]; selected: boolean; onSelect: (id: string) => void }) {
  const c = r.candidate;
  return (
    <li>
      <button
        onClick={() => onSelect(c.applicant.id)}
        aria-current={selected}
        className={cx(
          "grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 border-b border-line/60 px-3 py-2 text-left last:border-0",
          selected ? "bg-accent-soft/70" : "hover:bg-paper",
        )}
      >
        <span className="tabular text-[12px] text-muted">{r.rank}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{c.name ?? "Name not found"}</span>
          <CriterionStrip criteria={r.evaluation.criteria} role={r.evaluation.role} className="mt-1" />
          <span className="mt-1 flex flex-wrap items-center gap-1">
            <StatusChip status={r.status} />
            {r.incomplete && <Chip tone="warn">Incomplete</Chip>}
            {c.applicant.is_synthetic && <Chip title="Synthetic applicant">syn</Chip>}
          </span>
        </span>
        <span className="flex flex-col items-end gap-1">
          <span className="tabular text-[15px] font-semibold">{r.evaluation.ranking_score.toFixed(1)}</span>
          <CoverageBar coverage={r.evaluation.coverage} />
        </span>
      </button>
    </li>
  );
}
