import { handler } from "@/lib/api";
import { redraftEmails } from "@/lib/pipeline";

export const maxDuration = 120;

// Rewrites unedited, unsent drafts from stored scores so each one names something specific.
export const POST = handler(async (_req, { id }) => ({ drafts: await redraftEmails(id) }));
