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
// Words that appear in headings, file names, handles, or email usernames but are not names.
const NON_NAME_WORDS = new Set(
  ("cv resume curriculum vitae final updated latest new copy draft version application applicant candidate pm spm apm senior junior " +
    "product products manager management engineer lead head director founder consultant analyst designer developer " +
    "core key skills skill competencies competency summary profile about objective experience work professional career " +
    "education contact details personal technical achievements projects certifications languages interests tools " +
    "mail email gmail yahoo outlook hotmail official info hello the and for with india mumbai pune delhi bengaluru bangalore " +
    "chennai hyderabad kolkata linkedin github www https http com page ai ml saas gtm platform strategy")
    .split(" "),
);
const MOBILE_RE = /(?<![\d])(?:\+?91[\s.-]*)?[6-9](?:[\s().-]*\d){9}(?![\d])/g;

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

/** A line shaped like a person's name: 2–4 capitalised words, none of them heading or role words. */
function looksLikeName(t: string) {
  if (!t || EMAIL_ONE.test(t) || /\d/.test(t) || isHeading(t) || NOT_A_NAME.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2 || words.length > 4) return false;
  if (!words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w))) return false;
  return !words.some((w) => NON_NAME_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, "")));
}

function guessName(lines: string[]): string | null {
  for (const raw of lines.slice(0, 15)) {
    const labelled = raw.match(/^\s*name\s*[:\-–]\s*(.+)$/i);
    if (labelled) return tidyName(labelled[1]);
  }
  for (const raw of lines.slice(0, 12)) {
    if (looksLikeName(raw.trim())) return tidyName(raw.trim());
  }
  return null;
}

/** Name-like tokens from a string such as a file name, profile slug, or email username. */
function tokensFrom(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length >= 3 && !NON_NAME_WORDS.has(w));
}

