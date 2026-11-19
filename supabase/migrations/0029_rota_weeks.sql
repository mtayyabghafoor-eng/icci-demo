-- 0029: Rota weeks, assignments and warnings (docs/PHASE-2-AND-3.md 5.1, slice P3.2).
-- Owner's choices, 18 Nov 2026 (all recommended answers):
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing.
--   * One rota week per Monday, starting as a draft. A new week starts with
--     an empty slot for each switched-on prayer slot type every day, and the
--     Jumu'ah slot types on Friday. Shifts and on-call slots are added by
--     hand (templates come in P3.4). The status changes only by publishing
--     (P3.3).
--   * One person per slot; two people on one duty means the slot twice.
--   * Assignments are never typed over or deleted. Putting someone on a
--     slot, swapping them, or taking them off adds a new entry that replaces
--     the old one (the old one is marked removed, with who and when). A slot
--     can also be removed. This history lets P3.3 mark changes since
--     publishing.
--   * The database refuses a switched-off person, room or slot type, a day
--     outside the week, Jumu'ah slots on other days, a shift without start
--     and end times, and an end before the start (a night shift across
--     midnight is two slots).
--   * A week is locked once its Sunday has passed: signed-in admins can no
--     longer change it. (The master key, used only by the seed and tests,
--     can still record past weeks.)
--   * Warnings are worked out, never stored, and never block: the same
--     person on two overlapping duties on one day (a prayer duty lasts 30
--     minutes from its time, Jumu'ah 60), Garda vetting not valid on that
--     date when the slot or the person's role needs it, and a prayer slot
--     on a day with no prayer time entered.

-- "Has this week's Sunday passed?" (in Dublin).
create function private.rota_week_ended(p_week_start date) returns boolean
language sql stable set search_path = '' as $$
  select p_week_start + 6 < private.today_in_dublin()
$$;
revoke all on function private.rota_week_ended(date) from public, anon;
grant execute on function private.rota_week_ended(date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Weeks
create table public.rota_weeks (
  id         uuid primary key default gen_random_uuid(),
  week_start date not null unique check (week_start between date '2000-01-03' and date '2100-12-27'),
  status     text not null default 'draft' check (status in ('draft', 'published')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('rota_weeks', 'id');

create function private.check_rota_week() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.week_start is distinct from old.week_start then
      raise exception 'A rota week''s date cannot change.';
    end if;
    if new.status is distinct from old.status then
      raise exception 'A week''s status changes only by publishing it.';
    end if;
    return new;
  end if;
  if extract(isodow from new.week_start) <> 1 then
    raise exception 'A rota week starts on a Monday.';
  end if;
  if new.status <> 'draft' then
    raise exception 'A new rota week starts as a draft.';
  end if;
  if auth.uid() is not null and private.rota_week_ended(new.week_start) then
    raise exception 'That week has ended. Its rota can no longer be changed.';
  end if;
  return new;
end $$;
create trigger rota_week_check before insert or update on public.rota_weeks
  for each row execute function private.check_rota_week();
revoke all on function private.check_rota_week() from public, anon;

-- ---------------------------------------------------------------------------
-- Assignments
create table public.rota_assignments (
  id              bigint generated always as identity primary key,
  week_id         uuid not null references public.rota_weeks (id),
  assignment_date date not null,
  slot_type_id    uuid not null references public.rota_slot_types (id),
  location_id     uuid references public.locations (id),
  person_id       uuid references public.people (id),
  start_time      time,
  end_time        time,
  note            text check (length(note) between 1 and 200),
  replaces_id     bigint unique references public.rota_assignments (id),
  removed_at      timestamptz,
  removed_by      uuid references auth.users (id),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  constraint rota_times_both_or_neither check ((start_time is null) = (end_time is null)),
  constraint rota_end_after_start check (end_time is null or end_time > start_time)
);
call private.add_standard_safeguards('rota_assignments', 'id');
create index rota_assignments_week on public.rota_assignments (week_id, assignment_date);
create index rota_assignments_person on public.rota_assignments (person_id, assignment_date);

create function private.check_rota_assignment() returns trigger
language plpgsql set search_path = '' as $$
declare
  w  public.rota_weeks%rowtype;
  st public.rota_slot_types%rowtype;
  p  public.people%rowtype;
  l  public.locations%rowtype;
  o  public.rota_assignments%rowtype;
begin
  select * into w from public.rota_weeks x where x.id = coalesce(new.week_id, old.week_id);

  if tg_op = 'UPDATE' then
    -- Only removing an entry, once.
    if old.removed_at is not null then
      raise exception 'This slot was already removed or replaced. Reload the page.';
    end if;
    if (new.week_id, new.assignment_date, new.slot_type_id, new.location_id, new.person_id,
        new.start_time, new.end_time, new.note, new.replaces_id)
       is distinct from
       (old.week_id, old.assignment_date, old.slot_type_id, old.location_id, old.person_id,
        old.start_time, old.end_time, old.note, old.replaces_id) then
      raise exception 'Rota entries cannot be changed. Replace or remove them instead.';
    end if;
    if new.removed_at is null then
      raise exception 'Nothing to change.';
    end if;
    if auth.uid() is not null and private.rota_week_ended(w.week_start) then
      raise exception 'That week has ended. Its rota can no longer be changed.';
    end if;
    new.removed_at := now();
    new.removed_by := auth.uid();
    return new;
  end if;

  -- INSERT
  if w.id is null then
    raise exception 'That rota week does not exist.';
  end if;
  if auth.uid() is not null and private.rota_week_ended(w.week_start) then
    raise exception 'That week has ended. Its rota can no longer be changed.';
  end if;
  if new.removed_at is not null or new.removed_by is not null then
    raise exception 'A new slot cannot already be removed.';
  end if;
  if new.assignment_date is null or new.assignment_date < w.week_start or new.assignment_date > w.week_start + 6 then
    raise exception 'The day must be inside that week.';
  end if;

  select * into st from public.rota_slot_types x where x.id = new.slot_type_id;
  if st.id is null then
    raise exception 'That slot type is not on the list.';
  end if;
  if not st.active then
    raise exception 'That slot type is switched off. Switch it back on to use it.';
  end if;
  if st.slot_group = 'jumuah' and extract(isodow from new.assignment_date) <> 5 then
    raise exception 'Jumu''ah slots go only on a Friday.';
  end if;

  if st.slot_group in ('prayer', 'jumuah') then
    if new.start_time is not null or new.end_time is not null then
      raise exception 'Prayer slots take their time from Prayer times, so leave the times empty.';
    end if;
  elsif st.slot_group = 'shift' and (new.start_time is null or new.end_time is null) then
    raise exception 'A shift needs a start time and an end time.';
  elsif (new.start_time is null) <> (new.end_time is null) then
    raise exception 'Give both a start and an end time, or neither (on call all day).';
  end if;
  if new.end_time is not null and new.end_time <= new.start_time then
    raise exception 'The end time must be after the start time. A night shift across midnight is two slots.';
  end if;

  if new.person_id is not null then
    select * into p from public.people x where x.id = new.person_id;
    if p.id is null then
      raise exception 'That person is not in the people directory.';
    end if;
    if not p.active then
      raise exception 'This person is switched off. Switch them back on to put them on the rota.';
    end if;
  end if;

  if new.location_id is not null then
    select * into l from public.locations x where x.id = new.location_id;
    if l.id is null or l.kind not in ('building', 'room') then
      raise exception 'The place must be a building or a room.';
    end if;
    if not l.active then
      raise exception 'That place is switched off. Pick another.';
    end if;
  end if;

  new.note := nullif(regexp_replace(trim(coalesce(new.note, '')), '\s+', ' ', 'g'), '');

  if new.replaces_id is not null then
    select * into o from public.rota_assignments x where x.id = new.replaces_id;
    if o.id is null or o.week_id <> new.week_id or o.assignment_date <> new.assignment_date
       or o.slot_type_id <> new.slot_type_id then
      raise exception 'A replacement must be for the same slot on the same day.';
    end if;
    if o.removed_at is not null then
      raise exception 'This slot was already removed or replaced. Reload the page.';
    end if;
  end if;
  return new;
end $$;
create trigger rota_assignment_check before insert or update on public.rota_assignments
  for each row execute function private.check_rota_assignment();
revoke all on function private.check_rota_assignment() from public, anon;

-- A replacement marks the entry it replaces as removed (same who and when).
create function private.rota_mark_replaced() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.rota_assignments set removed_at = now() where id = new.replaces_id;
  return null;
end $$;
create trigger rota_assignment_replaced after insert on public.rota_assignments
  for each row when (new.replaces_id is not null) execute function private.rota_mark_replaced();
revoke all on function private.rota_mark_replaced() from public, anon;

-- A new week starts with an empty slot for each switched-on prayer slot type
-- every day, and each Jumu'ah slot type on Friday.
create function private.rota_week_fill_prayers() returns trigger
language plpgsql set search_path = '' as $$
begin
  insert into public.rota_assignments (week_id, assignment_date, slot_type_id)
  select new.id, new.week_start + d, st.id
  from generate_series(0, 6) d
  join public.rota_slot_types st on st.active
   and (st.slot_group = 'prayer' or (st.slot_group = 'jumuah' and d = 4))
  order by d, st.slot_group desc, st.display_order;
  return null;
end $$;
create trigger rota_week_filled after insert on public.rota_weeks
  for each row execute function private.rota_week_fill_prayers();
revoke all on function private.rota_week_fill_prayers() from public, anon;

-- Put a person on a slot, swap them, or take them off (p_person_id null):
-- adds a new entry replacing the old one. Runs as the signed-in admin, so
-- the access rules below apply. Returns the new entry's number (or the same
-- one when nothing changes).
create function public.assign_rota_person(p_assignment_id bigint, p_person_id uuid) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  o      public.rota_assignments%rowtype;
  new_id bigint;
begin
  if not (select private.has_role('super_admin', 'centre_admin')) then
    raise exception 'Your account is not allowed to do this.' using errcode = '42501';
  end if;
  select * into o from public.rota_assignments x where x.id = p_assignment_id for update;
  if not found then
    raise exception 'That slot is not on the rota.' using errcode = '22023';
  end if;
  if o.removed_at is not null then
    raise exception 'This slot was already removed or replaced. Reload the page.' using errcode = '22023';
  end if;
  if o.person_id is not distinct from p_person_id then
    return o.id;
  end if;
  insert into public.rota_assignments (week_id, assignment_date, slot_type_id, location_id, person_id, start_time, end_time, note, replaces_id)
  values (o.week_id, o.assignment_date, o.slot_type_id, o.location_id, p_person_id, o.start_time, o.end_time, o.note, o.id)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.assign_rota_person(bigint, uuid) from public, anon;
grant execute on function public.assign_rota_person(bigint, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy rota_weeks_read on public.rota_weeks for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_weeks_add on public.rota_weeks for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_weeks_change on public.rota_weeks for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy rota_assignments_read on public.rota_assignments for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_assignments_add on public.rota_assignments for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_assignments_remove on public.rota_assignments for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- The rota as it is now: entries not removed, each with its time. A prayer
-- slot's time comes from Prayer times (empty if not entered); a prayer duty
-- counts as 30 minutes and Jumu'ah as 60 for double-booking. Minutes are
-- counted from midnight, so an Isha after midnight still compares correctly
-- within its day. The reader's own access rules apply.
create view public.rota_entries with (security_invoker = true) as
select
  a.id,
  a.week_id,
  a.assignment_date,
  a.slot_type_id,
  st.slot_group,
  st.prayer_time,
  a.location_id,
  a.person_id,
  s.starts_at,
  case when st.slot_group in ('prayer', 'jumuah') then null else a.end_time end as ends_at,
  m.start_min,
  case
    when m.start_min is null then null
    when st.slot_group = 'prayer' then m.start_min + 30
    when st.slot_group = 'jumuah' then m.start_min + 60
    else (extract(epoch from a.end_time) / 60)::integer
  end as end_min,
  a.note,
  a.replaces_id,
  a.created_at
from public.rota_assignments a
join public.rota_slot_types st on st.id = a.slot_type_id
left join public.prayer_times pt on pt.prayer_date = a.assignment_date
cross join lateral (
  select case st.prayer_time
    when 'fajr' then pt.fajr
    when 'dhuhr' then pt.dhuhr
    when 'asr' then pt.asr
    when 'maghrib' then pt.maghrib
    when 'isha' then pt.isha
    when 'jumuah_1' then pt.jumuah_1
    when 'jumuah_2' then pt.jumuah_2
    else a.start_time
  end as starts_at
) s
cross join lateral (select (extract(epoch from s.starts_at) / 60)::integer as start_min) m
where a.removed_at is null;

revoke all on public.rota_entries from public, anon, authenticated, service_role;
grant select on public.rota_entries to authenticated, service_role;

-- The warnings, one row each. kind: double_booked (with the other entry),
-- vetting (with what is on record: applied, expired or none), or
-- no_prayer_time. The reader's own access rules apply.
create view public.rota_warnings with (security_invoker = true) as
select e.id as assignment_id, e.week_id, e.assignment_date, e.person_id,
       'double_booked'::text as kind, o.id as other_assignment_id, null::text as vetting
from public.rota_entries e
join public.rota_entries o
  on o.person_id = e.person_id and o.assignment_date = e.assignment_date and o.id <> e.id
where e.person_id is not null
  and e.start_min is not null and e.end_min is not null
  and o.start_min is not null and o.end_min is not null
  and e.start_min < o.end_min and o.start_min < e.end_min
union all
select e.id, e.week_id, e.assignment_date, e.person_id,
       'vetting', null,
       case
         when exists (select 1 from public.vetting_records v
                      where v.person_id = e.person_id and v.withdrawn_at is null
                        and v.kind = 'applied' and v.happened_on <= e.assignment_date) then 'applied'
         when exists (select 1 from public.vetting_records v
                      where v.person_id = e.person_id and v.withdrawn_at is null
                        and v.kind = 'vetted' and v.happened_on <= e.assignment_date) then 'expired'
         else 'none'
       end
from public.rota_entries e
join public.rota_slot_types st on st.id = e.slot_type_id
join public.people p on p.id = e.person_id
join public.person_roles r on r.id = p.person_role_id
left join lateral (
  select x.kind from public.vetting_records x
  where x.person_id = p.id and x.withdrawn_at is null and x.happened_on <= e.assignment_date
  order by x.happened_on desc, x.id desc limit 1
) latest on true
where (st.needs_vetting or (r.needs_vetting and latest.kind is distinct from 'not_required'))
  and not exists (
    select 1 from public.vetting_records v
    where v.person_id = e.person_id and v.withdrawn_at is null and v.kind = 'vetted'
      and v.happened_on <= e.assignment_date and v.expires_on >= e.assignment_date
  )
union all
select e.id, e.week_id, e.assignment_date, e.person_id, 'no_prayer_time', null, null
from public.rota_entries e
where e.slot_group in ('prayer', 'jumuah') and e.starts_at is null;

revoke all on public.rota_warnings from public, anon, authenticated, service_role;
grant select on public.rota_warnings to authenticated, service_role;
