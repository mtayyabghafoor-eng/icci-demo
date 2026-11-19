-- 0025: Vehicles (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.3, slice P2.7).
-- Owner's choices, 16 Nov 2026 (all recommended answers):
--   * A vehicle is an ordinary fixed asset (label, location, photo, damage
--     reports) with vehicle details added: registration, make and model,
--     and a keeper from the people directory (any switched-on person, or
--     nobody).
--   * Tax, insurance and NCT are dated entries ("renewed on X, valid until
--     Y"), never typed over. The current date for each is the latest "valid until"
--     date among entries not withdrawn. A wrong entry is withdrawn with a reason.
--   * A vehicle can be marked "NCT not needed yet" (newer cars).
--   * A vehicle record can be switched off (never deleted), for example if
--     the asset is no longer used as a vehicle. A sold or scrapped vehicle
--     is disposed of as an asset, as before; either way it leaves the list.
--   * Status from today in Dublin: valid, due (60 days or fewer), expired,
--     none (nothing recorded), or not_needed (NCT only).
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing.

insert into public.item_categories (name) values ('Vehicles') on conflict do nothing;

-- ---------------------------------------------------------------------------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  item_id          uuid not null unique references public.items (id),
  registration     text not null check (registration ~ '^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$'),
  make_model       text check (length(trim(make_model)) between 1 and 100),
  keeper_person_id uuid references public.people (id),
  nct_needed       boolean not null default true,
  active           boolean not null default true,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now()
);
call private.add_standard_safeguards('vehicles', 'id');
create unique index vehicles_unique_registration on public.vehicles (replace(replace(registration, ' ', ''), '-', ''));
create index vehicles_keeper on public.vehicles (keeper_person_id);

create function private.check_vehicle() returns trigger
language plpgsql set search_path = '' as $$
declare
  it public.items%rowtype;
  keeper_active boolean;
begin
  new.registration := upper(regexp_replace(trim(new.registration), '\s+', ' ', 'g'));
  new.make_model := nullif(regexp_replace(trim(coalesce(new.make_model, '')), '\s+', ' ', 'g'), '');
  if tg_op = 'UPDATE' and new.item_id is distinct from old.item_id then
    raise exception 'A vehicle cannot be moved to another asset.';
  end if;
  if tg_op = 'INSERT' then
    select * into it from public.items x where x.id = new.item_id;
    if it.id is null then
      raise exception 'That asset could not be found.';
    end if;
    if it.kind <> 'fixed_asset' then
      raise exception 'Only a fixed asset can be a vehicle.';
    end if;
    if it.condition = 'disposed' then
      raise exception 'That asset has been disposed of.';
    end if;
  end if;
  if new.keeper_person_id is not null and (tg_op = 'INSERT' or new.keeper_person_id is distinct from old.keeper_person_id) then
    select p.active into keeper_active from public.people p where p.id = new.keeper_person_id;
    if keeper_active is null then
      raise exception 'The keeper must be a person in the people directory.';
    end if;
    if not keeper_active then
      raise exception 'The keeper is switched off. Pick someone who is switched on.';
    end if;
  end if;
  return new;
end $$;

create trigger check_vehicle before insert or update on public.vehicles
  for each row execute function private.check_vehicle();

-- ---------------------------------------------------------------------------
create table public.vehicle_renewals (
  id               bigint generated always as identity primary key,
  vehicle_id       uuid not null references public.vehicles (id),
  kind             text not null check (kind in ('tax', 'insurance', 'nct')),
  renewed_on       date not null,
  valid_until      date not null,
  withdrawn_at     timestamptz,
  withdrawn_by     uuid references auth.users (id),
  withdrawn_reason text check (length(withdrawn_reason) between 1 and 500),
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  constraint vehicle_renewals_after check (valid_until > renewed_on),
  constraint vehicle_renewals_withdrawn_complete check (
    num_nonnulls(withdrawn_at, withdrawn_by, withdrawn_reason) in (0, 3)
  )
);
call private.add_standard_safeguards('vehicle_renewals', 'id');
create index vehicle_renewals_latest on public.vehicle_renewals (vehicle_id, kind, valid_until desc, id desc);

create function private.check_vehicle_renewal() returns trigger
language plpgsql set search_path = '' as $$
declare
  condition text;
