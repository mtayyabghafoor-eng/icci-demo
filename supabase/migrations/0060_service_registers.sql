-- 0060: Service registers (PLAN.md 5.6; docs/PHASE-6.md, slice P6.1).
-- Owner's choices, 28 Nov 2026 (every recommended answer):
--   * Three registers: funerals, Shahada and Nikah. Super Admin only: no
--     other role, and no signed-out visitor, can read, add or change an entry.
--   * Funeral: the name of the person who died, the date, one family contact
--     (name, optional phone), the services (ghusl, kafan, janazah prayer,
--     family room; at least one) and who was on duty (one to ten people from
--     the people directory). No age, date of birth, cause of death, address
--     or burial details.
--   * Shahada: the person's name as they wish it written, the date, the
--     authenticating imam (from People), up to two witnesses (typed), and a
--     tick that the person is 18 or over. No former name, no contact details.
--   * Nikah: the names of the two spouses, the date, the officiant (from
--     People), two witnesses (typed), the wali if any (typed), whether it was
--     also registered as a civil marriage (yes, no, not known), and a tick
--     that both are 18 or over. No mahr, addresses or identity details.
--   * No notes box anywhere (it invites medical or immigration details).
--   * Each entry gets a number the database hands out, never typed, never
--     repeated and never reused, even when an entry is cancelled:
--     FU-2026-0001, SH-2026-0001, NK-2026-0001 (the year of the service date).
--   * An entry is never changed. A mistake is corrected with a new version
--     that points to the one it replaces and says why; the old version stays,
--     and the number stays the same. Only the newest version can be
--     corrected. An entry can be cancelled once, with a reason (for example
--     "entered twice"); a cancelled entry cannot be corrected. No approval
--     step: only the Super Admin can see the registers.
--   * Not on Home, in the search box, in reminders or in any export.

-- ---------------------------------------------------------------------------
-- Number counters, one per register and year. Read and moved on only by
-- private.next_register_number(), which refuses anyone but a Super Admin.
create table private.register_counters (
  register    text not null check (register in ('FU', 'SH', 'NK')),
  year        integer not null check (year between 1900 and 2200),
  last_number integer not null check (last_number > 0),
  primary key (register, year)
);
revoke all on private.register_counters from public, anon, authenticated;

create function private.next_register_number(p_register text, p_year integer) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  n integer;
begin
  if not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can add to the service registers.' using errcode = '42501';
  end if;
  insert into private.register_counters as c (register, year, last_number)
  values (p_register, p_year, 1)
  on conflict (register, year) do update set last_number = c.last_number + 1
  returning c.last_number into n;
  return p_register || '-' || p_year::text || '-' || lpad(n::text, 4, '0');
end $$;
revoke all on function private.next_register_number(text, integer) from public, anon;
grant execute on function private.next_register_number(text, integer) to authenticated, service_role;

-- Tidies typed words: trims, and runs of spaces become one. Empty is null.
create function private.tidy_words(p text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(trim(coalesce(p, '')), '\s+', ' ', 'g'), '')
$$;
revoke all on function private.tidy_words(text) from public, anon;
grant execute on function private.tidy_words(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The three tables share their bookkeeping columns:
--   number            given by the database (same for every version)
--   first_id          the first version's id (the entry's lasting address)
--   corrects_id       the version this one replaces (null for the first)
--   correction_reason why it was corrected (only on a correction)
--   cancelled_*       set once, with a reason
create table public.funeral_entries (
  id                   bigint generated always as identity primary key,
  number               text not null,
  first_id             bigint not null,
  corrects_id          bigint unique references public.funeral_entries (id),
  correction_reason    text check (length(correction_reason) between 1 and 500),
  service_date         date not null,
  deceased_name        text not null check (length(deceased_name) between 1 and 120),
  family_contact_name  text not null check (length(family_contact_name) between 1 and 120),
  family_contact_phone text check (
    family_contact_phone ~ '^\+?[0-9 ()-]+$'
    and length(regexp_replace(family_contact_phone, '[^0-9]', '', 'g')) between 6 and 20
  ),
  ghusl                boolean not null default false,
  kafan                boolean not null default false,
  janazah_prayer       boolean not null default false,
  family_room          boolean not null default false,
  on_duty_person_ids   uuid[] not null check (cardinality(on_duty_person_ids) between 1 and 10),
  cancelled_at         timestamptz,
  cancelled_by         uuid references auth.users (id),
  cancelled_reason     text check (length(cancelled_reason) between 1 and 500),
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  constraint funeral_entries_number check (number ~ '^FU-[0-9]{4}-[0-9]{4,}$'),
  constraint funeral_entries_some_service check (ghusl or kafan or janazah_prayer or family_room),
  constraint funeral_entries_correction check ((corrects_id is null) = (correction_reason is null)),
  constraint funeral_entries_cancel_complete check (num_nonnulls(cancelled_at, cancelled_by, cancelled_reason) in (0, 3))
);

