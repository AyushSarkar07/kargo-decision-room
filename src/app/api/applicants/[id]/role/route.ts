import { z } from "zod";
import { handler } from "@/lib/api";
import { SendError } from "@/lib/email";
import { getStore } from "@/lib/store";

// The founder records which role an applicant applied for. Scores for both roles already exist,
// so this only moves the person into that role's ranked list; nothing is re-scored.
export const POST = handler(async (req, { id }) => {
  const { role } = z.object({ role: z.enum(["PM", "SPM"]) }).parse(await req.json());
  const store = getStore();
  const a = await store.getApplicant(id);
  if (!a) throw new SendError("Applicant not found.", 404);
  const sends = (await store.listSends()).filter((s) => s.applicant_id === id);
  if (sends.some((s) => ["sending", "accepted", "delivered"].includes(s.status)))
    throw new SendError("An email has already gone to this candidate, so the role is locked.", 409);
  await store.updateApplicant(id, { applied_role: role, role_confirmed: true });
  return { ok: true };
});