/** "03_arnav_sen.pdf" or "pm_12_akash_verma.docx" → "Arnav Sen". Null when it does not look like a name. */
export function nameFromFilename(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const toks = tokensFrom(filename.replace(/^(?:s?pm|cv|resume)?[_\s-]*\d*[_\s-]*/i, ""));
  if (toks.length < 1 || toks.length > 4) return null;
  return toks.map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
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

/**
 * Pattern for one name token. PDF extraction often glues words together ("MEHTARohan"), so
 * tokens of 5+ letters match anywhere; shorter ones ("sen", "roy") only as whole words.
 */
export function tokenPattern(tok: string, flags = "gi") {
  const t = escapeRe(tok);
  return new RegExp(tok.length >= 5 ? `${t}(?:'s)?` : `(?<![A-Za-z])${t}(?:'s)?(?![A-Za-z])`, flags);
}

export interface SeparationResult {
  pii: Omit<ApplicantPII, "applicant_id">;
  /** Every name form that was removed; the AI guard checks all of them. */
  redactedTokens: string[];
  sanitizedLines: string[];
  summary: RedactionSummary;
}

/**
 * Splits raw CV text into (a) identifying details kept in restricted storage and
 * (b) sanitized professional content. Education is withheld from scoring so that
 * institution prestige cannot influence it.
 */
export function separatePII(rawText: string, nameOverride?: string | null, filename?: string | null): SeparationResult {
  const rawLines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const inText = (tok: string) => tokenPattern(tok, "i").test(rawText);
  const fromFileRaw = nameFromFilename(filename);
  // A file-name "name" only counts if it actually appears in the CV (so "s01_strong_pm" is ignored).
  const fromFile = fromFileRaw && nameTokens(fromFileRaw).some(inText) ? fromFileRaw : null;
  let detected = guessName(rawLines);
  // If the text "name" shares nothing with the file-name name that appears in the CV, it was a heading.
  if (detected && fromFile && !nameTokens(detected).some((t) => nameTokens(fromFile).map((x) => x.toLowerCase()).includes(t.toLowerCase()))) {
    detected = null;
  }
  const name = nameOverride ?? detected ?? fromFile;
  const emails = [...new Set(rawText.match(EMAIL_RE) ?? [])];
  const links = [...new Set((rawText.match(URL_RE) ?? []).map((l) => l.replace(/[),.;]+$/, "")))];
  const phones = [...new Set(phonesIn(rawText.replace(EMAIL_RE, " ").replace(URL_RE, " ")))];
  // Redact every name form we can find: override, text, file name, profile slugs, email usernames,
  // and joined forms used in handles ("firstlast").
  const slugTokens = links.flatMap((l) => tokensFrom(l.split(/\/in\/|\.com\/|\.net\/|\.io\//).pop() ?? ""));
  const emailTokens = emails.flatMap((e) => tokensFrom(e.split("@")[0]));
  const baseTokens = [...new Set([...nameTokens(nameOverride ?? null), ...nameTokens(detected), ...nameTokens(fromFile), ...slugTokens, ...emailTokens].map((t) => t.toLowerCase()))];
  const joined = [nameOverride, detected, fromFile]
    .filter(Boolean)
    .map((n) => nameTokens(n!).join("").toLowerCase())
    .filter((j) => j.length >= 6);
  // Keep only forms present in the CV: they are what needs removing, and absent ones would only
  // cause false alarms in the guard.
  const override = nameTokens(nameOverride ?? null).map((t) => t.toLowerCase());
  const tokens = [...new Set([...joined, ...baseTokens])]
    .filter((t) => override.includes(t) || inText(t))
    .sort((a, b) => b.length - a.length);

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
    // A name-shaped line near the top is dropped even if it was not chosen as the name.
    if (i < 12 && looksLikeName(t)) {
      summary.name_mentions_replaced++;
      return;
    }
    let s = line;
    s = s.replace(EMAIL_RE, "[email removed]");
    s = s.replace(URL_RE, "[link removed]");
    for (const p of phones) s = s.split(p).join("[phone removed]");
    s = s.replace(MOBILE_RE, "[phone removed]");
    if (name && s.trim().toLowerCase() === name.toLowerCase()) {
      summary.name_mentions_replaced++;
      return;
    }
    for (const tok of tokens) {
      s = s.replace(tokenPattern(tok), () => {
        summary.name_mentions_replaced++;
        return "the candidate";
      });
    }
    out.push(s);
  });

  // Collapse runs of blank lines.
  const sanitizedLines = out.filter((l, i, arr) => l.trim() || (i > 0 && arr[i - 1].trim()));
  return {
    pii: { full_name: name, email: emails[0] ?? null, phone: phones[0] ?? (rawText.match(MOBILE_RE)?.[0] ?? null), links },
    redactedTokens: tokens,
    sanitizedLines,
    summary,
  };
}

export class PIILeakError extends Error {
  constructor(public found: string[]) {
    super(`Blocked AI call: payload contains identifying details (${found.join(", ")})`);
  }
}

/**
 * Final guard before any external AI call. Throws if identifying details are present.
 * Call it on the candidate-derived part of the request: the system prompt is fixed code,
 * tested separately to contain no personal names.
 */
export function assertNoPII(payload: string, pii: Pick<ApplicantPII, "full_name" | "email" | "phone" | "links">, extraTokens: string[] = []) {
  const found: string[] = [];
  const lower = payload.toLowerCase();
  if (pii.email && lower.includes(pii.email.toLowerCase())) found.push("email");
  if (EMAIL_ONE.test(payload)) found.push("an email address");
  if (pii.phone) {
    const d = pii.phone.replace(/\D/g, "").slice(-10);
    if (d.length === 10 && payload.replace(/\D/g, "").includes(d)) found.push("phone");
  }
  for (const l of pii.links) if (l && lower.includes(l.toLowerCase())) found.push("profile link");
  for (const tok of [...nameTokens(pii.full_name), ...extraTokens]) {
    if (tokenPattern(tok, "i").test(payload)) found.push("name");
  }
  if (MOBILE_RE.test(payload)) found.push("a phone number");
  MOBILE_RE.lastIndex = 0;
  if (found.length) throw new PIILeakError([...new Set(found)]);
}
