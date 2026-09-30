import { handler } from "@/lib/api";
import { reprocessApplicant } from "@/lib/pipeline";

export const maxDuration = 120;

// Re-sanitizes from the stored original and re-scores. Human decisions and sends are kept.
export const POST = handler(async (_req, { id }) => {
  const a = await reprocessApplicant(id);
  return { applicant: { id: a!.id, status: a!.status } };
});
