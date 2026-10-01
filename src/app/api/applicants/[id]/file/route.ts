import { handler } from "@/lib/api";
import { getStore } from "@/lib/store";

const TYPES = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain; charset=utf-8" } as const;

export const GET = handler(async (_req, { id }) => {
  const store = getStore();
  const a = await store.getApplicant(id);
  if (!a?.storage_path) return new Response("Not found", { status: 404 });
  const data = await store.readFile(a.storage_path);
  if (!data) return new Response("Not found", { status: 404 });
  const type = TYPES[a.source_kind as keyof typeof TYPES] ?? "application/octet-stream";
  return new Response(new Uint8Array(data), {
    headers: { "content-type": type, "content-disposition": `inline; filename="cv.${a.source_kind}"`, "cache-control": "private, no-store" },
  });
});
