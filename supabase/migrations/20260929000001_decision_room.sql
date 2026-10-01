-- Kargo Decision Room schema.
-- All application writes go through the server using the service role after the
-- founder's session is verified. Row Level Security is enabled on every table;
-- signed-in reviewers get read-only policies, and applicant_pii has no policies
-- at all, so only the server (service role) can read identifying details.

create extension if not exists pgcrypto;

-- Reviewers allowed to read through RLS (mirrors FOUNDER_EMAILS).
create table if not exists public.reviewers (
  email text primary key check (email = lower(email))
);

create or replace function public.is_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reviewers r where r.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function public.is_reviewer() from public;
grant execute on function public.is_reviewer() to authenticated;

-- Rubric --------------------------------------------------------------------
create table if not exists public.rubric_versions (
  version text primary key,
  rubric jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.rubric_criteria (
  rubric_version text not null references public.rubric_versions(version) on delete cascade,
  role text not null check (role in ('PM', 'SPM')),
  criterion_id text not null,
  position int not null,
  name text not null,
  definition text not null,
  weight int not null check (weight between 0 and 100),
  anchors jsonb not null,
  spm_ownership text not null,
  insufficient_evidence text not null,
  hire_evidence jsonb not null,
  primary key (rubric_version, role, criterion_id)
);

-- Applicants (sanitized professional content only) ------------------------
create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  dataset text not null default 'live' check (dataset in ('live', 'demo')),
  is_synthetic boolean not null default false,
  applied_role text not null check (applied_role in ('PM', 'SPM')),
  source_filename text not null,
  source_kind text not null check (source_kind in ('pdf', 'docx', 'txt', 'pasted')),
  file_hash text not null,
  text_hash text,
  storage_path text,
  status text not null check (status in ('extracting', 'needs_text', 'ready_to_score', 'scoring', 'scored', 'failed')),
  error text,
  warnings jsonb not null default '[]',
  duplicate_of uuid references public.applicants(id) on delete set null,
  lines jsonb not null default '[]',
  redaction_summary jsonb,
  injection_flags jsonb not null default '[]',
  work_evidence jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists applicants_file_hash_idx on public.applicants (file_hash);
create index if not exists applicants_text_hash_idx on public.applicants (text_hash);

-- Identifying details: restricted, service role only --------------------------
create table if not exists public.applicant_pii (
  applicant_id uuid primary key references public.applicants(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  links jsonb not null default '[]'
);
create index if not exists applicant_pii_email_idx on public.applicant_pii (lower(email));

-- Evaluations: one per applicant per role, both roles always ----------------
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  role text not null check (role in ('PM', 'SPM')),
  rubric_version text not null,
  scored_by text not null,
  criteria jsonb not null, -- [{criterion_id, score|null, evidence[{line_id, excerpt}], reason, uncertainty}]
  ranking_score numeric(5,1) not null,
  coverage int not null check (coverage between 0 and 100),
  evidenced_score numeric(5,1),
  role_requirements jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (applicant_id, role)
);

create table if not exists public.briefs (
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  role text not null check (role in ('PM', 'SPM')),
  sentences jsonb not null check (jsonb_array_length(sentences) = 3),
  generated_by text not null,
  rubric_version text not null,
  created_at timestamptz not null default now(),
  primary key (applicant_id, role)
);

create table if not exists public.email_drafts (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  type text not null check (type in ('invite', 'rejection')),
  subject text not null,
  body text not null, -- contains {{first_name}}; the real name is merged on the server at send time
  edited boolean not null default false,
  generated_by text not null,
  status text not null default 'draft' check (status in ('draft', 'sending', 'accepted', 'delivered', 'failed')),
  updated_at timestamptz not null default now(),
  unique (applicant_id, type)
);

create table if not exists public.decisions (
  applicant_id uuid primary key references public.applicants(id) on delete cascade,
  decision text not null check (decision in ('undecided', 'reviewing', 'hold', 'invite', 'reject')),
  note text not null default '',
  decided_at timestamptz not null default now()
);

create table if not exists public.email_sends (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.email_drafts(id) on delete restrict,
  applicant_id uuid not null references public.applicants(id) on delete restrict,
  idempotency_key text not null unique,
  mode text not null check (mode in ('test', 'simulated')),
  to_address text not null,
  candidate_address text,
  subject text not null,
  status text not null check (status in ('sending', 'accepted', 'delivered', 'failed', 'bounced')),
  provider_message_id text unique,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one in-flight or successful send per applicant. Failed sends can be retried.
create unique index if not exists email_sends_one_active_per_applicant
  on public.email_sends (applicant_id) where status in ('sending', 'accepted', 'delivered');

-- Row Level Security ----------------------------------------------------------
alter table public.reviewers enable row level security;
alter table public.rubric_versions enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.applicants enable row level security;
alter table public.applicant_pii enable row level security;
alter table public.evaluations enable row level security;
alter table public.briefs enable row level security;
alter table public.email_drafts enable row level security;
alter table public.decisions enable row level security;
alter table public.email_sends enable row level security;

create policy "reviewers read rubric versions" on public.rubric_versions for select to authenticated using (public.is_reviewer());
create policy "reviewers read rubric criteria" on public.rubric_criteria for select to authenticated using (public.is_reviewer());
create policy "reviewers read applicants" on public.applicants for select to authenticated using (public.is_reviewer());
create policy "reviewers read evaluations" on public.evaluations for select to authenticated using (public.is_reviewer());
create policy "reviewers read briefs" on public.briefs for select to authenticated using (public.is_reviewer());
create policy "reviewers read drafts" on public.email_drafts for select to authenticated using (public.is_reviewer());
create policy "reviewers read decisions" on public.decisions for select to authenticated using (public.is_reviewer());
create policy "reviewers read sends" on public.email_sends for select to authenticated using (public.is_reviewer());
-- No policies on applicant_pii or reviewers: anon and authenticated roles cannot read them.

revoke all on public.applicant_pii from anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon, authenticated;

-- Private storage for original CV files --------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-files', 'cv-files', false, 8388608,
        array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'])
on conflict (id) do update set public = false;
-- No storage policies: only the service role can read or write CV files.
