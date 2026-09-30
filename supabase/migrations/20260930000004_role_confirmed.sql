-- false when the CV and upload did not say which role the person applied for.
-- Such applicants are scored against both rubrics but not ranked until the founder picks a role.
alter table public.applicants add column if not exists role_confirmed boolean not null default true;
