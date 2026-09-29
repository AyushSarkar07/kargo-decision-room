import { z } from "zod";
import { rubric } from "../rubric";

const criterionIds = rubric.criteria.map((c) => c.id) as [string, ...string[]];

export const CriterionOut = z.object({
  criterion_id: z.enum(criterionIds),
  score: z.number().int().min(0).max(4).nullable(),
  evidence: z.array(z.object({ line_id: z.string(), excerpt: z.string() })).max(3),
  reason: z.string().min(1).max(400),
  uncertainty: z.enum(["low", "medium", "high"]),
});

const RoleEvalOut = z.object({
  criteria: z.array(CriterionOut),
  role_requirements: z.array(
    z.object({
      requirement_index: z.number().int().min(0),
      status: z.enum(["met", "unclear", "not_met"]),
      line_ids: z.array(z.string()).max(4),
      note: z.string().max(240),
    }),
  ),
});

export const ScoringOut = z.object({
  work_evidence: z.object({
    summary: z.string().max(500),
    roles: z
      .array(
        z.object({
          title: z.string(),
          organisation_type: z.string(),
          period: z.string(),
          line_ids: z.array(z.string()),
        }),
      )
      .max(12),
    total_years_experience_estimate: z.number().nullable(),
    pm_years_estimate: z.number().nullable(),
  }),
  evaluations: z.object({ PM: RoleEvalOut, SPM: RoleEvalOut }),
  instruction_like_text_found: z.boolean(),
});
export type ScoringOutput = z.infer<typeof ScoringOut>;

const Email = z.object({ subject: z.string().min(3).max(140), body: z.string().min(40).max(2500) });

export const SynthesisOut = z.object({
  brief_applied: z.array(z.string().min(10).max(320)).length(3),
  brief_other: z.array(z.string().min(10).max(320)).length(3),
  invite: Email,
  rejection: Email,
});
export type SynthesisOutput = z.infer<typeof SynthesisOut>;

export const scoringJsonSchema = z.toJSONSchema(ScoringOut, { target: "draft-2020-12" });
export const synthesisJsonSchema = z.toJSONSchema(SynthesisOut, { target: "draft-2020-12" });
