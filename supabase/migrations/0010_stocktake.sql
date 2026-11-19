-- 0010: Stocktake (PLAN.md 5.1 "scan everything in one room; list what was
-- expected but not found; differences become adjustments that a different
-- admin approves", slice 8). Owner's choices, 15 Nov 2026:
--   * A stocktake can be paused and picked up later: scans save as they are
--     made, and each room has at most one unfinished stocktake.
--   * Differences are approved or rejected one by one.
--   * An asset found here that belongs elsewhere becomes "move here", which
--     also needs approval.
--   * A label with no item on it is noted as "unknown label found".
--
-- Three tables, none of which can ever be deleted from:
--   stocktakes             one per room visit: open, then submitted
--   stocktake_scans        every label scanned (never changed)
--   stocktake_differences  worked out by the database when the stocktake is
--                          sent: "missing", "move_here" or "quantity". Each
--                          waits until a DIFFERENT admin (not whoever started,
--                          scanned in or sent the stocktake) approves or
--                          rejects it. A decision is final.
-- An approved difference makes an ordinary asset entry or stock count,
-- linked back to the difference, so the item's history shows where it came from.

-- ---------------------------------------------------------------------------
-- Every location inside a room (the room itself, its store rooms, their shelves).
create function private.location_subtree(p_root uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  with recursive t as (
    select l.id from public.locations l where l.id = p_root
    union all
    select c.id from public.locations c join t on c.parent_id = t.id
  )
  select id from t
$$;
revoke all on function private.location_subtree(uuid) from public;
grant execute on function private.location_subtree(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
create table public.stocktakes (
  id           bigint generated always as identity primary key,
  location_id  uuid not null references public.locations (id),
  status       text not null default 'open' check (status in ('open', 'submitted')),
  submitted_by uuid references auth.users (id),
  submitted_at timestamptz,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);
call private.add_standard_safeguards('stocktakes', 'id');
create unique index stocktakes_one_open_per_room on public.stocktakes (location_id) where status = 'open';
create index stocktakes_recent on public.stocktakes (id desc);

create function private.check_stocktake() returns trigger
language plpgsql set search_path = '' as $$
declare
  loc public.locations%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into loc from public.locations l where l.id = new.location_id;
    if loc.id is null or loc.kind <> 'room' then
      raise exception 'A stocktake is for one room. Pick a room, not a building, store room or shelf.';
    end if;
    if not loc.active then
      raise exception 'That room is switched off. Pick another one.';
    end if;
    if new.status is not null and new.status <> 'open' then
      raise exception 'A new stocktake always starts open.';
    end if;
    if new.submitted_by is not null or new.submitted_at is not null then
      raise exception 'A new stocktake cannot already be sent.';
    end if;
    if exists (select 1 from public.stocktakes s where s.location_id = new.location_id and s.status = 'open') then
      raise exception 'A stocktake of this room is already under way. Carry on with that one.';
    end if;
    new.status := 'open';
    return new;
  end if;

  -- UPDATE: only "send for approval" (submit_stocktake) may change a stocktake.
  if coalesce(current_setting('icci.submitting_stocktake', true), '') <> 'on' then
    raise exception 'A stocktake cannot be changed. It is finished only by sending it for approval.';
  end if;
  if new.location_id is distinct from old.location_id then
    raise exception 'The room of a stocktake cannot be changed.';
  end if;
  return new;
end $$;
create trigger check_stocktake before insert or update on public.stocktakes
  for each row execute function private.check_stocktake();

-- ---------------------------------------------------------------------------
create table public.stocktake_scans (
  id             bigint generated always as identity primary key,
  stocktake_id   bigint not null references public.stocktakes (id),
  label_serial   text not null references public.labels (serial),
  item_id        uuid references public.items (id), -- filled in by the database; empty = unknown label
  found_quantity integer check (found_quantity >= 0 and found_quantity <= 1000000),
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now()
);
call private.add_standard_safeguards('stocktake_scans', 'id');
create index stocktake_scans_stocktake on public.stocktake_scans (stocktake_id, item_id, id);

-- Runs with the database owner's rights so it can hold the stocktake still
-- while checking it (the insert itself is still limited by the rules below).
create function private.check_stocktake_scan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.stocktakes%rowtype;
  it public.items%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Scans cannot be changed. Scan the label again to record a new number.';
  end if;

  select * into st from public.stocktakes s where s.id = new.stocktake_id for share;
  if st.id is null then
    raise exception 'That stocktake could not be found.';
  end if;
  if st.status <> 'open' then
    raise exception 'This stocktake has been sent for approval. It cannot take more scans.';
  end if;
  if new.label_serial is null or not exists (select 1 from public.labels l where l.serial = new.label_serial) then
    raise exception 'That is not an ICCI label number.';
  end if;

  select * into it from public.items i where i.label_serial = new.label_serial;
  new.item_id := it.id; -- always from the label, never typed in

  if it.id is null then
    if new.found_quantity is not null then
      raise exception 'This label has no item on it, so there is nothing to count.';
    end if;
  elsif it.kind = 'fixed_asset' then
    if new.found_quantity is not null then
      raise exception 'An asset is either seen or not. It does not have a quantity.';
    end if;
    if it.condition = 'disposed' then
      raise exception 'This asset has been disposed of. It should not be here: tell the Centre Admin.';
    end if;
  else
    if new.found_quantity is null then
      raise exception 'Enter how many were found on this shelf (the quantity).';
    end if;
    if it.location_id not in (select private.location_subtree(st.location_id)) then
      raise exception 'This shelf belongs to another room. Consumables are not moved: count it in its own room.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_stocktake_scan() from public;
create trigger check_stocktake_scan before insert or update on public.stocktake_scans
  for each row execute function private.check_stocktake_scan();

-- ---------------------------------------------------------------------------
create table public.stocktake_differences (
  id                   bigint generated always as identity primary key,
  stocktake_id         bigint not null references public.stocktakes (id),
  item_id              uuid not null references public.items (id),
  kind                 text not null check (kind in ('missing', 'move_here', 'quantity')),
  expected_location_id uuid references public.locations (id),
  expected_quantity    integer,
  found_quantity       integer,
  status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by           uuid references auth.users (id),
  decided_at           timestamptz,
  decision_note        text check (length(decision_note) <= 1000),
  created_by           uuid references auth.users (id),
  created_at           timestamptz not null default now(),
  updated_by           uuid references auth.users (id),
  updated_at           timestamptz not null default now(),
  unique (stocktake_id, item_id)
);
call private.add_standard_safeguards('stocktake_differences', 'id');
create index stocktake_differences_pending on public.stocktake_differences (status) where status = 'pending';

create function private.check_stocktake_difference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st public.stocktakes%rowtype;
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('icci.submitting_stocktake', true), '') <> 'on' then
      raise exception 'Differences are worked out by the database when a stocktake is sent for approval.';
    end if;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    return new;
  end if;

  -- UPDATE: only a decision on a pending difference.
  if old.status <> 'pending' then
    raise exception 'This difference has already been decided. A decision is final.';
  end if;
  if new.stocktake_id is distinct from old.stocktake_id or new.item_id is distinct from old.item_id
     or new.kind is distinct from old.kind or new.expected_location_id is distinct from old.expected_location_id
     or new.expected_quantity is distinct from old.expected_quantity or new.found_quantity is distinct from old.found_quantity then
    raise exception 'Only the decision on a stocktake difference can be filled in.';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'A difference can only be approved or rejected.';
  end if;
  if auth.uid() is null then
    raise exception 'A difference must be approved or rejected by a signed-in admin.';
  end if;
  select * into st from public.stocktakes s where s.id = old.stocktake_id;
  if auth.uid() = st.created_by or auth.uid() = st.submitted_by or auth.uid() = old.created_by
     or exists (select 1 from public.stocktake_scans sc where sc.stocktake_id = st.id and sc.created_by = auth.uid()) then
    raise exception 'A different admin must approve or reject this difference. Nobody can decide on a stocktake they took part in.';
  end if;
  new.decision_note := nullif(trim(coalesce(new.decision_note, '')), '');
  if new.status = 'rejected' and new.decision_note is null then
    raise exception 'Rejecting a difference needs a reason.';
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;
revoke all on function private.check_stocktake_difference() from public;
create trigger check_stocktake_difference before insert or update on public.stocktake_differences
  for each row execute function private.check_stocktake_difference();

-- ---------------------------------------------------------------------------
-- Links from ordinary entries back to the difference that made them. Only an
-- approved difference may fill this in.
alter table public.stock_movements add column stocktake_difference_id bigint references public.stocktake_differences (id);
alter table public.asset_events add column stocktake_difference_id bigint references public.stocktake_differences (id);

create function private.check_stocktake_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.stocktake_difference_id is distinct from old.stocktake_difference_id then
      raise exception 'The link to a stocktake cannot be changed.';
    end if;
    return new;
  end if;
  if new.stocktake_difference_id is not null
     and coalesce(current_setting('icci.applying_stocktake', true), '') <> 'on' then
    raise exception 'Only an approved stocktake difference can make an entry that links to a stocktake.';
  end if;
  return new;
end $$;
create trigger check_stocktake_link before insert or update on public.stock_movements
  for each row execute function private.check_stocktake_link();
create trigger check_stocktake_link before insert or update on public.asset_events
  for each row execute function private.check_stocktake_link();

-- ---------------------------------------------------------------------------
-- When a difference is approved, make the matching entry. Runs with the
-- database owner's rights; the entry still records the approver as who made it.
create function private.apply_stocktake_difference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st       public.stocktakes%rowtype;
  room     text;
  reporter text;
  current  integer;
  new_qty  integer;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return null;
  end if;
  select * into st from public.stocktakes s where s.id = new.stocktake_id;
  select l.name into room from public.locations l where l.id = st.location_id;
  select u.display_name into reporter from public.app_users u where u.id = st.submitted_by;
  reporter := coalesce(reporter, 'Seed script');

  perform set_config('icci.applying_stocktake', 'on', true);
  if new.kind = 'missing' then
    insert into public.asset_events (item_id, kind, note, reported_by, stocktake_difference_id)
    values (new.item_id, 'missing', format('Not found in the stocktake of %s (stocktake %s).', room, st.id), reporter, new.id);
  elsif new.kind = 'move_here' then
    insert into public.asset_events (item_id, kind, to_location_id, note, reported_by, stocktake_difference_id)
    values (new.item_id, 'move', st.location_id, format('Found in the stocktake of %s (stocktake %s).', room, st.id), reporter, new.id);
  else
    -- The difference found is applied to the stock as it is now, so stock
    -- added between the scan and the approval is not lost. Never below zero.
    select sl.quantity into current from public.stock_levels sl where sl.item_id = new.item_id;
    if new.expected_quantity is null or current is null then
      new_qty := new.found_quantity;
    else
      new_qty := greatest(0, current + new.found_quantity - new.expected_quantity);
    end if;
    insert into public.stock_movements (item_id, kind, quantity, stocktake_difference_id)
    values (new.item_id, 'count', new_qty, new.id);
  end if;
  perform set_config('icci.applying_stocktake', 'off', true);
  return null;
end $$;
revoke all on function private.apply_stocktake_difference() from public;
create trigger apply_stocktake_difference after update on public.stocktake_differences
  for each row execute function private.apply_stocktake_difference();

-- ---------------------------------------------------------------------------
-- Send for approval: works out the differences and closes the stocktake.
create function public.submit_stocktake(p_stocktake_id bigint)
returns public.stocktakes
language plpgsql security definer set search_path = '' as $$
declare
  st public.stocktakes;
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can run a stocktake.' using errcode = '42501';
  end if;
  select * into st from public.stocktakes s where s.id = p_stocktake_id for update;
  if st.id is null then
    raise exception 'That stocktake could not be found.';
  end if;
  if st.status <> 'open' then
    raise exception 'This stocktake has already been sent for approval.';
  end if;
  if not exists (select 1 from public.stocktake_scans sc where sc.stocktake_id = st.id) then
    raise exception 'Nothing has been scanned yet. Scan the labels in the room first.';
  end if;

  perform set_config('icci.submitting_stocktake', 'on', true);

  with latest as (
    select distinct on (sc.item_id) sc.item_id, sc.found_quantity
    from public.stocktake_scans sc
    where sc.stocktake_id = st.id and sc.item_id is not null
    order by sc.item_id, sc.id desc
  ),
  area as (select private.location_subtree(st.location_id) as id)
  insert into public.stocktake_differences (stocktake_id, item_id, kind, expected_location_id, expected_quantity, found_quantity)
  -- Expected here, in use, but not scanned.
  select st.id, i.id, 'missing', i.location_id, null::integer, null::integer
  from public.items i
  where i.kind = 'fixed_asset' and i.condition in ('good', 'fair', 'damaged')
    and i.location_id in (select id from area)
    and i.id not in (select item_id from latest)
  union all
  -- Scanned here, but recorded somewhere else.
  select st.id, i.id, 'move_here', i.location_id, null, null
  from latest lt join public.items i on i.id = lt.item_id
  where i.kind = 'fixed_asset' and i.condition in ('good', 'fair', 'damaged')
    and i.location_id not in (select id from area)
  union all
  -- A shelf counted at a different number.
  select st.id, i.id, 'quantity', null, sl.quantity, lt.found_quantity
  from latest lt join public.items i on i.id = lt.item_id
  left join public.stock_levels sl on sl.item_id = i.id
  where i.kind = 'consumable' and sl.quantity is distinct from lt.found_quantity;

  update public.stocktakes s set status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
  where s.id = st.id
  returning * into st;

  perform set_config('icci.submitting_stocktake', 'off', true);
  return st;
end $$;
revoke all on function public.submit_stocktake(bigint) from public, anon;
grant execute on function public.submit_stocktake(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Row-level security: Super Admin and Centre Admin only. Finance, the library
-- operator and signed-out visitors cannot read or change any of it.
revoke update on public.stocktakes from authenticated;
revoke update on public.stocktake_scans from authenticated;
revoke insert on public.stocktake_differences from authenticated;

create policy stocktakes_read on public.stocktakes for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy stocktakes_add on public.stocktakes for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));

create policy stocktake_scans_read on public.stocktake_scans for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy stocktake_scans_add on public.stocktake_scans for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));

create policy stocktake_differences_read on public.stocktake_differences for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy stocktake_differences_decide on public.stocktake_differences for update to authenticated
  using (private.has_role('super_admin', 'centre_admin') and status = 'pending')
  with check (private.has_role('super_admin', 'centre_admin'));
