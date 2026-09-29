// Local, deterministic separation of identifying details from CV text.
// Runs on the application server before any external AI call.
import type { ApplicantPII, RedactionSummary } from "./types";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const EMAIL_ONE = new RegExp(EMAIL_RE.source, "i");
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin\.com|github\.com|gitlab\.com|leetcode\.com|behance\.net|dribbble\.com|medium\.com|twitter\.com|x\.com|kaggle\.com)\/\S*/gi;
// Candidate phone-like runs; filtered further by digit count below.
const PHONE_CANDIDATE_RE = /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,5}\)?[\s.-]?){1,4}\d{3,5}/g;
const DEMOGRAPHIC_RE =
  /^\s*[-–—•▪·*]?\s*(date of birth|d\.?o\.?b\.?|birth ?date|age|gender|sex|marital status|nationality|religion|caste|father'?s name|mother'?s name|spouse|passport( no\.?| number)?|aadhaar|pan( no\.?| number)?)\s*[:\-–]/i;
const HEADING_WORDS =
  /^(professional )?(summary|profile|about|objective|experience|work experience|professional experience|employment|career history|skills|technical skills|core skills|certifications?( & (skills|tools))?|certifications & tools|tools|projects|awards|achievements|publications|interests|languages|volunteering|leadership|education|academics?|qualifications|references)\b/i;
const EDUCATION_HEADING = /^(education|academics?|academic (background|qualifications)|qualifications)\b/i;
const NOT_A_NAME = /\b(resume|curriculum|vitae|cv|profile|summary|product|manager|engineer|senior|lead|experience|contact)\b/i;

function isHeading(line: string) {
  const t = line.trim().replace(/[:|]+$/, "");
  if (!t || t.length > 48) return false;
  if (HEADING_WORDS.test(t)) return true;
  return /^[A-Z &/]{4,}$/.test(t) && t.split(/\s+/).length <= 4;
}

function phonesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(PHONE_CANDIDATE_RE)) {
    const raw = m[0].trim();
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 10 || digits.length > 13) continue;
    // Year ranges like "2019 2021 2023" are not phone numbers.
    if (/^(?:(?:19|20)\d{2}[\s.-]*){2,}$/.test(raw)) continue;
    out.push(raw);
  }
  return out;
}

function guessName(lines: string[]): string | null {
  for (const raw of lines.slice(0, 8)) {
    const labelled = raw.match(/^\s*name\s*[:\-–]\s*(.+)$/i);
    if (labelled) return tidyName(labelled[1]);
  }
  for (const raw of lines.slice(0, 5)) {
    const t = raw.trim();
    if (!t) continue;
    if (EMAIL_ONE.test(t) || /\d/.test(t)) continue;
    const words = t.split(/\s+/);
    if (words.length < 2 || words.length > 5) continue;
    if (NOT_A_NAME.test(t)) continue;
    if (!words.every((w) => /^[A-Za-z][A-Za-z.'-]*$/.test(w))) continue;
    if (!words.every((w) => /^[A-Z]/.test(w))) continue;
    return tidyName(t);
  }
  return null;
}

function tidyName(s: string) {
  const t = s.trim().replace(/\s+/g, " ");
  if (t === t.toUpperCase()) return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return t;
}

export function nameTokens(name: string | null): string[] {
  if (!name) return [];
  return name
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z'-]/g, ""))
    .filter((w) => w.length >= 3);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface SeparationResult {
  pii: Omit<ApplicantPII, "applicant_id">;
  sanitizedLines: string[];
  summary: RedactionSummary;
}

/**
 * Splits raw CV text into (a) identifying details kept in restricted storage and
 * (b) sanitized professional content. Education is withheld from scoring so that
 * institution prestige cannot influence it.
 */
export function separatePII(rawText: string, nameOverride?: string | null): SeparationResult {
  const rawLines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const name = nameOverride ?? guessName(rawLines);
  const emails = [...new Set(rawText.match(EMAIL_RE) ?? [])];
  const links = [...new Set((rawText.match(URL_RE) ?? []).map((l) => l.replace(/[),.;]+$/, "")))];
  const phones = [...new Set(phonesIn(rawText.replace(EMAIL_RE, " ").replace(URL_RE, " ")))];
  const tokens = nameTokens(name);

  const summary: RedactionSummary = {
    name_found: Boolean(name),
    emails: emails.length,
    phones: phones.length,
    links: links.length,
    demographic_lines: 0,
    education_lines_withheld: 0,
    name_mentions_replaced: 0,
  };

  const out: string[] = [];
  let inEducation = false;
  rawLines.forEach((line, i) => {
    const t = line.trim();
    if (isHeading(t)) inEducation = EDUCATION_HEADING.test(t.replace(/^[^A-Za-z]+/, ""));
    if (inEducation) {
      if (t && !EDUCATION_HEADING.test(t)) summary.education_lines_withheld++;
      return;
    }
    if (DEMOGRAPHIC_RE.test(t)) {
      summary.demographic_lines++;
      return;
    }
    const hasContact = EMAIL_ONE.test(t) || phonesIn(t).length > 0 || new RegExp(URL_RE.source, "i").test(t);
    // Header lines carrying contact details usually also carry an address or city: drop them whole.
    if (hasContact && i < 12) return;
    let s = line;
    s = s.replace(EMAIL_RE, "[email removed]");
    s = s.replace(URL_RE, "[link removed]");
    for (const p of phones) s = s.split(p).join("[phone removed]");
    if (name && s.trim().toLowerCase() === name.toLowerCase()) {
      summary.name_mentions_replaced++;
      return;
    }
    for (const tok of tokens) {
      const re = new RegExp(`\\b${escapeRe(tok)}(?:'s)?\\b`, "gi");
      s = s.replace(re, () => {
        summary.name_mentions_replaced++;
        return "the candidate";
      });
    }
    out.push(s);
  });

  // Collapse runs of blank lines.
  const sanitizedLines = out.filter((l, i, arr) => l.trim() || (i > 0 && arr[i - 1].trim()));
  return {
    pii: { full_name: name, email: emails[0] ?? null, phone: phones[0] ?? null, links },
    sanitizedLines,
    summary,
  };
}

export class PIILeakError extends Error {
  constructor(public found: string[]) {
    super(`Blocked AI call: payload contains identifying details (${found.join(", ")})`);
  }
}

/** Final guard before any external AI call. Throws if identifying details are present. */
export function assertNoPII(payload: string, pii: Pick<ApplicantPII, "full_name" | "email" | "phone" | "links">) {
  const found: string[] = [];
  const lower = payload.toLowerCase();
  if (pii.email && lower.includes(pii.email.toLowerCase())) found.push("email");
  if (EMAIL_ONE.test(payload)) found.push("an email address");
  if (pii.phone) {
    const d = pii.phone.replace(/\D/g, "").slice(-10);
    if (d.length === 10 && payload.replace(/\D/g, "").includes(d)) found.push("phone");
  }
  for (const l of pii.links) if (l && lower.includes(l.toLowerCase())) found.push("profile link");
  for (const tok of nameTokens(pii.full_name)) {
    if (new RegExp(`\\b${escapeRe(tok)}\\b`, "i").test(payload)) found.push("name");
  }
  if (found.length) throw new PIILeakError([...new Set(found)]);
}
