-- 0031: Rota templates and funeral on call (docs/PHASE-2-AND-3.md 5.1 and
-- 5.2, slice P3.4). Owner's choices, 18 Nov 2026 (all recommended):
--   * Super Admin and Centre Admin only.
--   * A template holds only the extra slots: shifts, on call, and extra
--     people on a prayer. The five daily prayers and Jumu'ah still come by
--     themselves in every new week (migration 0029), so a template can never
--     leave out Fajr by mistake.
--   * Exactly four templates: Normal week, Ramadan, Eid al-Fitr and Eid
--     al-Adha. Admins cannot add, rename or switch off a template; they add
--     slots to it and switch slots off (never deleted, never typed over).
--     (The master key, used only by the seed and tests, can add a template,
--     so tests never touch the four real ones.)
--   * Normal week and Ramadan are week templates: each slot is on a day of
--     the week. The date of Eid moves every year, so the two Eid templates
--     are one-day templates: their slots have no day, and "Use this
--     template" asks which day of the week is Eid.
--   * Funeral on call: one whole-day slot every day in Normal week and
--     Ramadan. It needs Garda vetting (slot type from migration 0028).
--   * "Use this template" adds empty slots to a draft or published week, as
--     many as each template slot asks for. It refuses once anyone is on a
--     slot that week, so it never overwrites a week. One week template per
--     week; the same Eid template once per week. Every use is kept for good.
--   * Starting contents are made-up examples for the Centre to edit.

-- ---------------------------------------------------------------------------
-- Templates
create table public.rota_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique check (length(trim(name)) between 1 and 80),
  kind          text not null check (kind in ('week', 'day')),
  description   text check (length(description) between 1 and 300),
  display_order integer not null default 100 check (display_order between 1 and 100000),
  active        boolean not null default true,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now()
);
call private.add_standard_safeguards('rota_templates', 'id');

create function private.check_rota_template() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'A template''s kind (week or one day) cannot change.';
  end if;
  return new;
end $$;
create trigger rota_template_check before insert or update on public.rota_templates
  for each row execute function private.check_rota_template();
revoke all on function private.check_rota_template() from public, anon;

-- ---------------------------------------------------------------------------
-- Template slots
create table public.rota_template_slots (
  id            bigint generated always as identity primary key,
  template_id   uuid not null references public.rota_templates (id),
  day_of_week   smallint check (day_of_week between 1 and 7),  -- 1 = Monday; empty in a one-day template
  slot_type_id  uuid not null references public.rota_slot_types (id),
  location_id   uuid references public.locations (id),
  start_time    time,
  end_time      time,
  people_count  smallint not null default 1 check (people_count between 1 and 20),
  note          text check (length(note) between 1 and 200),
  active        boolean not null default true,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  constraint rota_template_times_both_or_neither check ((start_time is null) = (end_time is null)),
  constraint rota_template_end_after_start check (end_time is null or end_time > start_time)
);
call private.add_standard_safeguards('rota_template_slots', 'id');
create index rota_template_slots_template on public.rota_template_slots (template_id, day_of_week);

create function private.check_rota_template_slot() returns trigger
language plpgsql set search_path = '' as $$
declare
  t  public.rota_templates%rowtype;
  st public.rota_slot_types%rowtype;
  l  public.locations%rowtype;
begin
  if tg_op = 'UPDATE' then
    if (new.template_id, new.day_of_week, new.slot_type_id, new.location_id, new.start_time,
        new.end_time, new.people_count, new.note)
       is distinct from
       (old.template_id, old.day_of_week, old.slot_type_id, old.location_id, old.start_time,
        old.end_time, old.people_count, old.note) then
      raise exception 'A template slot cannot be changed. Switch it off and add a new one.';
    end if;
    return new;
  end if;

  select * into t from public.rota_templates x where x.id = new.template_id;
  if t.id is null then
    raise exception 'That template does not exist.';
  end if;
  if not t.active then
    raise exception 'That template is switched off.';
  end if;
  if t.kind = 'week' and new.day_of_week is null then
    raise exception 'Pick the day of the week for this slot.';
  end if;
  if t.kind = 'day' and new.day_of_week is not null then
    raise exception 'This is a one-day template: its slots go on the day it is used, so leave the day empty.';
  end if;

  select * into st from public.rota_slot_types x where x.id = new.slot_type_id;
  if st.id is null then
    raise exception 'That slot type is not on the list.';
  end if;
  if not st.active then
    raise exception 'That slot type is switched off. Switch it back on to use it.';
  end if;
  if st.slot_group = 'jumuah' then
    if t.kind = 'day' then
      raise exception 'Jumu''ah slots cannot go in a one-day template; they come by themselves every Friday.';
    elsif new.day_of_week <> 5 then
      raise exception 'Jumu''ah slots go only on a Friday.';
    end if;
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
  return new;
end $$;
create trigger rota_template_slot_check before insert or update on public.rota_template_slots
  for each row execute function private.check_rota_template_slot();
revoke all on function private.check_rota_template_slot() from public, anon;

