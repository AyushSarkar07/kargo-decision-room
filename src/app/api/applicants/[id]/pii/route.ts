import { z } from "zod";
import { handler } from "@/lib/api";
import { reprocessApplicant } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export const maxDuration = 120;

// The founder corrects or adds a name the parser missed. The CV is then re-sanitized with that
// name so it is removed before any AI call, and re-scored. Names are never sent to the AI.
export const PATCH = handler(async (req, { id }) => {
  const { full_name } = z.object({ full_name: z.string().trim().min(2).max(120) }).parse(await req.json());
  const store = getStore();
  await store.updatePII(id, { full_name });
  const a = await store.getApplicant(id);
  if (a?.storage_path && a.source_kind !== "pasted" && a.status !== "needs_text") await reprocessApplicant(id, full_name);
  return { ok: true };
});
