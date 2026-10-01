// Simple sign-in: one shared access code, exchanged for a signed, http-only session cookie.
// Used when ACCESS_CODE is set. No external calls, so it also runs inside the proxy.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "kdr_session";
export const SESSION_DAYS = 30;

/** OPEN_ACCESS=true removes sign-in entirely (fictional demo data only). */
export const openAccess = () => process.env.OPEN_ACCESS?.trim() === "true";
export const MAX_OPEN_APPLICANTS = Number(process.env.MAX_OPEN_APPLICANTS ?? 150);

export const accessCodeEnabled = () => Boolean(process.env.ACCESS_CODE?.trim() && process.env.SESSION_SECRET?.trim());

const sign = (payload: string) => createHmac("sha256", process.env.SESSION_SECRET!).update(payload).digest("base64url");

/** Constant-time comparison, case- and whitespace-insensitive so the code is easy to type. */
export function codeMatches(input: string) {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
  const a = createHash("sha256").update(norm(input)).digest();
  const b = createHash("sha256").update(norm(process.env.ACCESS_CODE ?? "")).digest();
  return timingSafeEqual(a, b);
}

export function issueSession() {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + SESSION_DAYS * 864e5 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySession(token: string | undefined): boolean {
  if (!token || !accessCodeEnabled()) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()).exp > Date.now();
  } catch {
    return false;
  }
}
