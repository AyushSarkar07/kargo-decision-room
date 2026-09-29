import { handler } from "@/lib/api";
import { IngestError, ingestFile } from "@/lib/pipeline";
import type { Role } from "@/lib/rubric";

export const maxDuration = 60;

export const POST = handler(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  const role = String(form.get("role") ?? "") as Role;
  if (!(file instanceof File)) throw new IngestError("No file received.");
  if (role !== "PM" && role !== "SPM") throw new IngestError("Choose PM or SPM for this file.");
  const applicant = await ingestFile({
    data: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    mime: file.type,
    role,
    force: form.get("force") === "true",
  });
  return { applicant: { id: applicant.id, status: applicant.status, warnings: applicant.warnings, duplicate_of: applicant.duplicate_of } };
});
