import { z } from "zod";
import { handler } from "@/lib/api";
import { sendDraft } from "@/lib/email";

export const maxDuration = 30;

export const POST = handler(async (req, { id }) => {
  const { expected_to } = z.object({ confirm: z.literal(true), expected_to: z.string().trim().min(3).max(320) }).parse(await req.json());
  const send = await sendDraft(id, expected_to);
  return { send };
});
