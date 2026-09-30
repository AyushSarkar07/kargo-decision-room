import { handler } from "@/lib/api";
import { IngestError, ingestFile } from "@/lib/pipeline";
import type { Role } from "@/lib/rubric";

export const maxDuration = 60;

export const POST = handler(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  const roleIn = String(form.get("role") ?? "");
  if (!(file instanceof File)) throw new IngestError("No file received.");
  if (roleIn !== "PM" && roleIn !== "SPM" && roleIn !== "unstated") throw new IngestError("Choose PM, SPM, or Not stated for this file.");
  // "Not stated": scored against both rubrics, but not ranked until the founder picks the role.
  const role: Role = roleIn === "SPM" ? "SPM" : "PM";
  const applicant = await ingestFile({
    data: Buffer.from(await file.arrayBuffer()),
    filename: file.name,
    mime: file.type,
    role,
    force: form.get("force") === "true",
    roleConfirmed: roleIn !== "unstated",
  });
  return { applicant: { id: applicant.id, status: applicant.status, warnings: applicant.warnings, duplicate_of: applicant.duplicate_of } };
});
