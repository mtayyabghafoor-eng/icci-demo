-- 0020: Garda vetting (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1, slice P2.3).
-- Owner's choices, 15 Nov 2026:
--   * One row per thing that happened: applied, vetted, or not required.
--     Never typed over or deleted. A wrong entry is withdrawn with a reason
--     (who and when are filled in by the database) and a new one entered.
--   * Expiry: the screen suggests vetted date + 3 years; the admin can
--     change it for each person (at most 10 years, to catch typing slips).
--   * The status is worked out from today's date (in Dublin) every time it
--     is read (view people_vetting), so it turns "expired" on the day.
--   * One admin is enough: no second approval. But nobody can record or
--     withdraw vetting for the person linked to their own account.
--   * Re-vetting applied while still vetted keeps the real status (valid or
--     due) and shows the applied date; "applied" only when nothing valid is
--     on file.
--   * "Not required" can be recorded for one person; a role that does not
--     need vetting shows "not required" automatically.
--   * A switched-off person gets no new entries (withdrawing still works).
--   * Status and dates only: no disclosure, reference number or file
--     (PLAN.md section 2 forbids storing vetting disclosures).
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing.

create table public.vetting_records (
  id               bigint generated always as identity primary key,
  person_id        uuid not null references public.people (id),
  kind             text not null check (kind in ('applied', 'vetted', 'not_required')),
  happened_on      date not null,
  expires_on       date,
  withdrawn_at     timestamptz,
  withdrawn_by     uuid references auth.users (id),
  withdrawn_reason text check (length(withdrawn_reason) between 1 and 500),
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  -- Only a vetting has an expiry date, and it must come after the vetting.
  constraint vetting_expiry_only_when_vetted check ((kind = 'vetted') = (expires_on is not null)),
  constraint vetting_expiry_after check (expires_on is null or expires_on > happened_on),
  -- Withdrawn means all three filled in, or none.
  constraint vetting_withdrawn_complete check (
    num_nonnulls(withdrawn_at, withdrawn_by, withdrawn_reason) in (0, 3)
  )
);
call private.add_standard_safeguards('vetting_records', 'id');
create index vetting_records_person on public.vetting_records (person_id, happened_on desc, id desc);

-- "Today" for every vetting rule: the date in Ireland.
create function private.today_in_dublin() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Europe/Dublin')::date
$$;

create function private.check_vetting_record() returns trigger
language plpgsql set search_path = '' as $$
declare
  p public.people%rowtype;
begin
  select * into p from public.people x where x.id = coalesce(new.person_id, old.person_id);

  if tg_op = 'INSERT' then
    if p.id is null then
      raise exception 'That person is not in the people directory.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_by is not null or new.withdrawn_reason is not null then
      raise exception 'A new entry cannot already be withdrawn.';
    end if;
    if auth.uid() is not null and p.app_user_id = auth.uid() then
      raise exception 'You cannot record your own Garda vetting. Ask another admin.';
    end if;
    if not p.active then
      raise exception 'This person is switched off. Switch them back on to record vetting.';
    end if;
    if new.happened_on > private.today_in_dublin() then
      raise exception 'The date cannot be in the future.';
    end if;
    if new.kind = 'vetted' then
      if new.expires_on is null then
        raise exception 'A vetting needs an expiry date.';
      end if;
      if new.expires_on <= new.happened_on then
        raise exception 'The expiry date must be after the vetted date.';
      end if;
      if new.expires_on > (new.happened_on + interval '10 years')::date then
        raise exception 'The expiry date cannot be more than 10 years after the vetted date.';
      end if;
    elsif new.expires_on is not null then
      raise exception 'Only a vetting has an expiry date.';
    end if;
    return new;
  end if;

  -- UPDATE: only withdrawing an entry, once, with a reason.
  if old.withdrawn_at is not null then
    raise exception 'This entry is already withdrawn. Nothing more can change.';
  end if;
  if new.person_id is distinct from old.person_id or new.kind is distinct from old.kind
     or new.happened_on is distinct from old.happened_on or new.expires_on is distinct from old.expires_on then
    raise exception 'Vetting entries cannot be changed. Withdraw the wrong one and record a new one.';
  end if;
  if auth.uid() is null then
    raise exception 'An entry must be withdrawn by a signed-in admin.';
  end if;
  if p.app_user_id = auth.uid() then
    raise exception 'You cannot withdraw your own Garda vetting. Ask another admin.';
  end if;
  new.withdrawn_reason := nullif(regexp_replace(trim(coalesce(new.withdrawn_reason, '')), '\s+', ' ', 'g'), '');
  if new.withdrawn_reason is null then
    raise exception 'Withdrawing an entry needs a reason.';
  end if;
  new.withdrawn_by := auth.uid();
  new.withdrawn_at := now();
  return new;
end $$;

create trigger vetting_check before insert or update on public.vetting_records
  for each row execute function private.check_vetting_record();

revoke all on function private.check_vetting_record() from public, anon;
revoke all on function private.today_in_dublin() from public, anon;
grant execute on function private.today_in_dublin() to authenticated, service_role;

-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy vetting_records_read on public.vetting_records for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy vetting_records_add on public.vetting_records for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy vetting_records_withdraw on public.vetting_records for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- Each person's vetting status, worked out every time it is read. The
-- reader's own access rules apply ("security invoker").
--   not_required: their role does not need vetting, or the newest entry
--                 says not required
--   valid / due:  the newest vetting has not expired (due = 60 days or
--                 fewer left; the expiry date is the last valid day)
--   applied:      nothing valid, but an application on or after the newest
--                 vetting
--   expired:      the newest vetting has expired
--   none:         nothing on record
create view public.people_vetting with (security_invoker = true) as
select
  p.id              as person_id,
  p.full_name,
  p.person_role_id,
  p.section_id,
  p.active,
  r.needs_vetting,
  case
    when not r.needs_vetting or latest.kind = 'not_required' then 'not_required'
    when v.expires_on >= t.today and v.expires_on <= t.today + 60 then 'due'
    when v.expires_on > t.today + 60 then 'valid'
    when a.happened_on is not null then 'applied'
    when v.expires_on is not null then 'expired'
    else 'none'
  end               as status,
  v.happened_on     as vetted_on,
  v.expires_on,
  a.happened_on     as applied_on
from public.people p
join public.person_roles r on r.id = p.person_role_id
cross join (select private.today_in_dublin() as today) t
left join lateral (
  select x.kind from public.vetting_records x
  where x.person_id = p.id and x.withdrawn_at is null
  order by x.happened_on desc, x.id desc limit 1
) latest on true
left join lateral (
  select x.happened_on, x.expires_on from public.vetting_records x
  where x.person_id = p.id and x.withdrawn_at is null and x.kind = 'vetted'
  order by x.happened_on desc, x.id desc limit 1
) v on true
left join lateral (
  select x.happened_on from public.vetting_records x
  where x.person_id = p.id and x.withdrawn_at is null and x.kind = 'applied'
    and (v.happened_on is null or x.happened_on >= v.happened_on)
  order by x.happened_on desc, x.id desc limit 1
) a on true;

revoke all on public.people_vetting from public, anon, authenticated, service_role;
grant select on public.people_vetting to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home page counters (migration 0012) gain three vetting numbers, for
-- switched-on people only. Everything else is unchanged.
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
  vetting_due             integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
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
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'due');
end $$;

revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;
