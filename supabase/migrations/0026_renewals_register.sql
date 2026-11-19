-- 0026: Renewals register (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.3, slice P2.8).
-- Owner's choices, 16 Nov 2026 (all recommended answers):
--   * A typed-in renewal: title, category (a short fixed list), owner (a
--     switched-on person from the directory, or nobody), documents needed,
--     notes. Switched off, never deleted.
--   * Its due date is a dated entry, never typed over. "Mark renewed" adds a
--     new entry (renewed on, next due). The latest due date among entries
--     not withdrawn counts. A wrong entry is withdrawn with a reason.
--   * The register is one read-only view that also reads, never copies:
--     vehicle tax, insurance and NCT; Garda vetting expiry; policy review
--     dates; asset warranty end dates. Training dates are left out.
--   * Status from today in Dublin: overdue (red), due (60 days or fewer,
--     amber), ok (green), none (no due date). A warranty that has ended is
--     "ended" (grey), not overdue: warranties are not renewed.
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing (the view uses the reader's own access rules).
--   * Email reminders are slice P2.9, not here.

-- ---------------------------------------------------------------------------
create table public.renewals (
  id               uuid primary key default gen_random_uuid(),
  title            text not null check (length(title) between 1 and 150),
  category         text not null check (category in (
                     'Insurance', 'Licence or permit', 'Safety inspection', 'Service contract',
                     'Certificate', 'Subscription', 'Other')),
  owner_person_id  uuid references public.people (id),
  documents_needed text check (length(documents_needed) between 1 and 1000),
  notes            text check (length(notes) between 1 and 2000),
  active           boolean not null default true,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now()
);
call private.add_standard_safeguards('renewals', 'id');
create index renewals_owner on public.renewals (owner_person_id);

create function private.check_renewal() returns trigger
language plpgsql set search_path = '' as $$
declare
  owner_active boolean;
begin
  new.title := regexp_replace(trim(coalesce(new.title, '')), '\s+', ' ', 'g');
  if new.title = '' then
    raise exception 'A renewal needs a title.';
  end if;
  new.documents_needed := nullif(trim(coalesce(new.documents_needed, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  if new.owner_person_id is not null and (tg_op = 'INSERT' or new.owner_person_id is distinct from old.owner_person_id) then
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

create trigger check_renewal before insert or update on public.renewals
  for each row execute function private.check_renewal();

-- ---------------------------------------------------------------------------
-- Due dates. The first entry has no "renewed on" (the due date as first
-- entered); each "Mark renewed" adds one with both dates.
create table public.renewal_dates (
  id               bigint generated always as identity primary key,
  renewal_id       uuid not null references public.renewals (id),
  renewed_on       date,
  due_on           date not null,
  withdrawn_at     timestamptz,
  withdrawn_by     uuid references auth.users (id),
  withdrawn_reason text check (length(withdrawn_reason) between 1 and 500),
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  constraint renewal_dates_after check (renewed_on is null or due_on > renewed_on),
  constraint renewal_dates_withdrawn_complete check (
    num_nonnulls(withdrawn_at, withdrawn_by, withdrawn_reason) in (0, 3)
  )
);
call private.add_standard_safeguards('renewal_dates', 'id');
create index renewal_dates_latest on public.renewal_dates (renewal_id, due_on desc, id desc);

create function private.check_renewal_date() returns trigger
language plpgsql set search_path = '' as $$
declare
  is_active boolean;
  today date := private.today_in_dublin();
begin
  if tg_op = 'INSERT' then
    select r.active into is_active from public.renewals r where r.id = new.renewal_id;
    if is_active is null then
      raise exception 'That renewal could not be found.';
    end if;
    if not is_active then
      raise exception 'This renewal is switched off. Switch it back on to record a new date.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_by is not null or new.withdrawn_reason is not null then
      raise exception 'A new entry cannot already be withdrawn.';
    end if;
    if new.renewed_on is not null and new.renewed_on > today then
      raise exception 'The renewal date cannot be in the future.';
    end if;
    if new.renewed_on is not null and new.due_on <= new.renewed_on then
      raise exception 'The next due date must be after the renewal date.';
    end if;
    if new.due_on > (today + interval '10 years')::date then
      raise exception 'The due date cannot be more than 10 years from today.';
    end if;
    return new;
  end if;

  -- UPDATE: only withdrawing an entry, once, with a reason.
  if old.withdrawn_at is not null then
    raise exception 'This entry is already withdrawn. Nothing more can change.';
  end if;
  if new.renewal_id is distinct from old.renewal_id or new.renewed_on is distinct from old.renewed_on
     or new.due_on is distinct from old.due_on then
    raise exception 'Due dates cannot be changed. Withdraw the wrong entry and record a new one.';
  end if;
  if auth.uid() is null then
    raise exception 'An entry must be withdrawn by a signed-in admin.';
  end if;
  new.withdrawn_reason := nullif(regexp_replace(trim(coalesce(new.withdrawn_reason, '')), '\s+', ' ', 'g'), '');
  if new.withdrawn_reason is null then
    raise exception 'Withdrawing an entry needs a reason.';
  end if;
  new.withdrawn_by := auth.uid();
  new.withdrawn_at := now();
  return new;
end $$;

create trigger check_renewal_date before insert or update on public.renewal_dates
  for each row execute function private.check_renewal_date();

revoke all on function private.check_renewal() from public, anon;
revoke all on function private.check_renewal_date() from public, anon;

-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy renewals_read on public.renewals for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy renewals_add on public.renewals for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy renewals_change on public.renewals for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy renewal_dates_read on public.renewal_dates for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy renewal_dates_add on public.renewal_dates for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy renewal_dates_withdraw on public.renewal_dates for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- Adds a renewal and its first due date together (both or neither). Runs as
-- the caller, so the access rules above still decide.
create function public.add_renewal(
  p_title            text,
  p_category         text,
  p_owner_person_id  uuid,
  p_documents_needed text,
  p_notes            text,
  p_due_on           date
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  new_id uuid;
begin
  if p_due_on is null then
    raise exception 'A renewal needs a due date.';
  end if;
  insert into public.renewals (title, category, owner_person_id, documents_needed, notes)
    values (p_title, p_category, p_owner_person_id, p_documents_needed, p_notes)
    returning id into new_id;
  insert into public.renewal_dates (renewal_id, due_on) values (new_id, p_due_on);
  return new_id;
end $$;
revoke all on function public.add_renewal(text, text, uuid, text, text, date) from public, anon;
grant execute on function public.add_renewal(text, text, uuid, text, text, date) to authenticated, service_role;

-- The status of one date, on its own so it can be checked with any dates.
create function public.register_status(p_due_on date, p_today date, p_is_warranty boolean default false)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_due_on is null then 'none'
    when p_due_on < p_today and p_is_warranty then 'ended'
    when p_due_on < p_today then 'overdue'
    when p_due_on <= p_today + 60 then 'due'
    else 'ok'
  end
$$;
revoke all on function public.register_status(date, date, boolean) from public, anon;
grant execute on function public.register_status(date, date, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The register: one row per date that needs renewing.
--   source:    manual, vehicle_tax, vehicle_insurance, vehicle_nct, vetting,
--              policy_review, warranty
--   record_id: the renewal, vehicle, person, policy or item it belongs to
-- The reader's own access rules apply to every table it reads.
create view public.renewals_register with (security_invoker = true) as
with t as (select private.today_in_dublin() as today)
select
  'manual'::text        as source,
  r.id                  as record_id,
  r.title,
  r.category,
  r.owner_person_id,
  d.due_on,
  public.register_status(d.due_on, t.today) as status,
  null::text            as note
from public.renewals r
cross join t
left join lateral (
  select x.due_on from public.renewal_dates x
  where x.renewal_id = r.id and x.withdrawn_at is null
  order by x.due_on desc, x.id desc limit 1
) d on true
where r.active

union all
select
  'vehicle_' || k.kind,
  v.id,
  k.label || ': ' || v.registration || coalesce(' (' || v.make_model || ')', ''),
  'Vehicles',
  v.keeper_person_id,
  k.until,
  public.register_status(k.until, t.today),
  null
from public.vehicle_status v
cross join t
cross join lateral (values
  ('tax', 'Motor tax', v.tax_until),
  ('insurance', 'Vehicle insurance', v.insurance_until),
  ('nct', 'NCT', v.nct_until)
) as k (kind, label, until)
where v.active and v.condition <> 'disposed' and k.until is not null

union all
select
  'vetting',
  pv.person_id,
  'Garda vetting: ' || pv.full_name,
  'Garda vetting',
  pv.person_id,
  pv.expires_on,
  public.register_status(pv.expires_on, t.today),
  case when pv.applied_on is not null then 'Re-vetting applied on ' || to_char(pv.applied_on, 'FMDD Mon YYYY') end
from public.people_vetting pv
cross join t
where pv.active and pv.needs_vetting and pv.status <> 'not_required' and pv.expires_on is not null

union all
select
  'policy_review',
  po.id,
  'Policy review: ' || po.title || ' (version ' || po.current_label || ')',
  'Policies',
  po.owner_person_id,
  po.next_review_on,
  public.register_status(po.next_review_on, t.today),
  null
from public.policies_overview po
cross join t
where po.active and po.current_version_id is not null

union all
select
  'warranty',
  i.id,
  'Warranty: ' || i.name || ' (' || i.label_serial || ')',
  'Warranties',
  null::uuid,
  i.warranty_end,
  public.register_status(i.warranty_end, t.today, true),
  null
from public.items i
cross join t
where i.kind = 'fixed_asset' and i.condition <> 'disposed' and i.warranty_end is not null;

revoke all on public.renewals_register from public, anon, authenticated, service_role;
grant select on public.renewals_register to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home page counters gain two renewals numbers (PLAN.md 5.7: "renewals due
-- in 30 days"). Everything else is unchanged from migration 0024.
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
  renewals_due_30         integer
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
    (select count(*)::integer from public.renewals_register rr where rr.status = 'due' and rr.due_on <= today + 30);
end $$;

revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;
