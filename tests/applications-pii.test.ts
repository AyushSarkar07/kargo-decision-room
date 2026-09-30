// Regression check over the real case applications (local only: source/ is gitignored).
// For every CV, no name token from the file name, email username, or profile slug, and no
// 10-digit phone number, may survive into the sanitized content sent to the AI.
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { extractText, toLines } from "@/lib/extract";
import { assertNoPII, nameFromFilename, nameTokens, separatePII, tokenPattern } from "@/lib/pii";

const dir = path.resolve(__dirname, "..", "source", "applications");
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".pdf")) : [];

describe.skipIf(files.length === 0)("PII separation on the case applications", () => {
  it.each(files)("%s", async (f) => {
    const ex = await extractText(readFileSync(path.join(dir, f)), "pdf");
    const sep = separatePII(ex.text, null, f);
    const content = toLines(sep.sanitizedLines).map((l) => l.text).join("\n");
    expect(sep.pii.full_name).toBeTruthy();
    for (const tok of [...nameTokens(nameFromFilename(f)), ...sep.redactedTokens]) {
      const m = content.match(tokenPattern(tok, "i"));
      expect(m ? `${tok} found near: …${content.slice(Math.max(0, m.index! - 25), m.index! + 25)}…` : null).toBeNull();
    }
    if (sep.pii.email) expect(content).not.toContain(sep.pii.email);
    expect(content).not.toMatch(/(?<!\d)(?:\+?91[\s.-]*)?[6-9](?:[\s().-]*\d){9}(?!\d)/);
    expect(() => assertNoPII(content, sep.pii, sep.redactedTokens)).not.toThrow();
  });
});
