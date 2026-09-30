"use client";
import { useState } from "react";
import type { Candidate, RoleBoard } from "@/lib/board";
import { rubric, hireById, otherRole, type Role } from "@/lib/rubric";
import type { CriterionScore, Evaluation, Line } from "@/lib/types";
import { api } from "./api-client";
import { Button, Chip, CoverageBar, cx, roleName, ScorePips, SectionLabel } from "./ui";

const critById = (id: string) => rubric.criteria.find((c) => c.id === id)!;

function strongest(e: Evaluation, role: Role) {
  return [...e.criteria]
    .filter((c) => c.score !== null && c.score > 0 && c.evidence.length)
    .sort((a, b) => critById(b.criterion_id).weights[role] * (b.score ?? 0) - critById(a.criterion_id).weights[role] * (a.score ?? 0))[0];
}

export function ReviewPanel({
  candidate,
  role,
  board,
  onChanged,
  onOpenOtherRole,
}: {
  candidate: Candidate;
  role: Role;
  board: RoleBoard;
  onChanged: () => void;
  onOpenOtherRole: (r: Role) => void;
}) {
  const a = candidate.applicant;
  const e = candidate.evaluations[role];
  const other = candidate.evaluations[otherRole(role)];
  const brief = candidate.briefs[role];
  const row = board.ranked.find((r) => r.candidate.applicant.id === a.id);
  const cross = board.crossRole.find((x) => x.candidate.applicant.id === a.id);
  const [open, setOpen] = useState<string | null>(null);
  const [showLines, setShowLines] = useState(false);

  if (!e) {
    return (
      <section className="rounded-lg border border-line bg-card p-5 text-sm text-muted">
        This applicant has not been scored yet ({a.status.replace("_", " ")}).
      </section>
    );
  }
  const best = strongest(e, role);
  const gaps = e.criteria.filter((c) => c.score === null);
  const shaky = e.criteria.filter((c) => c.score !== null && c.uncertainty === "high");
  const simulated = e.scored_by === "simulated";

  return (
    <section className="min-w-0 space-y-4">
      <div className="rounded-lg border border-line bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <NameLine candidate={candidate} onChanged={onChanged} />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
              <span>{a.role_confirmed === false ? "Role applied for not stated" : `Applied for ${roleName(a.applied_role)}`}</span>
              {row && <span>#{row.rank} of {board.ranked.length} for {role}</span>}
              {cross && <span className="text-accent">Viewing {role} fit · would rank #{cross.wouldRank}</span>}
              <a className="underline-offset-2 hover:underline" href={`/api/applicants/${a.id}/file`} target="_blank" rel="noreferrer">
                Open original CV
              </a>
              <span>Rubric {e.rubric_version}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {simulated && <Chip tone="warn" title="Scored by keyword rules, not AI. Do not treat as a real assessment.">Simulated scores</Chip>}
            {a.is_synthetic && <Chip>Synthetic applicant</Chip>}
            {a.injection_flags.length > 0 && <Chip tone="bad">Instruction-like text in CV</Chip>}
            {a.duplicate_of && <Chip tone="warn">Possible duplicate</Chip>}
          </div>
        </div>

        {a.role_confirmed === false && <RolePicker id={a.id} onChanged={onChanged} />}
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-[auto_1fr]">
          <div className="flex items-end gap-5">
            <div>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted">Ranking score</div>
              <div className="tabular text-[34px] font-semibold leading-none tracking-tight">{e.ranking_score.toFixed(1)}</div>
            </div>
            <div className="pb-1 text-[12px] text-ink-2">
              <div className="flex items-center gap-2">
                Evidence <CoverageBar coverage={e.coverage} />
              </div>
              <div className="mt-1 text-muted" title="What the candidate scores on the criteria we have evidence for. Reference only; not used for ranking.">
                On evidenced criteria: <span className="tabular text-ink-2">{e.evidenced_score?.toFixed(1) ?? "n/a"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-end justify-start gap-3 text-[12px] sm:justify-end">
            {other && (
              <button onClick={() => onOpenOtherRole(otherRole(role))} className="rounded-md border border-line px-2.5 py-1.5 text-left hover:bg-paper">
                <span className="text-muted">{otherRole(role)} fit </span>
                <span className="tabular font-semibold">{other.ranking_score.toFixed(1)}</span>
                <span className="text-muted"> · {other.coverage}% evidenced →</span>
              </button>
            )}
          </div>
          {e.coverage < rubric.missing_evidence_policy.incomplete_threshold && (
            <p className="rounded-md border border-warn/25 bg-warn-soft px-3 py-2 text-[12px] text-warn sm:col-span-2">
              Incomplete evidence: only {e.coverage}% of the rubric weight could be judged from this CV. Missing criteria count as zero in the ranking, so
              treat this position as provisional and use the interview to fill the gaps.
            </p>
          )}
        </div>
      </div>

      {/* Ten Minute Review */}
      <div className="rounded-lg border border-line bg-card px-5 py-4">
        <SectionLabel
          right={
            brief && (
              <span className="text-[11px] text-muted">
                Interview brief · {brief.generated_by === "simulated" ? "simulated" : brief.generated_by === "template-fallback" ? "template (AI brief failed checks)" : brief.generated_by}
              </span>
            )
          }
        >
          Ten Minute Review
        </SectionLabel>
        <div className="grid gap-3 md:grid-cols-2">
          <Question q="Why this person?">{brief?.sentences[0] ?? "No brief yet."}</Question>
          <Question q="Strongest supporting evidence">
            {best ? (
              <>
                <Quote>{best.evidence[0].excerpt}</Quote>
                <span className="mt-1 block text-[12px] text-muted">
                  {critById(best.criterion_id).name} · {best.score}/4 · line {best.evidence[0].line_id}
                </span>
              </>
            ) : (
              <span className="text-muted">No criterion has verified evidence above 0.</span>
            )}
          </Question>
          <Question q="What remains uncertain?">
            {brief?.sentences[1]}
            {(gaps.length > 0 || shaky.length > 0) && (
              <span className="mt-2 flex flex-wrap gap-1">
                {gaps.map((g) => (
                  <Chip key={g.criterion_id}>Not evidenced: {critById(g.criterion_id).name}</Chip>
                ))}
                {shaky.map((g) => (
                  <Chip key={g.criterion_id} tone="warn">Low confidence: {critById(g.criterion_id).name}</Chip>
                ))}
              </span>
            )}
          </Question>
          <Question q="What should Arjun ask next?" accent>{brief?.sentences[2] ?? "No brief yet."}</Question>
        </div>
      </div>

      {/* Score breakdown + Evidence Trail */}
      <div className="rounded-lg border border-line bg-card">
        <div className="px-5 pt-4">
          <SectionLabel right={<span className="text-[11px] text-muted">Click a criterion for its evidence trail</span>}>Score breakdown · {role}</SectionLabel>
        </div>
        <ul className="divide-y divide-line/70">
          {e.criteria.map((c) => (
            <CriterionRow
              key={c.criterion_id}
              c={c}
              role={role}
              lines={a.lines}
              flagged={a.injection_flags}
              open={open === c.criterion_id}
              onToggle={() => setOpen(open === c.criterion_id ? null : c.criterion_id)}
            />
          ))}
        </ul>
        <div className="border-t border-line px-5 py-2.5 text-[11px] text-muted">
          Ranking score = Σ weight × score ÷ 4, computed by the app. &ldquo;Not evidenced&rdquo; means the CV does not say enough to judge; it adds nothing to the
          ranking score and lowers coverage. A 0 means the CV shows the opposite.
        </div>
      </div>

      <RequirementChecklist e={e} role={role} lines={a.lines} />

      <div className="rounded-lg border border-line bg-card px-5 py-4">
        <SectionLabel
          right={
            <button className="text-[12px] text-accent underline-offset-2 hover:underline" onClick={() => setShowLines(!showLines)}>
              {showLines ? "Hide" : "Show"} sanitized CV ({a.lines.length} lines)
            </button>
          }
        >
          Work history · what the AI saw
        </SectionLabel>
        {a.work_evidence && <p className="text-[13px] text-ink-2">{a.work_evidence.summary}</p>}
        {a.work_evidence?.roles.length ? (
          <ul className="mt-2 space-y-1 text-[12px]">
            {a.work_evidence.roles.map((r, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{r.title}</span>
                <span className="text-muted">{r.organisation_type}</span>
                <span className="tabular text-muted">{r.period}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {a.redaction_summary && (
          <p className="mt-2 text-[11px] text-muted">
            Removed before any AI call: {a.redaction_summary.name_found ? "name" : "no name found"}, {a.redaction_summary.emails} email,{" "}
            {a.redaction_summary.phones} phone, {a.redaction_summary.links} links, {a.redaction_summary.demographic_lines} demographic lines,{" "}
            {a.redaction_summary.name_mentions_replaced} name mentions. Education ({a.redaction_summary.education_lines_withheld} lines) withheld so institution prestige
            cannot be scored.
          </p>
        )}
        {a.warnings.length > 0 && (
          <ul className="mt-2 space-y-1">
            {a.warnings.map((w, i) => (
              <li key={i} className="text-[12px] text-warn">
                {w}
              </li>
            ))}
          </ul>
        )}
        {showLines && (
          <ol className="mt-3 max-h-[420px] overflow-y-auto rounded-md border border-line bg-paper/60 p-3 font-mono text-[11.5px] leading-relaxed">
            {a.lines.map((l) => (
              <li key={l.id} id={`line-${a.id}-${l.id}`} className={cx("grid grid-cols-[38px_1fr] gap-2", a.injection_flags.includes(l.id) && "bg-bad-soft text-bad")}>
                <span className="text-muted">{l.id}</span>
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

function RolePicker({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = async (role: Role) => {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/applicants/${id}/role`, { method: "POST", json: { role } });
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-warn/30 bg-warn-soft/60 px-5 py-2.5 text-[12.5px] text-warn">
      <span>Neither the file nor the CV says which role this person applied for. Both scores are ready; choose one to rank them.</span>
      <span className="ml-auto flex gap-1.5">
        <Button disabled={busy} onClick={() => set("PM")}>Treat as PM applicant</Button>
        <Button disabled={busy} onClick={() => set("SPM")}>Treat as SPM applicant</Button>
      </span>
      {err && <span className="w-full text-bad">{err}</span>}
    </div>
  );
}

function NameLine({ candidate, onChanged }: { candidate: Candidate; onChanged: () => void }) {
  const [editing, setEditing] = useState(!candidate.name);
  const [value, setValue] = useState(candidate.name ?? "");
  const [err, setErr] = useState<string | null>(null);
  if (!editing)
    return (
      <h2 className="flex items-baseline gap-2 text-[22px] font-semibold tracking-tight">
        {candidate.name}
        <button className="text-[11px] font-normal text-muted underline-offset-2 hover:underline" onClick={() => setEditing(true)}>
          edit name
        </button>
      </h2>
    );
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (ev) => {
        ev.preventDefault();
        try {
          await api(`/api/applicants/${candidate.applicant.id}/pii`, { method: "PATCH", json: { full_name: value } });
          setEditing(false);
          onChanged();
        } catch (e) {
          setErr((e as Error).message);
        }
      }}
    >
      <input
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
        placeholder="Candidate's full name (not detected)"
        className="w-72 rounded-md border border-line-strong bg-card px-2 py-1 text-[15px]"
      />
      <Button type="submit" variant="primary">Save name</Button>
      <span className="text-[11px] text-muted">Stored privately. Used only in emails, never sent to the AI.</span>
      {err && <span className="text-[12px] text-bad">{err}</span>}
    </form>
  );
}

function Question({ q, children, accent }: { q: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cx("rounded-md border px-3.5 py-3", accent ? "border-accent/30 bg-accent-soft/50" : "border-line bg-paper/50")}>
      <div className={cx("mb-1 text-[12px] font-semibold", accent ? "text-accent" : "text-ink-2")}>{q}</div>
      <div className="font-serif text-[15.5px] leading-snug text-ink">{children}</div>
    </div>
  );
}

function Quote({ children }: { children: React.ReactNode }) {
  return <span className="block border-l-2 border-accent/60 pl-2.5 italic">&ldquo;{children}&rdquo;</span>;
}

function highlight(text: string, excerpt: string) {
  const i = text.toLowerCase().indexOf(excerpt.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-accent-soft px-0.5 text-ink">{text.slice(i, i + excerpt.length)}</mark>
      {text.slice(i + excerpt.length)}
    </>
  );
}

function CriterionRow({
  c,
  role,
  lines,
  flagged,
  open,
  onToggle,
}: {
  c: CriterionScore;
  role: Role;
  lines: Line[];
  flagged: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const def = critById(c.criterion_id);
  const anchor = c.score !== null ? def.anchors[role][String(c.score) as "0"] : null;
  const supporting = def.hire_evidence.filter((h) => h.supports);
  const counter = def.hire_evidence.filter((h) => !h.supports);
  return (
    <li>
      <button onClick={onToggle} aria-expanded={open} className={cx("grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5 text-left sm:grid-cols-[minmax(0,1fr)_56px_150px_70px]", open ? "bg-paper/80" : "hover:bg-paper/60")}>
        <span className="min-w-0">
          <span className="text-[13.5px] font-medium">{def.name}</span>
          <span className="block truncate text-[12px] text-muted">{c.reason}</span>
        </span>
        <span className="tabular hidden text-right text-[12px] text-muted sm:block">{def.weights[role]}%</span>
        <span className="justify-self-end sm:justify-self-start">
          <ScorePips score={c.score} />
        </span>
        <span className={cx("hidden text-right text-[11px] sm:block", c.uncertainty === "high" ? "text-warn" : "text-muted")}>{c.uncertainty} unc.</span>
      </button>
      {open && (
        <div className="grid gap-4 bg-paper/50 px-5 pb-4 pt-1 md:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">From this CV</div>
            {c.evidence.length ? (
              <ul className="space-y-2">
                {c.evidence.map((ev, i) => {
                  const idx = lines.findIndex((l) => l.id === ev.line_id);
                  const line = lines[idx];
                  return (
                    <li key={i} className="rounded-md border border-line bg-card p-2.5 text-[12.5px] leading-relaxed">
                      {idx > 0 && <div className="text-[11.5px] text-muted">{lines[idx - 1].text}</div>}
                      <div>
                        <span className="mr-1.5 font-mono text-[10.5px] text-muted">{ev.line_id}</span>
                        {line ? highlight(line.text, ev.excerpt) : ev.excerpt}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-line-strong bg-card p-2.5 text-[12.5px] text-muted">
                {c.score === null ? "No verifiable excerpt. " : "Scored on the absence of this behaviour in a detailed history. "}
                {def.insufficient_evidence}
              </p>
            )}
            <p className="mt-2 text-[12.5px] text-ink-2">
              <span className="font-medium">Reason:</span> {c.reason}
            </p>
            {anchor && (
              <p className="mt-1 text-[12.5px] text-ink-2">
                <span className="font-medium">What a {c.score} means for {role}:</span> {anchor}
              </p>
            )}
            {role === "SPM" && <p className="mt-1 text-[12px] text-muted">SPM bar: {def.spm_ownership}</p>}
            {c.evidence.some((ev) => flagged.includes(ev.line_id)) && <p className="mt-1 text-[12px] text-bad">Cites a flagged line.</p>}
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Why this criterion exists · past hires</div>
            <p className="mb-2 text-[12.5px] text-ink-2">{def.definition}</p>
            <ul className="space-y-1.5">
              {supporting.slice(0, 3).map((h, i) => {
                const hire = hireById(h.hire)!;
                return (
                  <li key={i} className="text-[12px] leading-snug">
                    <span className="font-medium">{hire.name}</span> <span className="text-muted">({hire.role}, {hire.rating})</span>
                    <span className="block italic text-ink-2">&ldquo;{h.excerpt}&rdquo;</span>
                  </li>
                );
              })}
              {counter.slice(0, 2).map((h, i) => {
                const hire = hireById(h.hire)!;
                return (
                  <li key={`c${i}`} className="text-[12px] leading-snug">
                    <span className="font-medium">{hire.name}</span> <span className="text-muted">({hire.rating}, counterexample)</span>
                    <span className="block text-muted">{h.note}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

function RequirementChecklist({ e, role, lines }: { e: Evaluation; role: Role; lines: Line[] }) {
  const [open, setOpen] = useState(false);
  const reqs = rubric.role_requirements[role];
  const met = e.role_requirements.filter((r) => r.status === "met").length;
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-3">
      <button className="flex w-full items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">Job description checklist · not scored</span>
        <span className="text-[12px] text-muted">
          {met} of {reqs.length} clearly met {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {reqs.map((q, i) => {
            const r = e.role_requirements.find((x) => x.requirement_index === i);
            const tone = r?.status === "met" ? "good" : r?.status === "not_met" ? "bad" : "neutral";
            return (
              <li key={i} className="grid grid-cols-[88px_1fr] gap-2 text-[12.5px]">
                <span>
                  <Chip tone={tone}>{r?.status.replace("_", " ") ?? "unclear"}</Chip>
                </span>
                <span>
                  {q}
                  {r?.note && <span className="block text-[11.5px] text-muted">{r.note}</span>}
                  {r?.line_ids.length ? (
                    <span className="block text-[11px] text-muted">
                      {r.line_ids.map((id) => lines.find((l) => l.id === id)?.text).filter(Boolean).join(" · ").slice(0, 200)}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
