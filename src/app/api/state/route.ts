import { handler, loadCandidates } from "@/lib/api";
import { publicConfig } from "@/lib/config";
import { RUBRIC_VERSION } from "@/lib/rubric";

export const dynamic = "force-dynamic";

export const GET = handler(async (_req, _p, session) => ({
  config: publicConfig(),
  session: { email: session.email, demo: session.demo, open: Boolean(session.open) },
  rubricVersion: RUBRIC_VERSION,
  candidates: await loadCandidates(),
}));
