import { z } from "zod";
import { handler } from "@/lib/api";
import { SendError } from "@/lib/email";
import { getStore } from "@/lib/store";

export const POST = handler(async (req, { id }) => {
  const body = z
    .object({ decision: z.enum(["undecided", "reviewing", "hold", "invite", "reject"]), note: z.string().max(1000).optional() })
    .parse(await req.json());
  const store = getStore();
  const a = await store.getApplicant(id);
  if (!a) throw new SendError("Applicant not found.", 404);
  const sends = (await store.listSends()).filter((s) => s.applicant_id === id);
  if (sends.some((s) => ["sending", "accepted", "delivered"].includes(s.status)))
    throw new SendError("An email has already gone to this candidate, so the decision is locked.", 409);
  const prev = await store.getDecision(id);
  await store.setDecision({ applicant_id: id, decision: body.decision, note: body.note ?? prev?.note ?? "", decided_at: new Date().toISOString() });
  return { ok: true };
});
