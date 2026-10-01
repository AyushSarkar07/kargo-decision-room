"use client";
import type { ReactNode } from "react";
import type { StatusLabel } from "@/lib/board";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Tone = "neutral" | "accent" | "good" | "warn" | "bad" | "info";
const TONES: Record<Tone, string> = {
  neutral: "bg-paper text-ink-2 border-line",
  accent: "bg-accent-soft text-accent border-accent/25",
  good: "bg-good-soft text-good border-good/20",
  warn: "bg-warn-soft text-warn border-warn/25",
  bad: "bg-bad-soft text-bad border-bad/20",
  info: "bg-info-soft text-info border-info/20",
};

export function Chip({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[12px] font-medium leading-4 whitespace-nowrap", TONES[tone])}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<StatusLabel, Tone> = {
  Processing: "info",
  "Needs text": "warn",
  Failed: "bad",
  "Provisional top 5": "accent",
  "Needs review": "neutral",
  "In review": "info",
  "On hold": "warn",
  "Draft ready": "good",
  Sending: "info",
  Sent: "good",
  "Simulated send": "warn",
  Delivered: "good",
  "Send failed": "bad",
  "Role not stated": "warn",
};

export function StatusChip({ status }: { status: StatusLabel }) {
  return (
    <Chip tone={STATUS_TONE[status]}>
      {status === "Processing" || status === "Sending" ? <Spinner /> : null}
      {status}
    </Chip>
  );
}

export function Spinner({ className = "h-3 w-3" }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** 0–4 as filled pips; null renders as an explicit "Not evidenced" marker, never as zero. */
export function ScorePips({ score }: { score: number | null }) {
  if (score === null)
    return (
      <span className="inline-flex items-center rounded border border-dashed border-line-strong px-1.5 text-[12px] text-muted" title="Not evidenced: the CV does not say enough to judge">
        Not evidenced
      </span>
    );
  return (
    <span className="inline-flex items-center gap-[3px]" title={`${score} of 4`} aria-label={`${score} of 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={cx("h-2 w-2 rounded-full", i <= score ? (score >= 3 ? "bg-ink" : "bg-ink-2/70") : "bg-line-strong/60")} />
      ))}
      <span className="ml-1 tabular text-[12px] text-muted">{score}/4</span>
    </span>
  );
}

export function CoverageBar({ coverage, className }: { coverage: number; className?: string }) {
  const low = coverage < 60;
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)} title={`Evidence coverage ${coverage}%`}>
      <span className="relative h-1.5 w-12 overflow-hidden rounded-full bg-line">
        <span className={cx("absolute inset-y-0 left-0 rounded-full", low ? "bg-warn" : "bg-ink-2/60")} style={{ width: `${coverage}%` }} />
      </span>
      <span className={cx("tabular text-[12px]", low ? "text-warn" : "text-muted")}>{coverage}%</span>
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = "secondary",
  disabled,
  type = "button",
  className,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
}) {
  const v = {
    primary: "bg-ink text-white hover:bg-ink-2 border-ink",
    secondary: "bg-card text-ink border-line-strong hover:border-ink-2/50",
    ghost: "bg-transparent text-ink-2 border-transparent hover:bg-paper",
    danger: "bg-card text-bad border-bad/30 hover:bg-bad-soft",
  }[variant];
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx("inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45", v, className)}
    >
      {children}
    </button>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {right}
    </div>
  );
}

export const roleName = (r: "PM" | "SPM") => (r === "PM" ? "Product Manager" : "Senior Product Manager");
