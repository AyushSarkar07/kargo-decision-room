import { z } from "zod";
import { handler } from "@/lib/api";
import { submitPastedText } from "@/lib/pipeline";

export const POST = handler(async (req, { id }) => {
  const { text } = z.object({ text: z.string().max(60000) }).parse(await req.json());
  const a = await submitPastedText(id, text);
  return { applicant: { id: a.id, status: a.status, warnings: a.warnings } };
});
