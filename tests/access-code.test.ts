import { beforeEach, describe, expect, it } from "vitest";
import { codeMatches, issueSession, verifySession } from "@/lib/access-code";

describe("access-code sign-in", () => {
  beforeEach(() => {
    process.env.ACCESS_CODE = "harbor-lantern-7731";
    process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
  });

  it("accepts the code regardless of case and stray spaces, and rejects others", () => {
    expect(codeMatches("harbor-lantern-7731")).toBe(true);
    expect(codeMatches("  Harbor-Lantern-7731 ")).toBe(true);
    expect(codeMatches("harbor-lantern-7732")).toBe(false);
    expect(codeMatches("")).toBe(false);
  });

  it("issues sessions that verify, and rejects tampered or foreign ones", () => {
    const token = issueSession();
    expect(verifySession(token)).toBe(true);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ exp: Date.now() + 1e12 })).toString("base64url");
    expect(verifySession(`${forged}.${sig}`)).toBe(false);
    expect(verifySession(`${payload}.x${sig.slice(1)}`)).toBe(false);
    process.env.SESSION_SECRET = "a-different-secret-rotated-away-from-the-old";
    expect(verifySession(token)).toBe(false);
  });

  it("is disabled when no code is configured", () => {
    delete process.env.ACCESS_CODE;
    expect(verifySession(issueSession())).toBe(false);
  });
});
