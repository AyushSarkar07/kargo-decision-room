import { z } from "zod";
import { handler } from "@/lib/api";
import { getStore } from "@/lib/store";

// Lets the founder correct a name the local parser missed. Names are never sent to the AI.
export const PATCH = handler(async (req, { id }) => {
  const { full_name } = z.object({ full_name: z.string().trim().min(2).max(120) }).parse(await req.json());
  await getStore().updatePII(id, { full_name });
  return { ok: true };
});
