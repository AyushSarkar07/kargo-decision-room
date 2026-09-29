import { z } from "zod";
import { handler } from "@/lib/api";
import { SendError } from "@/lib/email";
import { getStore } from "@/lib/store";

export const PATCH = handler(async (req, { id }) => {
  const { subject, body } = z.object({ subject: z.string().trim().min(3).max(200), body: z.string().min(20).max(5000) }).parse(await req.json());
  const store = getStore();
  const d = await store.getDraft(id);
  if (!d) throw new SendError("Draft not found.", 404);
  if (d.status === "sending" || d.status === "accepted" || d.status === "delivered") throw new SendError("This email has been sent and can no longer be edited.", 409);
  await store.updateDraft(id, { subject, body, edited: true, status: "draft" });
  return { ok: true };
});
