"use client";
import { rubric, type Role } from "@/lib/rubric";
import type { CriterionScore } from "@/lib/types";
import { cx } from "./ui";

const FILL: Record<number, string> = {
  4: "bg-ink",
  3: "bg-ink/70",
  2: "bg-ink/45",
  1: "bg-ink/20",
  0: "bg-bad/50",
};

/**
 * One segment per criterion. Width = the criterion's weight for this role, shade = score.
 * "Not evidenced" is a dashed outline so a gap never reads as a zero.
 */
export function CriterionStrip({ criteria, role, className }: { criteria: CriterionScore[]; role: Role; className?: string }) {
  return (
    <span className={cx("inline-flex h-1.5 items-stretch gap-[2px]", className)} aria-label="Criterion scores">
      {rubric.criteria.map((c) => {
        const s = criteria.find((x) => x.criterion_id === c.id);
        const score = s?.score ?? null;
        return (
          <span
            key={c.id}
            title={`${c.name}: ${score === null ? "Not evidenced" : `${score}/4`} (${c.weights[role]}%)`}
            style={{ width: `${c.weights[role] * 0.9}px` }}
            className={cx("rounded-[2px]", score === null ? "border border-dashed border-line-strong" : FILL[score])}
          />
        );
      })}
    </span>
  );
}
