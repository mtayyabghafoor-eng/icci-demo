-- 0030: Publishing a rota week and the one-page rota (docs/PHASE-2-AND-3.md
-- 5.1 and 5.2, slice P3.3). Owner's choices, 18 Nov 2026 (all recommended):
--   * Super Admin and Centre Admin only. Publishing a rota is routine work,
--     not an approval, so the admin who built the week may publish it.
--   * A week can be published again after changes. It stays "published";
--     each publication is added to its history and never changed or deleted.
--   * If any warnings are showing, the admin must tick "I have seen the
--     warnings". The number of warnings is recorded with the publication.
--   * Each publication keeps a frozen copy of the rota as published: names
--     and roles only, never phone numbers.
--   * "Changed since publishing" is worked out: a slot added, swapped or
--     emptied after the latest publication is changed; a slot taken off the
--     week is listed as removed. The frozen copy records which slots had
--     changed since the publication before, so each one-page rota shows its
--     own amber marks forever.
--   * A week that has ended can no longer be published (the master key,
--     used only by the seed and tests, still can).
--   * Home page: "Today's rota" counts today's slots and those not filled.

-- ---------------------------------------------------------------------------
create table public.rota_publications (
  id             bigint generated always as identity primary key,
  week_id        uuid not null references public.rota_weeks (id),
  published_by   uuid not null references auth.users (id),
  published_at   timestamptz not null default now(),
  seen_warnings  boolean not null default false,
  warning_count  integer not null default 0 check (warning_count >= 0),
  change_count   integer not null default 0 check (change_count >= 0),
  frozen_copy    jsonb not null default '{}'::jsonb,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now()
);
call private.add_standard_safeguards('rota_publications', 'id');
create index rota_publications_week on public.rota_publications (week_id, published_at desc, id desc);

-- ---------------------------------------------------------------------------
-- What has changed in a week since one publication (null: nothing to compare
-- with, so nothing counts as changed). kind 'changed': a slot as it is now
-- that was not in that publication (added, swapped or emptied). kind
-- 'removed': a slot in that publication that is no longer on the week (it
-- was taken off, possibly after being swapped). The reader's own access
-- rules apply.
create function private.rota_changes_since(p_week_id uuid, p_publication_id bigint)
returns table (kind text, assignment_id bigint)
language sql stable security invoker set search_path = '' as $$
  with recursive pub as (
    select (e ->> 'id')::bigint as id
    from public.rota_publications p
    cross join lateral jsonb_array_elements(coalesce(p.frozen_copy -> 'entries', '[]'::jsonb)) e
    where p.id = p_publication_id and p.week_id = p_week_id
  ),
  chain as (
    select pub.id as start_id, a.id, a.removed_at
    from pub join public.rota_assignments a on a.id = pub.id
    union all
    select c.start_id, a.id, a.removed_at
    from chain c join public.rota_assignments a on a.replaces_id = c.id
  )
  select 'changed'::text, a.id
  from public.rota_assignments a
  where p_publication_id is not null
    and a.week_id = p_week_id and a.removed_at is null
    and not exists (select 1 from pub where pub.id = a.id)
  union all
  select 'removed'::text, pub.id
  from pub
  where not exists (select 1 from chain c where c.start_id = pub.id and c.removed_at is null)
$$;
revoke all on function private.rota_changes_since(uuid, bigint) from public, anon;
grant execute on function private.rota_changes_since(uuid, bigint) to authenticated, service_role;

-- The latest publication of a week (null if never published).
create function private.rota_latest_publication(p_week_id uuid) returns bigint
language sql stable security invoker set search_path = '' as $$
  select p.id from public.rota_publications p
  where p.week_id = p_week_id
  order by p.published_at desc, p.id desc
  limit 1
