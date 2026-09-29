"use client";
import { useEffect, useState } from "react";
import type { CalibrationRun } from "@/lib/calibration-metrics";
import { hireById, rubric, ROLES, type Role } from "@/lib/rubric";
import { api } from "./api-client";
import { CriterionStrip } from "./CriterionStrip";
import { Button, Chip, CoverageBar, cx, SectionLabel, Spinner } from "./ui";

interface Payload {
  run: CalibrationRun | null;
  files: { hire_id: string; available: boolean }[];
}

export function CalibrationView() {
  const [data, setData] = useState<Payload | null>(null);
  const [role, setRole] = useState<Role>("PM");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<Payload>("/api/calibration").then(
      (d) => alive && setData(d),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      setData(await api<Payload>("/api/calibration", { method: "POST" }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  const missing = data?.files.filter((f) => !f.available) ?? [];
  const r = data?.run;
  const rows = r
    ? [...r.results].sort((a, b) => (b[role]?.ranking_score ?? -1) - (a[role]?.ranking_score ?? -1))
    : [];
  const c = r?.concordance[role];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-serif text-[24px]">Calibration</h2>
          <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">
            The eight past hires, scored with today&apos;s rubric through the same pipeline as applicants: personal details removed first, excerpts verified,
            totals computed by the app. If the rubric is consistent with where it came from, Exceeds hires should score above the others.
          </p>
        </div>
        <Button variant="primary" onClick={run} disabled={running || missing.length === rubric.hires.length}>
          {running ? <Spinner /> : null}
          {running ? "Scoring hires…" : r ? "Run again" : "Run calibration"}
        </Button>
      </header>

      <div className="rounded-lg border border-warn/30 bg-warn-soft px-4 py-2.5 text-[12.5px] text-warn">
        This is an in-sample check. The rubric was derived from these same eight people, so agreement shows the scorer applies the rubric the way it was
        written. It does not show that the rubric predicts how new hires will perform.
      </div>

      {missing.length > 0 && (
        <p className="rounded-md border border-line bg-card px-4 py-2.5 text-[12.5px] text-muted">
          Hire profiles not available on this server: {missing.map((m) => hireById(m.hire_id)!.name).join(", ")}. They are read from a local, private folder
          (<code>source/hires</code>) and are never uploaded or stored.
        </p>
      )}
      {error && <p className="text-[12.5px] text-bad">{error}</p>}

      {r && c && (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label={`Exceeds above others · ${role}`} value={`${c.concordant} of ${c.pairs}`} hint={c.ties ? `${c.ties} tied` : "pairs of hires"} />
            <Stat
              label="Scored by"
              value={r.scored_by === "simulated" ? "Simulated rules" : r.scored_by}
              hint={r.scored_by === "simulated" ? "Not AI. Add a Gemini key for a real check." : `Rubric ${r.rubric_version}`}
              warn={r.scored_by === "simulated"}
            />
            <Stat label="Run" value={new Date(r.created_at).toLocaleString()} hint={`${r.results.filter((x) => x.status === "scored").length} of 8 hires scored`} />
          </section>

          <section className="rounded-lg border border-line bg-card">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <SectionLabel>Hires ranked by {role} score</SectionLabel>
              <div className="flex rounded-md border border-line-strong p-0.5 text-[12px]">
                {ROLES.map((x) => (
                  <button key={x} onClick={() => setRole(x)} className={cx("rounded px-2.5 py-1 font-medium", role === x ? "bg-ink text-white" : "text-ink-2")}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <ol className="divide-y divide-line/70">
              {rows.map((row, i) => {
                const h = hireById(row.hire_id)!;
                const e = row[role];
                return (
                  <li key={row.hire_id} className="grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-3 px-5 py-2.5">
                    <span className="tabular text-[12px] text-muted">{e ? i + 1 : "–"}</span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13.5px] font-medium">{h.name}</span>
                        <span className="text-[12px] text-muted">{h.role}</span>
                        <Chip tone={h.rating.startsWith("Exceeds") ? "good" : h.rating.startsWith("Below") ? "bad" : "neutral"}>{h.rating}</Chip>
                      </span>
                      {e ? (
                        <CriterionStrip criteria={e.criteria} role={role} className="mt-1.5" />
                      ) : (
                        <span className="text-[12px] text-bad">{row.status}: {row.error}</span>
                      )}
                    </span>
                    {e && (
                      <span className="flex flex-col items-end gap-1">
                        <span className="tabular text-[15px] font-semibold">{e.ranking_score.toFixed(1)}</span>
                        <CoverageBar coverage={e.coverage} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>

          {c.discordant.length > 0 && (
            <section className="rounded-lg border border-line bg-card px-5 py-3">
              <SectionLabel>Where the rubric disagrees with the ratings · {role}</SectionLabel>
              <ul className="space-y-1 text-[12.5px] text-ink-2">
                {c.discordant.map((d) => (
                  <li key={`${d.higher}-${d.other}`}>
                    · {hireById(d.other)!.name} ({hireById(d.other)!.rating}) scored {d.otherScore.toFixed(1)}, above {hireById(d.higher)!.name} (
                    {hireById(d.higher)!.rating}) at {d.higherScore.toFixed(1)}.
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-muted">
                Each of these is worth reading before trusting the ranking: either the rubric misses something about that hire, or the rating reflects
                something a CV cannot show.
              </p>
            </section>
          )}
        </>
      )}
      {!r && !running && data && <p className="rounded-lg border border-line bg-card px-4 py-6 text-[13px] text-muted">No calibration run yet.</p>}
    </div>
  );
}

function Stat({ label, value, hint, warn }: { label: string; value: string; hint: string; warn?: boolean }) {
  return (
    <div className={cx("rounded-lg border bg-card px-4 py-3", warn ? "border-warn/30" : "border-line")}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={cx("tabular mt-0.5 text-[18px] font-semibold", warn && "text-warn")}>{value}</div>
      <div className="text-[11.5px] text-muted">{hint}</div>
    </div>
  );
}
