-- Move the RLS helper out of the API-exposed public schema so it cannot be called via /rest/v1/rpc.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_reviewer() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.reviewers r where r.email = lower(coalesce(auth.jwt() ->> 'email', '')));
$$;
revoke all on function private.is_reviewer() from public, anon;
grant execute on function private.is_reviewer() to authenticated;

alter policy "reviewers read rubric versions" on public.rubric_versions using (private.is_reviewer());
alter policy "reviewers read rubric criteria" on public.rubric_criteria using (private.is_reviewer());
alter policy "reviewers read applicants" on public.applicants using (private.is_reviewer());
alter policy "reviewers read evaluations" on public.evaluations using (private.is_reviewer());
alter policy "reviewers read briefs" on public.briefs using (private.is_reviewer());
alter policy "reviewers read drafts" on public.email_drafts using (private.is_reviewer());
alter policy "reviewers read decisions" on public.decisions using (private.is_reviewer());
alter policy "reviewers read sends" on public.email_sends using (private.is_reviewer());

drop function public.is_reviewer();