begin
  if tg_op = 'INSERT' then
    select case when not v.active then 'off' else i.condition end into condition
      from public.vehicles v join public.items i on i.id = v.item_id where v.id = new.vehicle_id;
    if condition is null then
      raise exception 'That vehicle could not be found.';
    end if;
    if condition = 'disposed' then
      raise exception 'This vehicle has been disposed of. Nothing new can be recorded.';
    end if;
    if condition = 'off' then
      raise exception 'This vehicle is switched off. Switch it back on to record a renewal.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_by is not null or new.withdrawn_reason is not null then
      raise exception 'A new entry cannot already be withdrawn.';
    end if;
    if new.renewed_on > private.today_in_dublin() then
      raise exception 'The renewal date cannot be in the future.';
    end if;
    if new.valid_until <= new.renewed_on then
      raise exception 'The "valid until" date must be after the renewal date.';
    end if;
    if new.valid_until > (new.renewed_on + interval '3 years')::date then
      raise exception 'The "valid until" date cannot be more than 3 years after the renewal.';
    end if;
    return new;
  end if;

  -- UPDATE: only withdrawing an entry, once, with a reason.
  if old.withdrawn_at is not null then
    raise exception 'This entry is already withdrawn. Nothing more can change.';
  end if;
  if new.vehicle_id is distinct from old.vehicle_id or new.kind is distinct from old.kind
     or new.renewed_on is distinct from old.renewed_on or new.valid_until is distinct from old.valid_until then
    raise exception 'Renewal entries cannot be changed. Withdraw the wrong one and record a new one.';
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

create trigger check_vehicle_renewal before insert or update on public.vehicle_renewals
  for each row execute function private.check_vehicle_renewal();

revoke all on function private.check_vehicle() from public, anon;
revoke all on function private.check_vehicle_renewal() from public, anon;

-- Access: Super Admin and Centre Admin only. No delete (standard safeguards).
create policy vehicles_read on public.vehicles for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy vehicles_add on public.vehicles for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy vehicles_change on public.vehicles for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy vehicle_renewals_read on public.vehicle_renewals for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy vehicle_renewals_add on public.vehicle_renewals for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy vehicle_renewals_withdraw on public.vehicle_renewals for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- The status of one date, on its own so it can be checked with any dates.
create function public.renewal_status(p_valid_until date, p_today date)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_valid_until is null then 'none'
    when p_valid_until < p_today then 'expired'
    when p_valid_until <= p_today + 60 then 'due'
    else 'valid'
  end
$$;
revoke all on function public.renewal_status(date, date) from public, anon;
grant execute on function public.renewal_status(date, date) to authenticated, service_role;

-- One row per vehicle: its details, the asset's name and condition, and for
-- tax, insurance and NCT the newest entry's "valid until" date and status.
-- The reader's own access rules apply.
create view public.vehicle_status with (security_invoker = true) as
select
  v.id,
  v.item_id,
  v.registration,
  v.make_model,
  v.keeper_person_id,
  v.nct_needed,
  v.active,
  i.name               as item_name,
  i.label_serial,
  i.condition,
  tax.valid_until      as tax_until,
  public.renewal_status(tax.valid_until, t.today) as tax_status,
  ins.valid_until      as insurance_until,
  public.renewal_status(ins.valid_until, t.today) as insurance_status,
  nct.valid_until      as nct_until,
  case
    when not v.nct_needed and nct.valid_until is null then 'not_needed'
    else public.renewal_status(nct.valid_until, t.today)
  end                  as nct_status
from public.vehicles v
join public.items i on i.id = v.item_id
cross join (select private.today_in_dublin() as today) t
left join lateral (
  select r.valid_until from public.vehicle_renewals r
  where r.vehicle_id = v.id and r.kind = 'tax' and r.withdrawn_at is null
  order by r.valid_until desc, r.id desc limit 1
) tax on true
left join lateral (
  select r.valid_until from public.vehicle_renewals r
  where r.vehicle_id = v.id and r.kind = 'insurance' and r.withdrawn_at is null
  order by r.valid_until desc, r.id desc limit 1
) ins on true
left join lateral (
  select r.valid_until from public.vehicle_renewals r
  where r.vehicle_id = v.id and r.kind = 'nct' and r.withdrawn_at is null
  order by r.valid_until desc, r.id desc limit 1
) nct on true;

revoke all on public.vehicle_status from public, anon, authenticated, service_role;
grant select on public.vehicle_status to authenticated, service_role;
