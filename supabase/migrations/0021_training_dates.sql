-- 0021: Training dates (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1, slice P2.4).
-- Owner's choices, 16 Nov 2026 (all recommended answers):
--   * Training types are a list that can grow (add, rename, switch off).
--     Each type may have a usual length in whole years (1 to 10); the screen
--     uses it to fill in the expiry, and the admin can change it or leave it
--     empty (no expiry).
--   * One row per course completed: person, type, date done, optional
--     expiry. Never typed over or deleted. A wrong entry is withdrawn with a
--     reason (who and when are filled in by the database).
--   * The status is worked out from today's date (in Dublin) every time it
--     is read (view people_training): valid, due (60 days or fewer left),
--     expired, or no_expiry. The newest course of each type counts.
--   * Only recorded training is shown: no "required training" rules yet,
--     and no home page counter.
--   * One admin is enough, but nobody records or withdraws training for
--     the person linked to their own account. Switched-off people and
--     switched-off types get no new entries (withdrawing still works).
--   * Dates only: no certificate, provider or file.
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing.

create table public.training_types (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 100),
  usual_years integer check (usual_years between 1 and 10),
  active      boolean not null default true,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
call private.add_standard_safeguards('training_types', 'id');
create unique index training_types_unique_name on public.training_types (lower(trim(name)));

-- Starting list (docs/PHASE-2-AND-3.md 4.1). The usual lengths are a
-- starting guess; an admin can change them on the Training types screen.
insert into public.training_types (name, usual_years) values
  ('Fire safety', 1), ('First aid', 2), ('Safeguarding awareness', 3), ('Manual handling', 3);

create table public.training_records (
  id               bigint generated always as identity primary key,
  person_id        uuid not null references public.people (id),
  training_type_id uuid not null references public.training_types (id),
  completed_on     date not null,
  expires_on       date,
  withdrawn_at     timestamptz,
  withdrawn_by     uuid references auth.users (id),
  withdrawn_reason text check (length(withdrawn_reason) between 1 and 500),
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  constraint training_expiry_after check (expires_on is null or expires_on > completed_on),
  constraint training_withdrawn_complete check (
    num_nonnulls(withdrawn_at, withdrawn_by, withdrawn_reason) in (0, 3)
  )
);
call private.add_standard_safeguards('training_records', 'id');
create index training_records_person on public.training_records (person_id, training_type_id, completed_on desc, id desc);
create index training_records_type on public.training_records (training_type_id);

create function private.check_training_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.people%rowtype;
  t public.training_types%rowtype;
begin
  select * into p from public.people x where x.id = coalesce(new.person_id, old.person_id);

  if tg_op = 'INSERT' then
    select * into t from public.training_types x where x.id = new.training_type_id;
    if p.id is null then
      raise exception 'That person is not in the people directory.';
    end if;
    if t.id is null then
      raise exception 'That training type is not on the list.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_by is not null or new.withdrawn_reason is not null then
      raise exception 'A new entry cannot already be withdrawn.';
    end if;
    if auth.uid() is not null and p.app_user_id = auth.uid() then
      raise exception 'You cannot record your own training. Ask another admin.';
    end if;
    if not p.active then
      raise exception 'This person is switched off. Switch them back on to record training.';
    end if;
    if not t.active then
      raise exception 'That training type is switched off. Pick another, or switch it back on.';
    end if;
    if new.completed_on > private.today_in_dublin() then
      raise exception 'The date cannot be in the future.';
    end if;
    if new.expires_on is not null then
      if new.expires_on <= new.completed_on then
        raise exception 'The expiry date must be after the date the training was done.';
      end if;
      if new.expires_on > (new.completed_on + interval '10 years')::date then
        raise exception 'The expiry date cannot be more than 10 years after the training.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: only withdrawing an entry, once, with a reason.
  if old.withdrawn_at is not null then
    raise exception 'This entry is already withdrawn. Nothing more can change.';
  end if;
  if new.person_id is distinct from old.person_id or new.training_type_id is distinct from old.training_type_id
     or new.completed_on is distinct from old.completed_on or new.expires_on is distinct from old.expires_on then
    raise exception 'Training entries cannot be changed. Withdraw the wrong one and record a new one.';
  end if;
  if auth.uid() is null then
    raise exception 'An entry must be withdrawn by a signed-in admin.';
  end if;
  if p.app_user_id = auth.uid() then
    raise exception 'You cannot withdraw your own training. Ask another admin.';
  end if;
  new.withdrawn_reason := nullif(regexp_replace(trim(coalesce(new.withdrawn_reason, '')), '\s+', ' ', 'g'), '');
  if new.withdrawn_reason is null then
    raise exception 'Withdrawing an entry needs a reason.';
  end if;
  new.withdrawn_by := auth.uid();
  new.withdrawn_at := now();
  return new;
end $$;

create trigger training_check before insert or update on public.training_records
  for each row execute function private.check_training_record();

revoke all on function private.check_training_record() from public, anon;

-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy training_types_read on public.training_types for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy training_types_add on public.training_types for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy training_types_change on public.training_types for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy training_records_read on public.training_records for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy training_records_add on public.training_records for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy training_records_withdraw on public.training_records for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- One row per person and training type they have on record (not withdrawn):
-- the newest course of that type, and its status worked out from today.
-- The reader's own access rules apply ("security invoker").
create view public.people_training with (security_invoker = true) as
select
  p.id                 as person_id,
  p.full_name,
  p.person_role_id,
  p.section_id,
  p.active,
  latest.training_type_id,
  latest.completed_on,
  latest.expires_on,
  case
    when latest.expires_on is null then 'no_expiry'
    when latest.expires_on < t.today then 'expired'
    when latest.expires_on <= t.today + 60 then 'due'
    else 'valid'
  end                  as status
from public.people p
cross join (select private.today_in_dublin() as today) t
join lateral (
  select distinct on (x.training_type_id) x.training_type_id, x.completed_on, x.expires_on
  from public.training_records x
  where x.person_id = p.id and x.withdrawn_at is null
  order by x.training_type_id, x.completed_on desc, x.id desc
) latest on true;

revoke all on public.people_training from public, anon, authenticated, service_role;
grant select on public.people_training to authenticated, service_role;
