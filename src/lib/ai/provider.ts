import type { ApplicantPII, Line } from "../types";
import type { Role } from "../rubric";
import type { ScoringOutput, SynthesisOutput } from "./schemas";
import type { synthesisInput } from "./prompts";

export type SynthesisArgs = Parameters<typeof synthesisInput>[0];
export type PIIGuard = Pick<ApplicantPII, "full_name" | "email" | "phone" | "links">;

export interface AIProvider {
  /** Recorded on every evaluation, brief, and draft. "simulated" is never presented as AI output. */
  id: string;
  live: boolean;
  score(lines: Line[], appliedRole: Role | null, guard: PIIGuard): Promise<ScoringOutput>;
  synthesize(args: SynthesisArgs, guard: PIIGuard): Promise<SynthesisOutput>;
}

/** Every outbound AI request is recorded here in tests so payloads can be inspected for PII. */
export const outboundLog: { system: string; input: string }[] = [];