create table public.shahada_entries (
  id                   bigint generated always as identity primary key,
  number               text not null,
  first_id             bigint not null,
  corrects_id          bigint unique references public.shahada_entries (id),
  correction_reason    text check (length(correction_reason) between 1 and 500),
  service_date         date not null,
  person_name          text not null check (length(person_name) between 1 and 120),
  imam_person_id       uuid not null references public.people (id),
  witness_1            text check (length(witness_1) between 1 and 120),
  witness_2            text check (length(witness_2) between 1 and 120),
  adult_confirmed      boolean not null check (adult_confirmed),
  cancelled_at         timestamptz,
  cancelled_by         uuid references auth.users (id),
  cancelled_reason     text check (length(cancelled_reason) between 1 and 500),
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  constraint shahada_entries_number check (number ~ '^SH-[0-9]{4}-[0-9]{4,}$'),
  constraint shahada_entries_witness_order check (witness_2 is null or witness_1 is not null),
  constraint shahada_entries_correction check ((corrects_id is null) = (correction_reason is null)),
  constraint shahada_entries_cancel_complete check (num_nonnulls(cancelled_at, cancelled_by, cancelled_reason) in (0, 3))
);

create table public.nikah_entries (
  id                   bigint generated always as identity primary key,
  number               text not null,
  first_id             bigint not null,
  corrects_id          bigint unique references public.nikah_entries (id),
  correction_reason    text check (length(correction_reason) between 1 and 500),
  service_date         date not null,
  spouse_1_name        text not null check (length(spouse_1_name) between 1 and 120),
  spouse_2_name        text not null check (length(spouse_2_name) between 1 and 120),
  officiant_person_id  uuid not null references public.people (id),
  witness_1            text not null check (length(witness_1) between 1 and 120),
  witness_2            text not null check (length(witness_2) between 1 and 120),
  wali_name            text check (length(wali_name) between 1 and 120),
  civil_registration   text not null default 'unknown' check (civil_registration in ('yes', 'no', 'unknown')),
  adults_confirmed     boolean not null check (adults_confirmed),
  cancelled_at         timestamptz,
  cancelled_by         uuid references auth.users (id),
  cancelled_reason     text check (length(cancelled_reason) between 1 and 500),
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  constraint nikah_entries_number check (number ~ '^NK-[0-9]{4}-[0-9]{4,}$'),
  constraint nikah_entries_correction check ((corrects_id is null) = (correction_reason is null)),
  constraint nikah_entries_cancel_complete check (num_nonnulls(cancelled_at, cancelled_by, cancelled_reason) in (0, 3))
);

call private.add_standard_safeguards('funeral_entries', 'id');
call private.add_standard_safeguards('shahada_entries', 'id');
call private.add_standard_safeguards('nikah_entries', 'id');

-- A number belongs to one entry only: its first version holds it.
create unique index funeral_entries_one_number on public.funeral_entries (number) where corrects_id is null;
create unique index shahada_entries_one_number on public.shahada_entries (number) where corrects_id is null;
create unique index nikah_entries_one_number on public.nikah_entries (number) where corrects_id is null;
create index funeral_entries_by_entry on public.funeral_entries (first_id, id);
create index shahada_entries_by_entry on public.shahada_entries (first_id, id);
create index nikah_entries_by_entry on public.nikah_entries (first_id, id);
create index funeral_entries_by_date on public.funeral_entries (service_date desc, id desc);
create index shahada_entries_by_date on public.shahada_entries (service_date desc, id desc);
create index nikah_entries_by_date on public.nikah_entries (service_date desc, id desc);

-- ---------------------------------------------------------------------------
-- The rules every register shares (tg_argv[0] is its number prefix).
-- Named "check_a_..." so it runs before the register's own check.
create function private.check_register_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  prior jsonb;
  newer boolean;
  bookkeeping constant text[] := array['cancelled_at', 'cancelled_by', 'cancelled_reason', 'updated_by', 'updated_at'];
