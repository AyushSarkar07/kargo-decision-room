import { handler } from "@/lib/api";
import { resolveDestination } from "@/lib/email";
import { getStore } from "@/lib/store";

export const GET = handler(async (_req, { id }) => {
  const pii = await getStore().getPII(id);
  return resolveDestination(pii?.email ?? null);
});
