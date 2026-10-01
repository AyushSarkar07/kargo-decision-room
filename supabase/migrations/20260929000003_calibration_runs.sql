-- Calibration runs: the past hires scored with the current rubric (in-sample consistency check).
-- Stores scores and verified excerpts only; hire names come from rubric.json, contact details are never stored.
create table if not exists public.calibration_runs (
  id uuid primary key default gen_random_uuid(),
  rubric_version text not null,
  scored_by text not null,
  results jsonb not null,
  concordance jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.calibration_runs enable row level security;
create policy "reviewers read calibration" on public.calibration_runs for select to authenticated using (private.is_reviewer());
revoke insert, update, delete on public.calibration_runs from anon, authenticated;
