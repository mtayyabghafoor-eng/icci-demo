-- 0022: Policies and versions (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1, slice P2.5).
-- Owner's choices, 16 Nov 2026 (both recommended answers):
--   * Publishing a version is an approval, so a different admin must publish
--     it: nobody publishes a version they uploaded or last changed.
--   * The next review date is required. The screen suggests one year after
--     the approval date; the admin can change it (up to five years).
-- And from the plan:
--   * A policy has a title, an owner (a person from the directory) and the
--     person roles that must sign it. Policies are switched off, never deleted.
--   * Each version has a label (for example "v2"), a PDF, an approval date
--     and a next review date. It starts as a draft, which can be changed.
--     Publishing is one step, and a published version can never be changed.
--     One draft at a time per policy. The newest published version is the
--     "current" one (view policies_overview).
--   * PDFs live in a private file store, "policy-files": PDF only, up to
--     10 MB, add and view only, never replaced or deleted.
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing. Sign-offs come in slice P2.6.

-- ---------------------------------------------------------------------------
-- The file store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('policy-files', 'policy-files', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;

create policy policy_files_read on storage.objects for select to authenticated
  using (bucket_id = 'policy-files' and (select private.has_role('super_admin', 'centre_admin')));
create policy policy_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'policy-files' and (select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
create table public.policies (
  id              uuid primary key default gen_random_uuid(),
  title           text not null check (length(trim(title)) between 1 and 150),
  owner_person_id uuid not null references public.people (id),
  active          boolean not null default true,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now()
);
call private.add_standard_safeguards('policies', 'id');
create unique index policies_unique_title on public.policies (lower(trim(title)));
create index policies_owner on public.policies (owner_person_id);

create function private.check_policy() returns trigger
language plpgsql set search_path = '' as $$
declare
  owner_active boolean;
begin
  new.title := regexp_replace(trim(new.title), '\s+', ' ', 'g');
  if tg_op = 'INSERT' or new.owner_person_id is distinct from old.owner_person_id then
    select p.active into owner_active from public.people p where p.id = new.owner_person_id;
    if owner_active is null then
      raise exception 'The owner must be a person in the people directory.';
    end if;
    if not owner_active then
      raise exception 'The owner is switched off. Pick someone who is switched on.';
    end if;
  end if;
  return new;
end $$;

create trigger check_policy before insert or update on public.policies
  for each row execute function private.check_policy();

-- ---------------------------------------------------------------------------
-- "Everyone with this person role must sign this policy."
create table public.policy_required_roles (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid not null references public.policies (id),
  person_role_id uuid not null references public.person_roles (id),
  active         boolean not null default true,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  constraint policy_required_roles_once unique (policy_id, person_role_id)
);
call private.add_standard_safeguards('policy_required_roles', 'id');
create index policy_required_roles_role on public.policy_required_roles (person_role_id);

create function private.check_policy_required_role() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.policy_id is distinct from old.policy_id or new.person_role_id is distinct from old.person_role_id) then
    raise exception 'A required role can only be switched on or off.';
  end if;
  return new;
end $$;

create trigger check_policy_required_role before insert or update on public.policy_required_roles
  for each row execute function private.check_policy_required_role();

-- ---------------------------------------------------------------------------
create table public.policy_versions (
  id             uuid primary key default gen_random_uuid(),
  policy_id      uuid not null references public.policies (id),
  version_label  text not null check (length(trim(version_label)) between 1 and 20),
  file_path      text not null check (file_path ~ '^policies/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'),
  approved_on    date not null,
  next_review_on date not null,
  status         text not null default 'draft' check (status in ('draft', 'published')),
  published_by   uuid references auth.users (id),
  published_at   timestamptz,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now(),
  constraint policy_versions_review_after check (next_review_on > approved_on),
  constraint policy_versions_published_complete check (
    (status = 'draft' and published_by is null and published_at is null)
    or (status = 'published' and published_by is not null and published_at is not null)
  )
);
call private.add_standard_safeguards('policy_versions', 'id');
create unique index policy_versions_unique_label on public.policy_versions (policy_id, lower(trim(version_label)));
create unique index policy_versions_one_draft on public.policy_versions (policy_id) where status = 'draft';
create index policy_versions_current on public.policy_versions (policy_id, published_at desc) where status = 'published';

-- Whether a PDF is really in the file store (the admin may not see the
-- storage table directly, so this looks as the database owner).
create function private.policy_file_exists(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'policy-files' and o.name = p_path)
$$;
revoke all on function private.policy_file_exists(text) from public, anon;

create function private.check_policy_version() returns trigger
language plpgsql set search_path = '' as $$
declare
  pol public.policies%rowtype;
begin
  select * into pol from public.policies x where x.id = coalesce(new.policy_id, old.policy_id);

  if tg_op = 'UPDATE' then
    if old.status = 'published' then
      raise exception 'A published version can never be changed. Upload a new version instead.';
    end if;
    if new.policy_id is distinct from old.policy_id then
      raise exception 'A version cannot be moved to another policy.';
    end if;

    if new.status = 'published' then
      -- Publishing: one step, by a different admin, with nothing else changed.
      if new.version_label is distinct from old.version_label or new.file_path is distinct from old.file_path
         or new.approved_on is distinct from old.approved_on or new.next_review_on is distinct from old.next_review_on then
        raise exception 'Publishing cannot change the version. Save the changes first, then another admin publishes.';
      end if;
      if auth.uid() is null then
        raise exception 'A version must be published by a signed-in admin.';
      end if;
      if auth.uid() = old.created_by or auth.uid() = old.updated_by then
        raise exception 'A different admin must publish this version. Nobody can publish a version they uploaded or last changed.';
      end if;
      if not pol.active then
        raise exception 'This policy is switched off. Switch it back on to publish.';
      end if;
      if old.next_review_on <= private.today_in_dublin() then
        raise exception 'The next review date has already passed. Change the draft before publishing.';
      end if;
      new.published_by := auth.uid();
      new.published_at := now();
      return new;
    end if;
  end if;

  -- A new draft, or a change to a draft.
  if pol.id is null then
    raise exception 'That policy could not be found.';
  end if;
  if new.status <> 'draft' or new.published_by is not null or new.published_at is not null then
    raise exception 'A new version starts as a draft. Another admin publishes it.';
  end if;
  if not pol.active then
    raise exception 'This policy is switched off. Switch it back on to add or change a version.';
  end if;
  new.version_label := regexp_replace(trim(new.version_label), '\s+', ' ', 'g');
  if new.approved_on > private.today_in_dublin() then
    raise exception 'The approval date cannot be in the future.';
  end if;
  if new.next_review_on <= new.approved_on then
    raise exception 'The next review date must be after the approval date.';
  end if;
  if new.next_review_on > (new.approved_on + interval '5 years')::date then
    raise exception 'The next review date cannot be more than 5 years after the approval date.';
  end if;
  if tg_op = 'INSERT' or new.file_path is distinct from old.file_path then
    if new.file_path not like 'policies/' || new.policy_id::text || '/%' then
      raise exception 'That PDF belongs to a different policy.';
    end if;
    if not private.policy_file_exists(new.file_path) then
      raise exception 'The PDF could not be found. Please upload it again.';
    end if;
  end if;
  return new;
end $$;

-- Runs before the "stamp_record" trigger (triggers run in name order), so
-- old.updated_by is still the last admin who changed the draft.
create trigger check_policy_version before insert or update on public.policy_versions
  for each row execute function private.check_policy_version();

revoke all on function private.check_policy() from public, anon;
revoke all on function private.check_policy_required_role() from public, anon;
revoke all on function private.check_policy_version() from public, anon;

-- ---------------------------------------------------------------------------
-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy policies_read on public.policies for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy policies_add on public.policies for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy policies_change on public.policies for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy policy_required_roles_read on public.policy_required_roles for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy policy_required_roles_add on public.policy_required_roles for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy policy_required_roles_change on public.policy_required_roles for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy policy_versions_read on public.policy_versions for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy policy_versions_add on public.policy_versions for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy policy_versions_change on public.policy_versions for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- One row per policy: its current (newest published) version, whether a
-- draft is waiting, the review status worked out from today, and how many
-- switched-on people must sign it. The reader's own access rules apply.
create view public.policies_overview with (security_invoker = true) as
select
  p.id,
  p.title,
  p.owner_person_id,
  p.active,
  cur.id             as current_version_id,
  cur.version_label  as current_label,
  cur.approved_on,
  cur.next_review_on,
  cur.published_at,
  exists (select 1 from public.policy_versions d where d.policy_id = p.id and d.status = 'draft') as has_draft,
  case
    when cur.id is null then 'none'
    when cur.next_review_on < t.today then 'overdue'
    when cur.next_review_on <= t.today + 60 then 'due'
    else 'ok'
  end                as review_status,
  (select count(*)::int
     from public.people x
     join public.policy_required_roles r on r.person_role_id = x.person_role_id and r.policy_id = p.id and r.active
    where x.active) as must_sign
from public.policies p
cross join (select private.today_in_dublin() as today) t
left join lateral (
  select v.id, v.version_label, v.approved_on, v.next_review_on, v.published_at
  from public.policy_versions v
  where v.policy_id = p.id and v.status = 'published'
  order by v.published_at desc, v.id desc
  limit 1
) cur on true;

revoke all on public.policies_overview from public, anon, authenticated, service_role;
grant select on public.policies_overview to authenticated, service_role;
