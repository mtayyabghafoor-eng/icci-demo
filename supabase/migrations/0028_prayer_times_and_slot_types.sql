-- 0028: Prayer times and rota slot types (docs/PHASE-2-AND-3.md 5.1, slice P3.1).
-- Owner's choices, 18 Nov 2026 (all recommended answers):
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing.
--   * Slot types are a list that can grow: add, rename, reorder, tick
--     "needs Garda vetting", switch off. Never deleted. To start with,
--     Security, Volunteers and Funeral on call need vetting; prayers do not.
--     A slot's group (prayers, Jumu'ah, shifts, on call) and, for prayer and
--     Jumu'ah slots, which prayer time it takes are fixed once it is added
--     (the rota relies on them); switch it off and add a new one instead.
--   * Prayer times are reference information typed in from the Centre's
--     timetable, never calculated. One row per date: the five prayers, and
--     on Fridays up to two Jumu'ah times. Entered a month at a time
--     (save_prayer_month). Any day, past ones too, can be corrected; every
--     change is in the audit log. Never deleted.

-- ---------------------------------------------------------------------------
-- Slot types
create table public.rota_slot_types (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 60),
  slot_group    text not null check (slot_group in ('prayer', 'jumuah', 'shift', 'on_call')),
  prayer_time   text check (prayer_time in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumuah_1', 'jumuah_2')),
  needs_vetting boolean not null default false,
  display_order integer not null check (display_order between 1 and 100000),
  active        boolean not null default true,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  constraint rota_slot_time_matches_group check (
    (slot_group = 'prayer' and prayer_time in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha'))
    or (slot_group = 'jumuah' and prayer_time in ('jumuah_1', 'jumuah_2'))
    or (slot_group in ('shift', 'on_call') and prayer_time is null)
  ),
  -- Checked at the end of a change, so two slots can swap places.
  constraint rota_slot_order_unique unique (slot_group, display_order) deferrable initially deferred
);
call private.add_standard_safeguards('rota_slot_types', 'id');
create unique index rota_slot_types_unique_name on public.rota_slot_types (lower(trim(name)));

create function private.check_rota_slot_type() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := regexp_replace(trim(coalesce(new.name, '')), '\s+', ' ', 'g');

  if tg_op = 'UPDATE' then
    if new.slot_group is distinct from old.slot_group or new.prayer_time is distinct from old.prayer_time then
      raise exception 'A slot type''s group and prayer time cannot change. Switch it off and add a new one.';
    end if;
    return new;
  end if;

  if new.slot_group = 'prayer' then
    if new.prayer_time is null or new.prayer_time not in ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha') then
      raise exception 'A prayer slot must say which prayer time it takes (Fajr, Dhuhr, Asr, Maghrib or Isha).';
    end if;
  elsif new.slot_group = 'jumuah' then
    if new.prayer_time is null or new.prayer_time not in ('jumuah_1', 'jumuah_2') then
      raise exception 'A Jumu''ah slot must say which prayer time it takes (Jumu''ah 1 or Jumu''ah 2).';
    end if;
  elsif new.slot_group in ('shift', 'on_call') then
    if new.prayer_time is not null then
      raise exception 'Shifts and on-call slots set their own times on the rota, so leave which prayer time empty.';
    end if;
  else
    raise exception 'The group must be prayers, Jumu''ah, shifts or on call.';
  end if;

  -- A new slot type goes to the end of its group.
  if new.display_order is null then
    select coalesce(max(x.display_order), 0) + 1 into new.display_order
    from public.rota_slot_types x where x.slot_group = new.slot_group;
  end if;
  return new;
end $$;

create trigger rota_slot_check before insert or update on public.rota_slot_types
  for each row execute function private.check_rota_slot_type();
revoke all on function private.check_rota_slot_type() from public, anon;

-- Starting list (docs/PHASE-2-AND-3.md 5.1).
insert into public.rota_slot_types (name, slot_group, prayer_time, needs_vetting, display_order) values
  ('Fajr',            'prayer',  'fajr',     false, 1),
  ('Dhuhr',           'prayer',  'dhuhr',    false, 2),
  ('Asr',             'prayer',  'asr',      false, 3),
  ('Maghrib',         'prayer',  'maghrib',  false, 4),
  ('Isha',            'prayer',  'isha',     false, 5),
  ('Jumu''ah 1',      'jumuah',  'jumuah_1', false, 1),
  ('Jumu''ah 2',      'jumuah',  'jumuah_2', false, 2),
  ('Security',        'shift',   null,       true,  1),
  ('Cleaning',        'shift',   null,       false, 2),
  ('Reception',       'shift',   null,       false, 3),
  ('Volunteers',      'shift',   null,       true,  4),
  ('Funeral on call', 'on_call', null,       true,  1);

-- Move a slot type one place up or down within its group (among switched-on
-- ones). Runs as the signed-in admin, so the access rules below apply. The
-- first one cannot go higher and the last one lower: nothing happens.
create function public.move_rota_slot_type(p_id uuid, p_direction text) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  me    public.rota_slot_types%rowtype;
  other public.rota_slot_types%rowtype;
begin
  if not (select private.has_role('super_admin', 'centre_admin')) then
    raise exception 'Your account is not allowed to do this.' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'The direction must be up or down.' using errcode = '22023';
  end if;
  select * into me from public.rota_slot_types x where x.id = p_id for update;
  if not found then
    raise exception 'That slot type is not on the list.' using errcode = '22023';
  end if;
  if p_direction = 'up' then
    select * into other from public.rota_slot_types x
    where x.slot_group = me.slot_group and x.active and x.display_order < me.display_order
    order by x.display_order desc limit 1 for update;
  else
    select * into other from public.rota_slot_types x
    where x.slot_group = me.slot_group and x.active and x.display_order > me.display_order
    order by x.display_order asc limit 1 for update;
  end if;
  if not found then
    return;
  end if;
  update public.rota_slot_types set display_order = other.display_order where id = me.id;
  update public.rota_slot_types set display_order = me.display_order where id = other.id;
end $$;
revoke all on function public.move_rota_slot_type(uuid, text) from public, anon;
grant execute on function public.move_rota_slot_type(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Prayer times
create table public.prayer_times (
  id          bigint generated always as identity primary key,
  prayer_date date not null unique check (prayer_date between date '2000-01-01' and date '2100-12-31'),
  fajr        time not null,
  dhuhr       time not null,
  asr         time not null,
  maghrib     time not null,
  isha        time not null,
  jumuah_1    time,
  jumuah_2    time,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
call private.add_standard_safeguards('prayer_times', 'id');

create function private.check_prayer_times() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.prayer_date is distinct from old.prayer_date then
    raise exception 'A day''s date cannot change. Correct the times instead.';
  end if;
  if new.prayer_date is null or new.prayer_date < date '2000-01-01' or new.prayer_date > date '2100-12-31' then
    raise exception 'The date must be between the years 2000 and 2100.';
  end if;
  if num_nulls(new.fajr, new.dhuhr, new.asr, new.maghrib, new.isha) > 0 then
    raise exception 'Please fill in all five prayer times.';
  end if;
  if exists (
    select 1 from unnest(array[new.fajr, new.dhuhr, new.asr, new.maghrib, new.isha, new.jumuah_1, new.jumuah_2]) t
    where t is not null and extract(second from t) <> 0
  ) then
    raise exception 'Times are in whole minutes (no seconds).';
  end if;
  if new.dhuhr <= new.fajr then
    raise exception 'Dhuhr must be after Fajr.';
  end if;
  if new.asr <= new.dhuhr then
    raise exception 'Asr must be after Dhuhr.';
  end if;
  if new.maghrib <= new.asr then
    raise exception 'Maghrib must be after Asr.';
  end if;
  -- Isha may fall after midnight on summer nights, but never as late as Fajr.
  if not (new.isha > new.maghrib or new.isha < new.fajr) then
    raise exception 'Isha must be after Maghrib (it may be after midnight, but before Fajr).';
  end if;
  if num_nonnulls(new.jumuah_1, new.jumuah_2) > 0 then
    if extract(isodow from new.prayer_date) <> 5 then
      raise exception 'Jumu''ah times go only on a Friday.';
    end if;
    if new.jumuah_1 is null then
      raise exception 'A second Jumu''ah needs a first one.';
    end if;
    if new.jumuah_2 is not null and new.jumuah_2 <= new.jumuah_1 then
      raise exception 'Jumu''ah 2 must be after Jumu''ah 1.';
    end if;
  end if;
  return new;
end $$;

create trigger prayer_times_check before insert or update on public.prayer_times
  for each row execute function private.check_prayer_times();
revoke all on function private.check_prayer_times() from public, anon;

-- Save the days of one month typed into the Prayer times screen, all or
-- nothing: new days are added, changed days corrected, unchanged days left
-- alone (so the audit log shows only real corrections). A wrong day refuses
-- the whole month, with the day named in the message. Runs as the signed-in
-- admin, so the access rules below apply. Returns how many were added and
-- changed.
create function public.save_prayer_month(p_month date, p_days jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  d        jsonb;
  v_date   date;
  v        public.prayer_times%rowtype;
  existing public.prayer_times%rowtype;
  added    integer := 0;
  changed  integer := 0;
begin
  if not (select private.has_role('super_admin', 'centre_admin')) then
    raise exception 'Your account is not allowed to do this.' using errcode = '42501';
  end if;
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'The month must be given as the first day of a month.' using errcode = '22023';
  end if;
  if p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 31 then
    raise exception 'The days must be a list of at most 31.' using errcode = '22023';
  end if;

  for d in select x from jsonb_array_elements(p_days) x loop
    begin
      v_date := (d ->> 'prayer_date')::date;
    exception when others then
      v_date := null;
    end;
    if v_date is null or date_trunc('month', v_date)::date <> p_month then
      raise exception '% is not in this month.', coalesce(d ->> 'prayer_date', 'A day') using errcode = '22023';
    end if;

    begin
      v.fajr := (d ->> 'fajr')::time;
      v.dhuhr := (d ->> 'dhuhr')::time;
      v.asr := (d ->> 'asr')::time;
      v.maghrib := (d ->> 'maghrib')::time;
      v.isha := (d ->> 'isha')::time;
      v.jumuah_1 := nullif(d ->> 'jumuah_1', '')::time;
      v.jumuah_2 := nullif(d ->> 'jumuah_2', '')::time;

      select * into existing from public.prayer_times x where x.prayer_date = v_date for update;
      if not found then
        insert into public.prayer_times (prayer_date, fajr, dhuhr, asr, maghrib, isha, jumuah_1, jumuah_2)
        values (v_date, v.fajr, v.dhuhr, v.asr, v.maghrib, v.isha, v.jumuah_1, v.jumuah_2);
        added := added + 1;
      elsif (existing.fajr, existing.dhuhr, existing.asr, existing.maghrib, existing.isha, existing.jumuah_1, existing.jumuah_2)
            is distinct from (v.fajr, v.dhuhr, v.asr, v.maghrib, v.isha, v.jumuah_1, v.jumuah_2) then
        update public.prayer_times
        set fajr = v.fajr, dhuhr = v.dhuhr, asr = v.asr, maghrib = v.maghrib, isha = v.isha,
            jumuah_1 = v.jumuah_1, jumuah_2 = v.jumuah_2
        where id = existing.id;
        changed := changed + 1;
      end if;
    exception when others then
      raise exception '%: %', to_char(v_date, 'FMDay FMDD FMMonth'), sqlerrm using errcode = sqlstate;
    end;
  end loop;
  return jsonb_build_object('added', added, 'changed', changed);
end $$;
revoke all on function public.save_prayer_month(date, jsonb) from public, anon;
grant execute on function public.save_prayer_month(date, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy rota_slot_types_read on public.rota_slot_types for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_slot_types_add on public.rota_slot_types for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_slot_types_change on public.rota_slot_types for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy prayer_times_read on public.prayer_times for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy prayer_times_add on public.prayer_times for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy prayer_times_correct on public.prayer_times for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));
