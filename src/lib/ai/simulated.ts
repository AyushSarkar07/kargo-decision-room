// Deterministic stand-in used when no Gemini key is configured. It is NOT AI:
// every record it produces is labelled "simulated" and the UI says so.
import { assertNoPII } from "../pii";
import { rubric, ROLES, type Role } from "../rubric";
import type { Line } from "../types";
import { SCORING_SYSTEM, SYNTHESIS_SYSTEM, scoringInput, synthesisInput } from "./prompts";
import type { ScoringOutput, SynthesisOutput } from "./schemas";
import { outboundLog, type AIProvider, type PIIGuard, type SynthesisArgs } from "./provider";

type Cue = { strong: RegExp; weak?: RegExp; negative?: RegExp };

const CUES: Record<string, Cue> = {
  frontline_ops: {
    strong: /\b(managed|handled|coordinated|processed|prepared|scheduled|planned)\b.{0,90}\b(shipments?|bills? of lading|customs|documentation|carriers?|consignments?|dispatch|warehouse|exceptions?|berth|containers?)\b/i,
    weak: /\b(integrat\w*|api|sold|selling|built)\b.{0,60}\b(logistics|freight|carriers?|3pl|shipping)\b/i,
  },
  unasked_fixes: {
    strong: /\b(built|created|wrote|introduced|designed|set up|started|redesigned)\b.{0,140}\b(adopted|became the (team'?s )?standard|now standard|used by|retained|rolled out to|standard practice)\b/i,
    weak: /\b(built|created|introduced|designed|redesigned|automated)\b/i,
  },
  owns_setbacks: {
    strong: /\b(post-?mortem|killed \d|killed (two|the)|root cause|retrospective|did not buy|shut down|rolled back|sunset(ted)?)\b/i,
    weak: /\b(incident|outage|on-call|escalation|hold|bug)\b/i,
  },
  user_outcomes: {
    strong: /\b(reduc\w*|cut|lower\w*|decreas\w*)\b.{0,80}\b(tickets|queries|churn|delays?|exceptions|complaints|support|time-to-first-value|turnaround)\b.{0,40}\d+%|\bchurn\b.{0,40}\d+%|\bzero delays\b|\bwithout (any )?(penalties|observations)\b/i,
    weak: /\b(customers?|users?|clients?)\b.{0,60}\b(improv\w*|faster|fewer|better)\b/i,
    negative: /\b(uptime|query time|pipeline|cac|mql|velocity|story points)\b/i,
  },
  independent_calls: {
    strong: /\b(sole (pm|owner|product)|independently|without a (product|pm|manager)|no (cmo|manager|product) (layer|above)|reports to (the )?(ceo|founder)|first pm|made calls)\b/i,
    weak: /\b(owned|owns|responsible for|led)\b/i,
  },
};

const CROSS_TEAM = /\b(teams|customers|clients|platform|integration|segment|cross-functional|accounts|regional)\b/i;

function excerptOf(text: string) {
  const words = text.split(" ");
  return words.slice(0, Math.min(words.length, 24)).join(" ");
}

function scoreCriterion(id: string, lines: Line[], role: Role) {
  const cue = CUES[id];
  const strong = lines.filter((l) => cue.strong.test(l.text));
  const weak = cue.weak ? lines.filter((l) => cue.weak!.test(l.text) && !strong.includes(l)) : [];
  const detailed = lines.length >= 12;
  let score: number | null;
  let used: Line[];
  if (strong.length >= 2) [score, used] = [4, strong.slice(0, 2)];
  else if (strong.length === 1) [score, used] = [3, strong];
  else if (weak.length) [score, used] = [id === "unasked_fixes" || id === "user_outcomes" ? 2 : 1, weak.slice(0, 1)];
  else if (cue.negative && lines.some((l) => cue.negative!.test(l.text))) [score, used] = [1, lines.filter((l) => cue.negative!.test(l.text)).slice(0, 1)];
  else [score, used] = [detailed && id === "frontline_ops" ? 0 : null, []];
  if (role === "SPM" && score === 4 && !used.some((l) => CROSS_TEAM.test(l.text))) score = 3;
  const name = rubric.criteria.find((c) => c.id === id)!.name;
  return {
    criterion_id: id,
    score,
    evidence: used.map((l) => ({ line_id: l.id, excerpt: excerptOf(l.text) })),
    reason:
      score === null
        ? `Simulated scoring found no text that speaks to "${name}".`
        : `Simulated keyword match for "${name}" (${strong.length} strong, ${weak.length} weak cues).`,
    uncertainty: (score === null ? "high" : strong.length ? "medium" : "high") as "medium" | "high",
  };
}

function yearsFrom(lines: Line[], re: RegExp) {
  for (const l of lines) {
    const m = l.text.match(re);
    if (m) return Number(m[1]);
  }
  return null;
}

export class SimulatedProvider implements AIProvider {
  id = "simulated";
  live = false;

  async score(lines: Line[], appliedRole: Role | null, guard: PIIGuard): Promise<ScoringOutput> {
    const input = scoringInput(lines, appliedRole);
    assertNoPII(input, guard, guard.aliases);
    if (process.env.NODE_ENV === "test") outboundLog.push({ system: SCORING_SYSTEM, input });
    const evaluations = Object.fromEntries(
      ROLES.map((role) => [
        role,
        {
          criteria: rubric.criteria.map((c) => scoreCriterion(c.id, lines, role)),
          role_requirements: rubric.role_requirements[role].map((_, i) => ({
            requirement_index: i,
            status: "unclear" as const,
            line_ids: [],
            note: "Not assessed in simulated mode.",
          })),
        },
      ]),
    ) as unknown as ScoringOutput["evaluations"];
    return {
      work_evidence: {
        summary: "Simulated summary: work history parsed without AI. Read the CV lines for detail.",
        roles: [],
        total_years_experience_estimate: yearsFrom(lines, /(\d+)\+? years/i),
        pm_years_estimate: yearsFrom(lines, /(\d+)\+? years (?:of )?(?:in )?(?:product|pm)/i),
      },
      evaluations,
      instruction_like_text_found: false,
    };
  }

  async synthesize(args: SynthesisArgs, guard: PIIGuard): Promise<SynthesisOutput> {
    const input = synthesisInput(args);
    assertNoPII(input, guard, guard.aliases);
    if (process.env.NODE_ENV === "test") outboundLog.push({ system: SYNTHESIS_SYSTEM, input });
    const brief = (role: Role): [string, string, string] => {
      const cs = args.byRole[role].criteria;
      const best = [...cs].filter((c) => c.score !== null).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
      const gap = cs.find((c) => c.score === null) ?? [...cs].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
      return [
        best
          ? `Strongest simulated signal is ${best.name.toLowerCase()} (${best.score}/4), based on "${best.evidence[0]?.excerpt ?? "the CV text"}".`
          : "No criterion has enough evidence for a simulated strength.",
        `The main gap is ${gap.name.toLowerCase()}, which is ${gap.score === null ? "not evidenced in the CV" : `only ${gap.score}/4`}.`,
        `Ask: can you walk me through a specific time that shows ${gap.name.toLowerCase()}?`,
      ];
    };
    const first: Role = args.appliedRole ?? "PM";
    const other: Role = first === "PM" ? "SPM" : "PM";
    return {
      brief_applied: brief(first),
      brief_other: brief(other),
      invite: {
        subject: "Kargo: a conversation about the role",
        body: "Hi {{first_name}},\n\nThank you for applying to Kargo. Your background stood out and I would like to talk. Would you have 30 minutes this week or next? Reply with a few times that suit you.\n\n[Simulated draft. Edit before sending.]\n\nArjun Mehta, Founder, Kargo",
      },
      rejection: {
        subject: "Your application to Kargo",
        body: "Hi {{first_name}},\n\nThank you for applying to Kargo and for the time you put into your application. We are not moving forward for this role right now. I appreciated reading about your work and wish you the best.\n\n[Simulated draft. Edit before sending.]\n\nArjun Mehta, Founder, Kargo",
      },
    };
  }
}
