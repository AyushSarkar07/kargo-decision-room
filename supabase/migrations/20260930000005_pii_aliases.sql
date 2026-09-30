-- Every name form removed from the CV (text, file name, profile slugs, email username).
-- Restricted like the rest of applicant_pii; used by the pre-AI guard.
alter table public.applicant_pii add column if not exists aliases jsonb not null default '[]';