$$;
revoke all on function private.rota_latest_publication(uuid) from public, anon;
grant execute on function private.rota_latest_publication(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A publication is worked out by the database, whatever the screen sends:
-- who, when, the warnings, the changes and the frozen copy.
create function private.check_rota_publication() returns trigger
language plpgsql set search_path = '' as $$
declare
  w        public.rota_weeks%rowtype;
  previous bigint;
  warnings integer;
  entries  jsonb;
  removed  jsonb;
  changes  integer;
begin
  select * into w from public.rota_weeks x where x.id = new.week_id for update;
  if w.id is null then
    raise exception 'That rota week does not exist.';
  end if;
  if auth.uid() is not null then
    if not private.has_role('super_admin', 'centre_admin') then
      raise exception 'Your account is not allowed to do this.' using errcode = '42501';
    end if;
    if private.rota_week_ended(w.week_start) then
      raise exception 'That week has ended. Its rota can no longer be published.';
    end if;
    new.published_by := auth.uid();
  elsif new.published_by is null then
    raise exception 'A publication needs the admin who published it.';
  end if;
  new.published_at := now();

  select count(*)::integer into warnings from public.rota_warnings rw where rw.week_id = w.id;
  if warnings > 0 and not new.seen_warnings then
    raise exception 'This week has % %. Tick "I have seen the warnings" to publish it.',
      warnings, case when warnings = 1 then 'warning' else 'warnings' end;
  end if;
  new.warning_count := warnings;

  previous := private.rota_latest_publication(w.id);

  -- The rota as it is now: names and roles only.
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id,
           'date', e.assignment_date,
           'slot_type_id', e.slot_type_id,
           'slot', st.name,
           'slot_group', st.slot_group,
           'display_order', st.display_order,
           'starts_at', to_char(e.starts_at, 'HH24:MI'),
           'ends_at', to_char(e.ends_at, 'HH24:MI'),
           'place', case when l.id is null then null
                         when parent.id is null then l.name
                         else l.name || ' (' || parent.name || ')' end,
           'person', p.full_name,
           'person_role', r.name,
           'note', e.note,
           'changed', exists (select 1 from private.rota_changes_since(w.id, previous) c
                              where c.kind = 'changed' and c.assignment_id = e.id)
         ) order by e.assignment_date, st.slot_group, st.display_order, e.start_min nulls first, e.id), '[]'::jsonb)
  into entries
  from public.rota_entries e
  join public.rota_slot_types st on st.id = e.slot_type_id
  left join public.locations l on l.id = e.location_id
  left join public.locations parent on parent.id = l.parent_id
  left join public.people p on p.id = e.person_id
  left join public.person_roles r on r.id = p.person_role_id
  where e.week_id = w.id;

  -- Slots that were in the previous publication and are no longer on the
  -- week, as they were published then.
  select coalesce(jsonb_agg(old_entry order by old_entry ->> 'date', old_entry ->> 'slot'), '[]'::jsonb)
  into removed
  from public.rota_publications pp
  cross join lateral jsonb_array_elements(pp.frozen_copy -> 'entries') old_entry
  where pp.id = previous
    and exists (select 1 from private.rota_changes_since(w.id, previous) c
                where c.kind = 'removed' and c.assignment_id = (old_entry ->> 'id')::bigint);

  select count(*)::integer into changes from private.rota_changes_since(w.id, previous);
  new.change_count := changes;
  new.frozen_copy := jsonb_build_object(
    'week_start', w.week_start,
    'previous_publication_id', previous,
    'entries', entries,
    'removed', removed
  );
  return new;
end $$;
create trigger rota_publication_check before insert on public.rota_publications
  for each row execute function private.check_rota_publication();
revoke all on function private.check_rota_publication() from public, anon;

-- A publication is a permanent record: nobody, not even the master key, can
-- change one.
create function private.block_rota_publication_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'A published rota cannot be changed. Publish the week again instead.';
end $$;
create trigger block_rota_publication_change before update on public.rota_publications
  for each row execute function private.block_rota_publication_change();
revoke all on function private.block_rota_publication_change() from public, anon;

-- Publishing marks the week as published.
create function private.rota_mark_published() returns trigger
language plpgsql set search_path = '' as $$
begin
  update public.rota_weeks set status = 'published' where id = new.week_id and status = 'draft';
  return null;
end $$;
create trigger rota_publication_marks_week after insert on public.rota_publications
  for each row execute function private.rota_mark_published();
revoke all on function private.rota_mark_published() from public, anon;