begin
  if tg_op = 'INSERT' then
    if auth.uid() is null or not private.has_role('super_admin') then
      raise exception 'Only a Super Admin can add to the service registers.' using errcode = '42501';
    end if;
    if new.cancelled_at is not null or new.cancelled_by is not null or new.cancelled_reason is not null then
      raise exception 'A new entry cannot already be cancelled.';
    end if;
    if new.service_date > private.today_in_dublin() then
      raise exception 'The date cannot be in the future.';
    end if;
    if new.service_date < date '1950-01-01' then
      raise exception 'The date must be in 1950 or later.';
    end if;
    if new.corrects_id is null then
      new.correction_reason := null;
      new.first_id := new.id;
      new.number := private.next_register_number(tg_argv[0], extract(year from new.service_date)::integer);
    else
      new.correction_reason := private.tidy_words(new.correction_reason);
      if new.correction_reason is null then
        raise exception 'A correction needs a reason.';
      end if;
      -- Wait for anyone else correcting or cancelling the same version.
      execute format('select to_jsonb(x) from public.%I x where x.id = $1 for update', tg_table_name)
        into prior using new.corrects_id;
      if prior is null then
        raise exception 'The entry being corrected could not be found.';
      end if;
      if prior ->> 'cancelled_at' is not null then
        raise exception 'This entry is cancelled. A cancelled entry cannot be corrected.';
      end if;
      execute format('select exists (select 1 from public.%I x where x.corrects_id = $1)', tg_table_name)
        into newer using new.corrects_id;
      if newer then
        raise exception 'This version has already been corrected. Correct the newest version.';
      end if;
      new.first_id := (prior ->> 'first_id')::bigint;
      new.number := prior ->> 'number';
    end if;
    return new;
  end if;

  -- UPDATE: only cancelling an entry, once, with a reason.
  if old.cancelled_at is not null then
    raise exception 'This entry is already cancelled. Nothing more can change.';
  end if;
  if (to_jsonb(new) - bookkeeping) is distinct from (to_jsonb(old) - bookkeeping) then
    raise exception 'Register entries cannot be changed. Correct the entry instead: a new version is kept beside the old one.';
  end if;
  if auth.uid() is null or not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can cancel a register entry.' using errcode = '42501';
  end if;
  execute format('select exists (select 1 from public.%I x where x.corrects_id = $1)', tg_table_name)
    into newer using old.id;
  if newer then
    raise exception 'This version has been corrected. Cancel the newest version.';
  end if;
  new.cancelled_reason := private.tidy_words(new.cancelled_reason);
  if new.cancelled_reason is null then
    raise exception 'Cancelling an entry needs a reason.';
  end if;
  new.cancelled_by := auth.uid();
  new.cancelled_at := now();
  return new;
end $$;
revoke all on function private.check_register_entry() from public, anon;

create trigger check_a_register before insert or update on public.funeral_entries
  for each row execute function private.check_register_entry('FU');
create trigger check_a_register before insert or update on public.shahada_entries
  for each row execute function private.check_register_entry('SH');
create trigger check_a_register before insert or update on public.nikah_entries
  for each row execute function private.check_register_entry('NK');

-- A person picked from People must be there and switched on. A correction
-- may keep the person its earlier version had, even if switched off since.
create function private.check_register_person(p_person uuid, p_kept boolean, p_what text) returns void
language plpgsql stable set search_path = '' as $$
declare
  is_on boolean;
begin
  select p.active into is_on from public.people p where p.id = p_person;
  if is_on is null then
    raise exception '% must be a person in the people directory.', p_what;
  end if;
  if not is_on and not coalesce(p_kept, false) then
    raise exception '% is switched off. Pick someone who is switched on.', p_what;
  end if;
end $$;
revoke all on function private.check_register_person(uuid, boolean, text) from public, anon;
grant execute on function private.check_register_person(uuid, boolean, text) to authenticated, service_role;

create function private.check_funeral_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  kept uuid[] := '{}';
  pid uuid;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  new.deceased_name := private.tidy_words(new.deceased_name);
  new.family_contact_name := private.tidy_words(new.family_contact_name);
  new.family_contact_phone := private.tidy_words(new.family_contact_phone);
  if new.corrects_id is not null then
    select f.on_duty_person_ids into kept from public.funeral_entries f where f.id = new.corrects_id;
  end if;
  if (select count(distinct x) from unnest(new.on_duty_person_ids) x) <> cardinality(new.on_duty_person_ids) then
    raise exception 'Each person on duty is listed once.';
  end if;
  foreach pid in array new.on_duty_person_ids loop
    perform private.check_register_person(pid, pid = any (coalesce(kept, '{}')), 'Everyone on duty');
  end loop;
  return new;
end $$;

