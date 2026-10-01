import { createHash } from "node:crypto";
import type { Line } from "./types";

export type SourceKind = "pdf" | "docx" | "txt";

export const MAX_FILE_BYTES = 8 * 1024 * 1024;

export function kindFromName(filename: string, mime?: string): SourceKind | null {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (f.endsWith(".docx") || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (f.endsWith(".txt") || mime === "text/plain") return "txt";
  return null;
}

export const sha256 = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");

export interface ExtractResult {
  text: string;
  warnings: string[];
  /** true when the file had too little readable text to score safely */
  unreadable: boolean;
}

const MIN_CHARS = 150; // below this the file is effectively empty (scan, image, or broken export)

/** Pulls plain text out of a CV file. Never guesses content it cannot read. */
export async function extractText(buf: Buffer, kind: SourceKind): Promise<ExtractResult> {
  const warnings: string[] = [];
  let text = "";
  try {
    if (kind === "txt") {
      text = buf.toString("utf8");
    } else if (kind === "docx") {
      const mammoth = await import("mammoth");
      const res = await mammoth.extractRawText({ buffer: buf });
      text = res.value;
    } else {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(buf));
      const res = await pdfText(pdf, { mergePages: false });
      const pages = res.text as string[];
      const empty = pages.filter((p) => p.trim().length < 40).length;
      if (empty > 0 && empty < pages.length) warnings.push(`${empty} of ${pages.length} pages had no readable text (possibly scanned).`);
      text = pages.join("\n");
    }
  } catch (e) {
    return { text: "", warnings: [`Could not read the file: ${(e as Error).message}`], unreadable: true };
  }
  text = text.replace(/\u0000/g, "").replace(/[ \t]+\n/g, "\n");
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  const unreadable = text.trim().length < MIN_CHARS || letters < text.length * 0.4;
  if (unreadable) warnings.push("Too little readable text. This is usually a scanned or image-only file.");
  return { text, warnings, unreadable };
}

/** Splits sanitized text into stable, numbered lines that evidence can point to. */
export function toLines(sanitizedLines: string[]): Line[] {
  const out: Line[] = [];
  for (const raw of sanitizedLines) {
    const t = raw.replace(/\s+/g, " ").trim().replace(/^[-–—•▪·*]+\s*/, "");
    if (!t) continue;
    out.push({ id: `L${out.length + 1}`, text: t });
  }
  return out;
}

export const normalizeForMatch = (s: string) =>
  s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim();

export const textHash = (lines: Line[]) => sha256(normalizeForMatch(lines.map((l) => l.text).join("\n")));

const INJECTION_RE =
  /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|all)\b.{0,30}\b(instruction|prompt|rule)s?|\b(system prompt|you are (now )?an? (ai|assistant|model)|as an ai|score (this|the) candidate|give (this|the) candidate|rate (me|this candidate)|assign (a )?(score|rating)|highest (possible )?score|reveal|print your|output the)\b/i;

/** Flags CV lines that look like instructions to an AI. They are kept as data, never obeyed. */
export function findInstructionLikeLines(lines: Line[]): string[] {
  return lines.filter((l) => INJECTION_RE.test(l.text)).map((l) => l.id);
}