-- A week's status changes only when a publication of it was saved in the
-- same step, and only from draft to published.
create or replace function private.check_rota_week() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.week_start is distinct from old.week_start then
      raise exception 'A rota week''s date cannot change.';
    end if;
    if new.status is distinct from old.status then
      if not (old.status = 'draft' and new.status = 'published' and exists (
        select 1 from public.rota_publications p
        where p.week_id = new.id and private.written_in_this_transaction(p.xmin)
      )) then
        raise exception 'A week''s status changes only by publishing it.';
      end if;
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

-- Publish a week: runs as the signed-in admin, so the access rules apply.
-- Returns the new publication's number.
create function public.publish_rota_week(p_week_id uuid, p_seen_warnings boolean default false) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  new_id bigint;
begin
  if not (select private.has_role('super_admin', 'centre_admin')) then
    raise exception 'Your account is not allowed to do this.' using errcode = '42501';
  end if;
  insert into public.rota_publications (week_id, seen_warnings)
  values (p_week_id, coalesce(p_seen_warnings, false))
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.publish_rota_week(uuid, boolean) from public, anon;
grant execute on function public.publish_rota_week(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Access: Super Admin and Centre Admin read and publish. No change, no
-- delete.
revoke update on public.rota_publications from authenticated;
create policy rota_publications_read on public.rota_publications for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy rota_publications_add on public.rota_publications for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- The changes since the latest publication, for the Rota week and Publish
-- screens. Empty for a week never published. The reader's own access rules
-- apply.
create view public.rota_changes with (security_invoker = true) as
select w.id as week_id, c.kind, c.assignment_id
from public.rota_weeks w
cross join lateral private.rota_changes_since(w.id, private.rota_latest_publication(w.id)) c;

revoke all on public.rota_changes from public, anon, authenticated, service_role;
grant select on public.rota_changes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home page counters gain "Today's rota": today's slots, and how many are
-- not filled yet. Everything else is unchanged from migration 0026.
drop function public.home_counters();
create function public.home_counters()
returns table (
  low_stock               integer,
  out_of_stock            integer,
  damaged                 integer,
  missing                 integer,
  corrections_for_me      integer,
  disposals_for_me        integer,
  stocktake_diffs_for_me  integer,
  vetting_expired         integer,
  vetting_none            integer,
  vetting_due             integer,
  signoffs_overdue        integer,
  signoffs_unsigned       integer,
  renewals_overdue        integer,
  renewals_due_30         integer,
  rota_today              integer,
  rota_today_unfilled     integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := private.today_in_dublin();
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can see these counters.' using errcode = '42501';
  end if;

  return query select
    (select count(*)::integer from public.stock_levels sl where sl.status in ('low', 'out')),
    (select count(*)::integer from public.stock_levels sl where sl.status = 'out'),
    (select count(*)::integer from public.items i where i.kind = 'fixed_asset' and i.condition = 'damaged'),
    (select count(*)::integer from public.items i where i.kind = 'fixed_asset' and i.condition = 'missing'),
    (select count(*)::integer from public.stock_movements m
      where m.status = 'pending' and m.created_by is distinct from me),
    (select count(*)::integer from public.asset_events e
      where e.status = 'pending' and e.created_by is distinct from me),
    (select count(*)::integer from public.stocktake_differences d
      join public.stocktakes st on st.id = d.stocktake_id
      where d.status = 'pending'
        and st.created_by is distinct from me
        and st.submitted_by is distinct from me
        and d.created_by is distinct from me
        and not exists (select 1 from public.stocktake_scans sc
                        where sc.stocktake_id = st.id and sc.created_by = me)),
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'expired'),
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'none'),
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'due'),
    (select count(*)::integer from public.policy_grid g where g.status = 'overdue'),
    (select count(*)::integer from public.policy_grid g where g.status = 'unsigned'),
    (select count(*)::integer from public.renewals_register rr where rr.status = 'overdue'),
    (select count(*)::integer from public.renewals_register rr where rr.status = 'due' and rr.due_on <= today + 30),
    (select count(*)::integer from public.rota_entries re where re.assignment_date = today),
    (select count(*)::integer from public.rota_entries re where re.assignment_date = today and re.person_id is null);
end $$;

revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;