-- ---------------------------------------------------------------------------
-- What a template would add to a week: one empty slot per person asked for,
-- from the template's switched-on slots whose slot type is still switched
-- on. A room that has since been switched off is left out (the slot stays).
-- p_day is the Eid day for a one-day template. The reader's own access rules
-- apply.
create function private.rota_template_plan(p_template_id uuid, p_week_start date, p_day date)
returns table (assignment_date date, slot_type_id uuid, location_id uuid, start_time time, end_time time, note text)
language sql stable security invoker set search_path = '' as $$
  select
    case when t.kind = 'day' then p_day else p_week_start + (s.day_of_week - 1) end,
    s.slot_type_id,
    case when l.active then s.location_id end,
    s.start_time,
    s.end_time,
    s.note
  from public.rota_template_slots s
  join public.rota_templates t on t.id = s.template_id
  join public.rota_slot_types st on st.id = s.slot_type_id and st.active
  left join public.locations l on l.id = s.location_id
  cross join lateral generate_series(1, s.people_count) n
  where s.template_id = p_template_id and s.active
  order by 1, st.slot_group desc, st.display_order, s.start_time nulls first, s.id, n
$$;
revoke all on function private.rota_template_plan(uuid, date, date) from public, anon;
grant execute on function private.rota_template_plan(uuid, date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Uses: each time a template was used on a week. Never changed or deleted.
create table public.rota_template_uses (
  id           bigint generated always as identity primary key,
  week_id      uuid not null references public.rota_weeks (id),
  template_id  uuid not null references public.rota_templates (id),
  on_day       date,
  used_by      uuid not null references auth.users (id),
  used_at      timestamptz not null default now(),
  slots_added  integer not null default 0 check (slots_added >= 0),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);
call private.add_standard_safeguards('rota_template_uses', 'id');
create index rota_template_uses_week on public.rota_template_uses (week_id);

create function private.check_rota_template_use() returns trigger
language plpgsql set search_path = '' as $$
declare
  w     public.rota_weeks%rowtype;
  t     public.rota_templates%rowtype;
  other text;
begin
  if auth.uid() is not null and not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Your account is not allowed to do this.' using errcode = '42501';
  end if;
  select * into w from public.rota_weeks x where x.id = new.week_id for update;
  if w.id is null then
    raise exception 'That rota week does not exist.';
  end if;
  if auth.uid() is not null and private.rota_week_ended(w.week_start) then
    raise exception 'That week has ended. Its rota can no longer be changed.';
  end if;
  select * into t from public.rota_templates x where x.id = new.template_id;
  if t.id is null or not t.active then
    raise exception 'That template does not exist.';
  end if;

  if t.kind = 'day' then
    if new.on_day is null then
      raise exception 'Pick which day of the week is Eid.';
    end if;
    if new.on_day < w.week_start or new.on_day > w.week_start + 6 then
      raise exception 'The day must be inside that week.';
    end if;
  elsif new.on_day is not null then
    raise exception 'This template is for the whole week, so leave the day empty.';
  end if;

  if exists (select 1 from public.rota_assignments a
             where a.week_id = w.id and a.removed_at is null and a.person_id is not null) then
    raise exception 'This week already has people on it, so a template cannot be used. Templates only fill a week that nobody is on yet.';
  end if;

  if t.kind = 'week' then
    select x.name into other from public.rota_template_uses u
    join public.rota_templates x on x.id = u.template_id
    where u.week_id = w.id and x.kind = 'week' limit 1;
  else
    select x.name into other from public.rota_template_uses u
    join public.rota_templates x on x.id = u.template_id
    where u.week_id = w.id and u.template_id = t.id limit 1;
  end if;
  if other is not null then
    raise exception 'This week already has the % template.', other;
  end if;

  new.used_by := coalesce(auth.uid(), new.used_by);
  if new.used_by is null then
    raise exception 'Say who used the template.';
  end if;
  new.used_at := now();
  select count(*)::integer into new.slots_added from private.rota_template_plan(t.id, w.week_start, new.on_day);
  if new.slots_added = 0 then
    raise exception 'This template has no slots switched on. Add some on the Templates page first.';
  end if;
  return new;
end $$;
create trigger rota_template_use_check before insert on public.rota_template_uses
  for each row execute function private.check_rota_template_use();
revoke all on function private.check_rota_template_use() from public, anon;

create function private.block_rota_template_use_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'A template use cannot be changed.';
end $$;
create trigger block_rota_template_use_change before update on public.rota_template_uses
  for each row execute function private.block_rota_template_use_change();
revoke all on function private.block_rota_template_use_change() from public, anon;

-- Writing the use adds the empty slots, in the same step. The rota's own
-- checks (migration 0029) apply to every slot added.
create function private.rota_template_fill() returns trigger
language plpgsql set search_path = '' as $$
declare
  w public.rota_weeks%rowtype;
begin
  select * into w from public.rota_weeks x where x.id = new.week_id;
  insert into public.rota_assignments (week_id, assignment_date, slot_type_id, location_id, start_time, end_time, note)
  select new.week_id, p.assignment_date, p.slot_type_id, p.location_id, p.start_time, p.end_time, p.note
  from private.rota_template_plan(new.template_id, w.week_start, new.on_day) p;
  return null;
end $$;
create trigger rota_template_use_fills after insert on public.rota_template_uses
  for each row execute function private.rota_template_fill();
revoke all on function private.rota_template_fill() from public, anon;

-- Use a template on a week. Runs as the signed-in admin, so the access rules
-- below apply. Returns how many empty slots were added.
create function public.use_rota_template(p_week_id uuid, p_template_id uuid, p_day date default null) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  added integer;
begin
  if not (select private.has_role('super_admin', 'centre_admin')) then
    raise exception 'Your account is not allowed to do this.' using errcode = '42501';
  end if;
  insert into public.rota_template_uses (week_id, template_id, on_day)
  values (p_week_id, p_template_id, p_day)
  returning slots_added into added;
  return added;
end $$;
revoke all on function public.use_rota_template(uuid, uuid, date) from public, anon;
grant execute on function public.use_rota_template(uuid, uuid, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access: Super Admin and Centre Admin only. Templates themselves are read
-- only (the four are fixed); slots can be added and switched off; uses are
-- added only. No delete anywhere (standard safeguards).
revoke insert, update on public.rota_templates from authenticated;
create policy rota_templates_read on public.rota_templates for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));