create function private.check_shahada_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  kept uuid;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  new.person_name := private.tidy_words(new.person_name);
  new.witness_1 := private.tidy_words(new.witness_1);
  new.witness_2 := private.tidy_words(new.witness_2);
  if new.witness_1 is null and new.witness_2 is not null then
    new.witness_1 := new.witness_2;
    new.witness_2 := null;
  end if;
  if new.corrects_id is not null then
    select s.imam_person_id into kept from public.shahada_entries s where s.id = new.corrects_id;
  end if;
  perform private.check_register_person(new.imam_person_id, new.imam_person_id = kept, 'The imam');
  return new;
end $$;

create function private.check_nikah_entry() returns trigger
language plpgsql set search_path = '' as $$
declare
  kept uuid;
begin
  if tg_op = 'UPDATE' then
    return new;
  end if;
  new.spouse_1_name := private.tidy_words(new.spouse_1_name);
  new.spouse_2_name := private.tidy_words(new.spouse_2_name);
  new.witness_1 := private.tidy_words(new.witness_1);
  new.witness_2 := private.tidy_words(new.witness_2);
  new.wali_name := private.tidy_words(new.wali_name);
  if new.corrects_id is not null then
    select n.officiant_person_id into kept from public.nikah_entries n where n.id = new.corrects_id;
  end if;
  perform private.check_register_person(new.officiant_person_id, new.officiant_person_id = kept, 'The officiant');
  return new;
end $$;

revoke all on function private.check_funeral_entry() from public, anon;
revoke all on function private.check_shahada_entry() from public, anon;
revoke all on function private.check_nikah_entry() from public, anon;

create trigger check_b_funeral before insert or update on public.funeral_entries
  for each row execute function private.check_funeral_entry();
create trigger check_b_shahada before insert or update on public.shahada_entries
  for each row execute function private.check_shahada_entry();
create trigger check_b_nikah before insert or update on public.nikah_entries
  for each row execute function private.check_nikah_entry();

-- ---------------------------------------------------------------------------
-- Access: Super Admin only. No delete (standard safeguards).
create policy funeral_entries_read on public.funeral_entries for select to authenticated
  using ((select private.has_role('super_admin')));
create policy funeral_entries_add on public.funeral_entries for insert to authenticated
  with check ((select private.has_role('super_admin')));
create policy funeral_entries_cancel on public.funeral_entries for update to authenticated
  using ((select private.has_role('super_admin')))
  with check ((select private.has_role('super_admin')));

create policy shahada_entries_read on public.shahada_entries for select to authenticated
  using ((select private.has_role('super_admin')));
create policy shahada_entries_add on public.shahada_entries for insert to authenticated
  with check ((select private.has_role('super_admin')));
create policy shahada_entries_cancel on public.shahada_entries for update to authenticated
  using ((select private.has_role('super_admin')))
  with check ((select private.has_role('super_admin')));

create policy nikah_entries_read on public.nikah_entries for select to authenticated
  using ((select private.has_role('super_admin')));
create policy nikah_entries_add on public.nikah_entries for insert to authenticated
  with check ((select private.has_role('super_admin')));
create policy nikah_entries_cancel on public.nikah_entries for update to authenticated
  using ((select private.has_role('super_admin')))
  with check ((select private.has_role('super_admin')));

-- ---------------------------------------------------------------------------
-- The current version of each entry (the newest), with how many versions it
-- has and its first version's date of recording. The reader's own access
-- rules apply, so only a Super Admin sees any row.
create view public.funeral_register with (security_invoker = true) as
select e.*,
       (select count(*)::integer from public.funeral_entries v where v.first_id = e.first_id) as versions,
       (select f.created_at from public.funeral_entries f where f.id = e.first_id) as first_recorded_at
from public.funeral_entries e
where not exists (select 1 from public.funeral_entries n where n.corrects_id = e.id);

create view public.shahada_register with (security_invoker = true) as
select e.*,
       (select count(*)::integer from public.shahada_entries v where v.first_id = e.first_id) as versions,
       (select f.created_at from public.shahada_entries f where f.id = e.first_id) as first_recorded_at
from public.shahada_entries e
where not exists (select 1 from public.shahada_entries n where n.corrects_id = e.id);

create view public.nikah_register with (security_invoker = true) as
select e.*,
       (select count(*)::integer from public.nikah_entries v where v.first_id = e.first_id) as versions,
       (select f.created_at from public.nikah_entries f where f.id = e.first_id) as first_recorded_at
from public.nikah_entries e
where not exists (select 1 from public.nikah_entries n where n.corrects_id = e.id);

revoke all on public.funeral_register, public.shahada_register, public.nikah_register from public, anon, authenticated, service_role;
grant select on public.funeral_register, public.shahada_register, public.nikah_register to authenticated, service_role;
