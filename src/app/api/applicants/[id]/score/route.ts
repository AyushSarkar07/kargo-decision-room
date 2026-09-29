import { handler } from "@/lib/api";
import { scoreApplicant } from "@/lib/pipeline";

export const maxDuration = 120;

export const POST = handler(async (_req, { id }) => {
  const a = await scoreApplicant(id);
  return { applicant: { id: a!.id, status: a!.status } };
});
