import { z } from "zod";
import { handler } from "@/lib/api";
import { resetDemo, seedDemo } from "@/lib/demo";

export const maxDuration = 300;

export const POST = handler(async (req) => {
  const { reset } = z.object({ reset: z.boolean().optional() }).parse(await req.json().catch(() => ({})));
  if (reset) await resetDemo();
  return { results: await seedDemo() };
});
