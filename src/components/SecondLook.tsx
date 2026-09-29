"use client";
import type { Candidate, SecondLookItem } from "@/lib/board";
import type { Role } from "@/lib/rubric";
import { Chip, CoverageBar, SectionLabel } from "./ui";

export function SecondLookView({ items, onOpen }: { items: SecondLookItem[]; onOpen: (c: Candidate, r?: Role) => void }) {
  return (
    <section className="mx-auto max-w-4xl">
      <div className="mb-3">
        <h2 className="font-serif text-[22px]">Second Look</h2>
        <p className="text-[13px] text-muted">
          People who could disappear below the shortlist for reasons other than a weak record: thin or unreadable CVs, very different PM and SPM results, or
          strong evidence with many gaps. Worth a minute each.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-line bg-card px-4 py-6 text-[13px] text-muted">Nobody needs a second look right now.</p>
      ) : (
        <ul className="divide-y divide-line/70 rounded-lg border border-line bg-card">
          {items.map(({ candidate: c, reasons }) => {
            const own = c.evaluations[c.applicant.applied_role];
            return (
              <li key={c.applicant.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium">{c.name ?? c.applicant.source_filename}</span>
                    <Chip>applied {c.applicant.applied_role}</Chip>
                    {c.applicant.is_synthetic && <Chip>synthetic</Chip>}
                  </div>
                  <ul className="mt-1 space-y-0.5">
                    {reasons.map((r) => (
                      <li key={r} className="text-[12.5px] text-ink-2">· {r}</li>
                    ))}
                  </ul>
                </div>
                <div className="flex items-center gap-3 sm:flex-col sm:items-end">
                  {own && (
                    <div className="text-right text-[12px]">
                      <div className="tabular">
                        PM <b>{c.evaluations.PM?.ranking_score.toFixed(1)}</b> · SPM <b>{c.evaluations.SPM?.ranking_score.toFixed(1)}</b>
                      </div>
                      <CoverageBar coverage={own.coverage} />
                    </div>
                  )}
                  <div className="flex gap-2 text-[12px]">
                    {c.evaluations.PM && <button className="text-accent underline-offset-2 hover:underline" onClick={() => onOpen(c, "PM")}>Open PM view</button>}
                    {c.evaluations.SPM && <button className="text-accent underline-offset-2 hover:underline" onClick={() => onOpen(c, "SPM")}>Open SPM view</button>}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-4 rounded-lg border border-line bg-card px-4 py-3">
        <SectionLabel>Listed when</SectionLabel>
        <ul className="text-[12.5px] text-ink-2">
          <li>· Evidence coverage is under 60% for the role applied for</li>
          <li>· PM and SPM ranking scores differ by 15 points or more</li>
          <li>· The score on evidenced criteria is 20+ points above the ranking score</li>
          <li>· The CV contains instruction-like text, could not be read, failed, or may be a duplicate</li>
        </ul>
      </div>
    </section>
  );
}
