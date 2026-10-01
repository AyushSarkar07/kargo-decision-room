# Requirements checklist

Status as of 29 Sep 2026. **Implemented** = code exists. **Tested** = verified by an automated
test (`npm test`, 38 passing) or by driving the running app in a browser (demo mode). **Blocked**
= needs something not available in this build.

Everything functional verified so far ran in **demo mode**: local file store, simulated scoring, simulated
email. **Live run (29 Sep 2026, `npm run test:live`, results in `docs/live-results.json`):** real Gemini (`gemini-3.8-flash`), Supabase, and Resend in test mode, using synthetic applicants only. All 5 live checks passed.

## 1. Past hires and rubric

| Requirement | Status | Evidence |
| --- | --- | --- |
| All 8 hire profiles read; none missing or unreadable | Tested | `npm run verify:rubric` reads all 8 DOCX files |
| Gap flagged: profiles are CVs only, with no interview notes or outcome notes | Implemented | `rubric.json → data_gaps`, shown in the Rubric tab |
| Hires kept separate from applicants | Implemented | Hires exist only in `rubric.json`, never in the applicant tables |
| 2–3 patterns with supporting examples, counterexamples, limitations | Implemented | P1–P3 in `rubric.json` / `rubric.txt` |
| Every hire excerpt is verbatim from the source CVs | Tested | 62 of 62 excerpts matched |
| PM and SPM rubrics, 4–6 criteria each, weights total 100% | Tested | `core.test.ts`, SQL check in `seed_rubric.sql` |
| Per criterion: definition, source hires, 0–4 anchors, weight, SPM ownership, insufficient-evidence rule | Tested | `validateRubric` |
| JD requirements shown separately, not scored | Implemented | `role_requirements`; "Job description checklist · not scored" |
| No prestige, names, demographics, or culture fit as signals | Implemented | `excluded_signals`; education withheld from the AI; prompt rule |
| Calibration: past hires scored with the rubric, pairwise agreement with ratings shown, labelled in-sample | Tested (live) | Gemini: all 8 hires scored; PM 15 of 15 pairs agree with ratings, SPM 13 of 15 (Aditya Shetty, Sales Lead, scores below Vikram Nair and Preetham Rao on SPM). In-sample only |
| `rubric.txt` and `rubric.json` saved | Implemented | Repo root; `.txt` is generated from `.json` |

## 2. Workflow

| Requirement | Status | Evidence |
| --- | --- | --- |
| Next.js + TypeScript + Tailwind | Tested | `next build` passes |
| Supabase schema, RLS, private bucket | Tested (schema) | Applied to project `kargo-decision-room` (ap-south-1). Checked: `anon` and `authenticated` cannot read `applicant_pii` or write any table; bucket is private; the only remaining security advisor notices are the intentional "no policy" ones. The RLS helper lives in a private schema. **Blocked:** app reads and writes need the service-role key |
| Gemini Flash, configurable model id, structured and validated output | Tested (live) | `gemini-3.8-flash` via the Interactions API; every scoring and brief/draft call validated; all briefs and drafts were model-generated (no fallbacks needed) |
| Resend send | Tested (live) | Two sends accepted by Resend (ids in `docs/live-results.json`) to the test address `delivered@resend.dev` |
| Vercel deployment | Tested | Live at https://kargo-decision-room.vercel.app. Serves the setup page (names the missing settings); every API route returns 401 without sign-in; demo seeding refused on Vercel. **Blocked:** live mode needs `SUPABASE_SERVICE_ROLE_KEY` and `FOUNDER_EMAILS` in Vercel |
| PDF, DOCX, TXT upload | Tested | PDF and TXT upload tests; DOCX extraction test using a local hire file |
| Batch upload with a role per file | Tested | Driven in the browser: 2 files, PM and SPM |
| Scanned or unreadable file → clear recovery path, nothing invented | Tested | Image-only PDF stops at "Needs text"; pasted text recovers it |
| PII separated before any AI call | Tested | Every outbound payload checked for name, email, phone, links |
| Both PM and SPM evaluations for every applicant | Tested | `workflow.test.ts` |
| Default lists rank by applied role; cross-role fit shown separately, never moved | Tested | `buildRoleBoard`; "Possible cross-role fit" panel |
| Weighted totals in code | Tested | Hand-calculated PM and SPM cases; stored totals recomputed from criteria |
| Criterion scores, excerpts, line references, reasons, uncertainty, rubric version stored | Tested | `workflow.test.ts` |
| Every excerpt verified against the CV; invented evidence → Not evidenced | Tested | `verifyCriteria` tests |
| "Not evidenced" distinct from 0; coverage shown; incomplete records labelled | Tested | Scoring tests; UI chips and warning banner |
| Provisional top 5 per role; everyone else "Needs review" | Tested | `workflow.test.ts`, browser |
| Invite and rejection drafts for everyone; draft ≠ decision | Tested | Both drafts per applicant; decision recorded separately |
| Founder can change the decision and email type | Tested | Browser |
| Re-ranking as applicants are added keeps decisions, edits, and sends | Tested | `workflow.test.ts` |
| Duplicate detection (exact file; same text; same email *and* name) | Tested | 409 for an exact file; `duplicate_of` for same text, or same email and same full name. All 50 case CVs share one course test inbox, so email alone is not treated as a duplicate |

## 3. Experience

