# Kargo | The Decision Room

An internal hiring dashboard for Kargo's founder. It turns a pile of PM and Senior PM
applications into a ranked, evidence-backed shortlist. **The system recommends; the founder
decides.** Nothing is rejected or sent automatically.

```
Upload CV + role → extract text → separate personal details (server, no AI)
→ AI structures & scores sanitized work history against BOTH rubrics
→ app verifies every excerpt and computes weighted totals
→ rank per role → 3-sentence brief + invite and rejection drafts
→ founder reviews, decides, edits → founder confirms send → Resend (test delivery only)
```

## What's in the box

| Path | What it is |
| --- | --- |
| `rubric.json`, `rubric.txt` | The PM and SPM rubrics, derived from the eight past-hire CVs. `rubric.txt` is generated from the JSON. |
| `supabase/migrations/` | Schema, RLS policies, private storage bucket |
| `supabase/seed_rubric.sql` | Rubric rows (`rubric_versions`, `rubric_criteria`), generated from `rubric.json` |
| `src/lib/pii.ts` | Local separation of name, email, phone, links, and demographic lines, plus the guard that blocks any AI call still containing them |
| `src/lib/pipeline.ts` | Ingest → score → brief → drafts |
| `src/lib/scoring.ts` | Weighted totals, computed in code |
| `src/lib/board.ts` | Ranking, provisional top five, cross-role fit, Second Look |
| `src/lib/email.ts` | Server-side name merge, allowlist-only destinations, idempotent sends |
| `src/lib/calibration.ts` | Scores the 8 past hires with the current rubric (in-sample consistency check) |
| `fixtures/synthetic/` | Synthetic applicants (clearly labelled; `example.com` addresses) |
| `docs/REQUIREMENTS.md` | Requirements checklist: implemented / tested / blocked |
| `docs/WALKTHROUGH.md` | Demo script |
| `docs/screenshots/` | Screenshots of the working interface (demo mode) |

## Run locally (demo mode, no credentials)

```bash
npm install
npm run dev
```

Open http://localhost:3000 and click **Load synthetic demo applicants**. With no Supabase
variables the app runs in **demo mode**:

- Data is stored in `.data/` (gitignored). There is no sign-in, and a banner says so.
- Without `GEMINI_API_KEY`, scoring is **simulated** with transparent keyword rules. Every
  record, brief, and draft is labelled `simulated`. These are not real assessments.
- Without Resend settings, sends are **simulated**. Nothing leaves the app, and the UI says
  "Simulated send".
- Demo mode refuses to run on Vercel unless `ALLOW_DEMO_ON_DEPLOY=true`.

You can add `GEMINI_API_KEY` alone to get real AI scoring while still storing locally.

## Live mode

1. **Supabase.** Create a dedicated project and apply `supabase/migrations/` (`supabase db push`,
   or paste the files into the SQL editor). The server upserts the current `rubric.json` version
   into `rubric_versions` and `rubric_criteria` on first use, so no manual seed is needed;
   `supabase/seed_rubric.sql` does the same by hand if you prefer. In **Authentication → Users**, create the
   founder's account with email and password, then allow it through RLS:
   ```sql
   insert into public.reviewers (email) values ('founder@yourdomain.com');
   ```
2. **Environment.** Copy `.env.example` to `.env.local` and fill it in. Set `FOUNDER_EMAILS`
   to the same address. The service-role key is used only on the server (files importing it
   are marked `server-only`).
3. **Gemini.** Set `GEMINI_API_KEY`, and `GEMINI_MODEL` if you don't want the default
   (`gemini-3.8-flash`). Use a **billed** Gemini API project for real candidate data; on the
   free tier Google may use inputs to improve its products. Requests are sent with
   `store: false`.
4. **Resend (test delivery).** Set `RESEND_API_KEY`, `EMAIL_FROM` (a verified domain, or
   `onboarding@resend.dev`), and `EMAIL_TEST_ALLOWLIST` (your test inboxes, comma-separated).
   **Do not put real candidate addresses on the allowlist.** A candidate whose address is not
   on it is redirected to the first allowlisted inbox, and the UI shows that before you confirm.
   To track confirmed delivery, add a Resend webhook for `email.delivered` / `email.bounced`
   pointing at `/api/webhooks/resend` and set `RESEND_WEBHOOK_SECRET`.

### Deploy to Vercel

Production: **https://kargo-decision-room.vercel.app** (Vercel team MESA, project `kargo-decision-room`).
Code: https://github.com/AyushSarkar07/kargo-decision-room (private).


Import the repo into Vercel, add the same variables in Project Settings → Environment
Variables (never `NEXT_PUBLIC_` for secrets), and deploy. Function limits are set per route
(`maxDuration` up to 120 s for scoring).

If Vercel blocks a deploy with "the commit author doesn't have permission", the GitHub account
that authored the commit isn't linked to the Vercel account. Link it in Vercel → Account Settings →
Login Connections, or deploy the committed tree without git metadata with `scripts/deploy.sh`.

## Calibration

The **Calibration** tab scores the eight past hires with the current rubric, through the same
path as applicants (PII removed first, excerpts verified, totals in code), and counts how many of
the 15 (Exceeds, Meets/Below) pairs the rubric orders correctly for each role. It is an
**in-sample** check: the rubric came from these same people, so agreement shows the scorer applies
the rubric as written, not that it predicts future performance. Pairs it gets wrong are listed.
Hire CVs are read from `source/hires` (gitignored, or `CALIBRATION_DIR`) and are never stored;
only scores and verified excerpts are saved. The scoring prompt contains no past-hire names.

## How decisions stay human

- Everyone outside the provisional top five is labelled **Needs review**, never rejected.
- Drafts exist for everyone, but a send requires a recorded **Invite** or **Reject** decision
  that matches the email type, a saved draft, a known name, and a final **Confirm and send**
  showing the actual destination.
- Sends are claimed atomically (one active send per applicant; a unique index in Postgres),
  use a Resend idempotency key, and record the provider message id. "Accepted by Resend" and
  "Delivered" are separate states. Failed sends keep the draft and retry with the same key.
- Re-scoring never overwrites decisions, edited drafts, or sent messages. Rankings are
  recomputed from stored evaluations on every load.

## Privacy notes

- Identifying details are separated locally before any AI call and stored in
  `applicant_pii`, which has RLS enabled and no policies (service role only). Education is
  withheld from the AI so institution prestige cannot be scored.
- `assertNoPII` checks every outbound AI payload for the candidate's name, email, phone, and
  links, and blocks the call if any are present. Logs record ids and error types, never CV text.
- CV text is treated as untrusted data: instruction-like lines are flagged, shown to the
  founder, and never accepted as evidence.
- Original files live in a private Supabase Storage bucket, with no public access.
- **Redaction lowers exposure, but it does not by itself make this compliant with DPDP or
  any other law.** A real deployment also needs a lawful basis and notice for candidates,
  retention and deletion rules, a processor agreement with each provider, and access reviews.

## Tests

```bash
npm test               # 38 tests: rubric, scoring, PII, evidence, briefs, workflow, sends, calibration
npm run verify:rubric  # checks every hire excerpt in rubric.json against the source CVs
npm run typecheck && npm run lint && npm run build
BASE_URL=http://localhost:3000 npx tsx scripts/e2e-two-new.ts   # timed upload→send run
```

`source/` (the case PDFs and hire CVs, which contain personal details) is gitignored.