create policy rota_template_slots_read on public.rota_template_slots for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_template_slots_add on public.rota_template_slots for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_template_slots_change on public.rota_template_slots for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

revoke update on public.rota_template_uses from authenticated;
create policy rota_template_uses_read on public.rota_template_uses for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_template_uses_add on public.rota_template_uses for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- A slot type for the Eid prayer itself (a timed duty, like a shift; Eid has
-- no entry in Prayer times). It can be renamed on the Slot types page.
insert into public.rota_slot_types (name, slot_group, prayer_time, needs_vetting)
values ('Eid prayer', 'shift', null, false);

-- The four templates, with made-up starting contents for the Centre to edit.
insert into public.rota_templates (name, kind, description, display_order) values
  ('Normal week', 'week', 'An ordinary week: security each evening, cleaning each morning, reception on weekdays, funeral on call every day.', 1),
  ('Ramadan',     'week', 'A Ramadan week: the normal week, plus volunteers each evening and a second person on Isha each night.', 2),
  ('Eid al-Fitr', 'day',  'The day of Eid al-Fitr: the Eid prayer, extra security, volunteers and reception. Used on top of the week''s template.', 3),
  ('Eid al-Adha', 'day',  'The day of Eid al-Adha: the Eid prayer, extra security, volunteers and reception. Used on top of the week''s template.', 4);

insert into public.rota_template_slots (template_id, day_of_week, slot_type_id, start_time, end_time, people_count, note)
select t.id, d.day, st.id, x.start_time, x.end_time, x.people_count, x.note
from (values
  ('Normal week', 'Security',        time '18:00', time '22:00', 1, null::text, 1, 7),
  ('Normal week', 'Cleaning',        time '07:00', time '09:00', 1, null,       1, 7),
  ('Normal week', 'Reception',       time '10:00', time '16:00', 1, null,       1, 5),
  ('Normal week', 'Funeral on call', null,         null,         1, null,       1, 7),
  ('Ramadan',     'Security',        time '18:00', time '23:30', 1, null,       1, 7),
  ('Ramadan',     'Cleaning',        time '07:00', time '09:00', 1, null,       1, 7),
  ('Ramadan',     'Reception',       time '10:00', time '16:00', 1, null,       1, 5),
  ('Ramadan',     'Volunteers',      time '19:00', time '23:00', 2, 'Iftar and Taraweeh', 1, 7),
  ('Ramadan',     'Isha',            null,         null,         1, 'Second person (Taraweeh)', 1, 7),
  ('Ramadan',     'Funeral on call', null,         null,         1, null,       1, 7)
) as x(template, slot, start_time, end_time, people_count, note, first_day, last_day)
join public.rota_templates t on t.name = x.template
join public.rota_slot_types st on st.name = x.slot
cross join lateral (select generate_series(x.first_day, x.last_day)::smallint as day) d
order by t.display_order, d.day, st.slot_group desc, st.display_order;

insert into public.rota_template_slots (template_id, day_of_week, slot_type_id, start_time, end_time, people_count, note)
select t.id, null, st.id, x.start_time, x.end_time, x.people_count, x.note
from (values
  ('Eid prayer', time '08:30', time '09:30', 1, null::text),
  ('Security',   time '07:00', time '12:00', 2, null),
  ('Volunteers', time '07:00', time '11:00', 4, 'Car park and welcome'),
  ('Reception',  time '08:00', time '12:00', 1, null)
) as x(slot, start_time, end_time, people_count, note)
cross join public.rota_templates t
join public.rota_slot_types st on st.name = x.slot
where t.kind = 'day'
order by t.display_order, st.display_order;
