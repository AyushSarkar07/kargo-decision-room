"use client";
import { useState } from "react";
import { hireById, rubric, ROLES, type Role } from "@/lib/rubric";
import { Chip, cx, roleName, SectionLabel } from "./ui";

export function RubricView({ version }: { version: string }) {
  const [role, setRole] = useState<Role>("PM");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header>
        <h2 className="font-serif text-[24px]">What Kargo&apos;s best hires had in common</h2>
        <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">
          Derived from eight past hires and their latest ratings, not from the job descriptions. Five were rated Exceeds, two Meets, one Below. These are
          hypotheses from a small, mixed-role group, not proof that the rubric predicts performance. Version {version}.
        </p>
      </header>

      <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] text-warn">
        {rubric.data_gaps.slice(1).map((g) => (
          <p key={g}>{g}</p>
        ))}
      </div>

      <section className="rounded-lg border border-line bg-card">
        <div className="border-b border-line px-5 py-3">
          <SectionLabel>Past hires</SectionLabel>
          <div className="grid gap-x-6 gap-y-1 text-[12.5px] sm:grid-cols-2">
            {rubric.hires.map((h) => (
              <div key={h.id} className="flex items-center justify-between gap-2">
                <span>
                  <span className="font-medium">{h.name}</span> <span className="text-muted">· {h.role} · {h.joined}</span>
                </span>
                <Chip tone={h.rating.startsWith("Exceeds") ? "good" : h.rating.startsWith("Below") ? "bad" : "neutral"}>{h.rating}</Chip>
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y divide-line/70">
          {rubric.patterns.map((p) => (
            <details key={p.id} className="group px-5 py-3" open={p.id === "P1"}>
              <summary className="cursor-pointer list-none">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[14.5px] font-semibold">
                      <span className="mr-1.5 text-muted">{p.id}</span>
                      {p.name}
                    </div>
                    <div className="text-[12px] text-muted">{p.strength}</div>
                  </div>
                  <span className="text-muted group-open:rotate-180">▾</span>
                </div>
              </summary>
              <p className="mt-2 text-[13px] text-ink-2">{p.summary}</p>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-good">Supporting</div>
                  <ul className="space-y-1.5">
                    {p.supporting.map((s, i) => (
                      <li key={i} className="text-[12.5px]">
                        <span className="font-medium">{hireById(s.hire)!.name}</span>
                        <span className="block italic text-ink-2">&ldquo;{s.excerpt}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-bad">Counterexamples</div>
                  <ul className="space-y-1.5">
                    {p.counterexamples.map((s, i) => (
                      <li key={i} className="text-[12.5px]">
                        <span className="font-medium">{hireById(s.hire)!.name}</span> <span className="text-muted">({hireById(s.hire)!.rating})</span>
                        <span className="block text-ink-2">{s.note}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Limitations</div>
                  <ul className="space-y-1">
                    {p.limitations.map((l) => (
                      <li key={l} className="text-[12px] text-muted">· {l}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-line bg-card">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <SectionLabel>Rubric</SectionLabel>
          <div className="flex rounded-md border border-line-strong p-0.5 text-[12px]">
            {ROLES.map((r) => (
              <button key={r} onClick={() => setRole(r)} className={cx("rounded px-2.5 py-1 font-medium", role === r ? "bg-ink text-white" : "text-ink-2")}>
                {roleName(r)}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y divide-line/70">
          {rubric.criteria.map((c) => (
            <div key={c.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1.1fr]">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="tabular text-[18px] font-semibold">{c.weights[role]}%</span>
                  <span className="text-[14.5px] font-semibold">{c.name}</span>
                </div>
                <p className="mt-1 text-[12.5px] text-ink-2">{c.definition}</p>
                <p className="mt-2 text-[12px] text-muted">
                  From {c.pattern_ids.join(", ")} ·{" "}
                  {c.hire_evidence
                    .filter((e) => e.supports)
                    .map((e) => hireById(e.hire)!.name)
                    .join(", ")}
                </p>
                {role === "SPM" && <p className="mt-2 text-[12px] text-ink-2"><span className="font-medium">SPM ownership:</span> {c.spm_ownership}</p>}
                <p className="mt-2 text-[12px] text-ink-2"><span className="font-medium">Insufficient evidence:</span> {c.insufficient_evidence}</p>
              </div>
              <ol className="space-y-1 text-[12px]">
                {(["4", "3", "2", "1", "0"] as const).map((k) => (
                  <li key={k} className="grid grid-cols-[18px_1fr] gap-2">
                    <span className="tabular font-semibold text-ink-2">{k}</span>
                    <span className="text-ink-2">{c.anchors[role][k]}</span>
                  </li>
                ))}
                <li className="grid grid-cols-[18px_1fr] gap-2 text-muted">
                  <span>–</span>
                  <span>Not evidenced: {rubric.scale.not_evidenced.split(". ")[0]}.</span>
                </li>
              </ol>
            </div>
          ))}
        </div>
        <div className="border-t border-line px-5 py-2.5 text-[12px] text-muted">
          Total {rubric.criteria.reduce((s, c) => s + c.weights[role], 0)}%.
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-card px-5 py-4">
          <SectionLabel>Missing evidence policy</SectionLabel>
          <ul className="space-y-1.5 text-[12.5px] text-ink-2">
            {rubric.missing_evidence_policy.rules.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-line bg-card px-5 py-4">
          <SectionLabel>Never used as a signal</SectionLabel>
          <ul className="space-y-1.5 text-[12.5px] text-ink-2">
            {rubric.excluded_signals.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-card px-5 py-4">
        <SectionLabel>Role requirements from the job descriptions · checklist only, not scored</SectionLabel>
        <div className="grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => (
            <div key={r}>
              <div className="mb-1 text-[13px] font-semibold">{roleName(r)}</div>
              <ul className="space-y-1 text-[12.5px] text-ink-2">
                {rubric.role_requirements[r].map((q) => (
                  <li key={q}>· {q}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