| Requirement | Status | Evidence |
| --- | --- | --- |
| Warm off-white, navy, restrained orange; compact; no decorative charts | Implemented | `globals.css` tokens; screenshots |
| Ten Minute Review: why, strongest evidence, uncertainty, what to ask | Tested | Browser, screenshot 01 |
| PM and SPM tabs with ranked lists | Tested | Browser |
| Upload progress and failure states | Tested | Browser, screenshot 04 |
| Score breakdown and evidence coverage | Tested | Browser |
| Three-sentence brief for the top five | Tested | Validated as exactly 3 single sentences, with a template fallback |
| Editable email preview beside the evidence | Tested | Three-column layout at ≥1280px |
| Review, hold, invite, and reject controls; final "Confirm and send" | Tested | Browser, screenshot 03 |
| Processing, needs review, draft ready, sending, sent, failed states | Implemented | `statusOf`. Sending and failed are covered by tests; the rest were seen in the browser |
| Evidence Trail (CV excerpt + hire evidence behind the criterion) | Tested | Browser, screenshot 02 |
| Second Look view | Tested | Browser, screenshot 05; injection case in tests |

## 4. Data and email

| Requirement | Status | Evidence |
| --- | --- | --- |
| PII parsed locally; Gemini sees sanitized content only | Tested | Payload inspection tests |
| PII stored separately with restricted access | Tested (privileges) | `applicant_pii`: RLS on, no policies; privilege check on the live project shows no `anon`/`authenticated` access |
| Real name merged into emails on the server | Tested | Sent text starts with "Hi Arnav," |
| CV text treated as untrusted data | Tested | Injection fixture: flagged lines never cited as evidence |
| Authentication | Implemented | Supabase Auth, founder allowlist, proxy redirect, and a check in every route. **Blocked:** not tested against a live project |
| Server credentials out of browser bundles | Tested | `server-only` imports; built client bundle scanned |
| Secrets out of Git | Implemented | `.gitignore` covers `.env*`, `source/`, `.data/`; `.env.example` has placeholders only |
| No claim that redaction alone makes this legally compliant | Implemented | README privacy notes |
| Test mode by default; explicit allowlist; real candidate addresses never used | Tested | Allowlist test; any mode other than "test" is refused |
| Actual destination shown before confirming | Tested | Browser dialog; the server re-checks the confirmed address |
| Sends only after a deliberate founder action | Tested | Refused without a matching decision |
| No duplicate sends; provider id recorded | Tested | Concurrent double click, then a retry: exactly one send |
| Provider acceptance vs confirmed delivery kept distinct | Tested (acceptance live) | Live sends recorded as `accepted`; `delivered` needs the Resend webhook (not configured) |
| Failed drafts kept for retry | Tested | Retry after a failure reuses the idempotency key |
| Demo mode clearly labelled; synthetic data separate | Tested | Mode chips, "Simulated" labels, synthetic filter |

## 5. Verification

| Requirement | Status | Evidence |
| --- | --- | --- |
| 3-applicant test (strong PM, weak SPM, ambiguous) | Tested (live, synthetic fixtures) | Strong PM 95 (PM, 100% coverage); weak SPM 5 (SPM); ambiguous 25 (PM, 40% coverage, 3 criteria Not evidenced, so labelled incomplete). DB check: no name, email, or phone in stored content; PII stored separately; 6 Gemini requests checked for PII |
| Records and decisions persist after refresh | Tested | Store reopened; browser reload |
| 60 application CVs processed | Tested (live), **50 found** | The course's `resumes` folder contains 50 CVs, not 60: 30 numbered (role not stated in file or CV), 15 `pm_`, 5 `spm_`. All 50 loaded through the live app in 6 min 52 s (3 at a time); all 50 scored for both roles after the redaction fix below. The 30 with no stated role are scored but not ranked until the founder picks a role |
| Two new CVs, upload to confirmed test send, timed | Tested (live) | 36.0 s from upload to provider acceptance (scoring about 16–17 s per CV). Measured server-side through the app's own code, without the browser/HTTP layer |
| Receipt within 30 s | **Not verified** | The Resend key is send-only, so delivery status can't be read back, and `delivered@resend.dev` is a simulated inbox. To measure receipt, add your own inbox to `EMAIL_TEST_ALLOWLIST` (or configure the delivery webhook) |

## Found and fixed during verification

- The scoring prompt quoted a past hire by name, so the PII guard blocked that hire's calibration call. It would also have blocked any applicant sharing a first or last name with a past hire. Hire names are now removed from all prompts (test added).
- Browser-supplied MIME types can be empty, and the private bucket only accepts PDF/DOCX/TXT. The stored type now comes from the verified extension.
- With only the public Supabase values set, the proxy forced a sign-in while the app was still in demo mode. Both now use the same live-mode rule.
- Thin but readable CVs were being sent to "Needs text". The unreadable threshold now catches only near-empty extractions.
- Lists labelled simulated sends as "Sent". They now say "Simulated send".
- Runtime file reads (calibration, demo seeding) made the build trace the whole project, including `source/` (real CVs) and `.data/`, into every server route. `next.config.ts` now excludes private and local folders; verified in the build's trace files.
- **Privacy failure on the case applications (found 30 Sep, fixed 1 Oct).** In the first load, names were not detected in 22 of the 46 CVs that were scored, because those CVs open with headings, run words together in the PDF text, or have no name line. Those names were sent to Gemini. The guard caught only 4, where a heading had been mistaken for the name. Fixed: name forms are now taken from the text, file name, profile slugs and email usernames (only if they appear in the CV, and link/email words only if always capitalised); headings are never taken as names; names of 5+ letters match inside run-together text; any Indian mobile format is redacted; scoring fails closed when no name is known. All 50 were re-sanitized from the stored originals and re-scored, overwriting the earlier text, evidence, briefs and drafts. Database audit afterwards: 0 names in stored CV text and 0 in any AI output (evaluations, briefs, drafts, summaries). Data already sent to Google in the first load cannot be recalled. The people are fictional.
- All 50 case CVs share one email address (the course test inbox), so "same email" flagged 49 as duplicates. Duplicates now need the same text, or the same email and the same full name.
