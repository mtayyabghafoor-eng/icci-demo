-- 0014: Audit fixes 1, 2, 6, 7 and 8 (audit of slices 1 to 8, 15 Nov 2026),
-- and faster lists (slice 9 noted slow searches).
--
--   1. A stocktake that scans an asset marked missing now lists it as
--      "found". The approver says whether it is in good or fair condition.
--   2. A stocktake difference cannot be approved once its facts are out of
--      date (the asset was moved, reported, found, or has a disposal
--      waiting). It can still be rejected with a reason.
--   6. Rules no longer rely on settings that could be switched on by hand.
--      Each special change now checks that the entry it comes from really
--      exists and was saved in the same step.
--   7. A place cannot be switched off while something is still in it, and
--      nothing can be put inside a switched-off place.
--   8. A second security report checks views, database functions, settings,
--      file stores and access rules, not only tables.
--   Speed: every access rule now checks the role once per search instead of
--      once for every row it looks at.

-- ===========================================================================
-- Shared helper (fix 6): was this row saved in the current step (database
-- transaction)? Each saved row carries the number of the step that wrote it.
create function private.written_in_this_transaction(row_xmin xid) returns boolean
language sql stable set search_path = '' as $$
  select row_xmin = pg_catalog.xid(pg_catalog.pg_current_xact_id())
$$;
revoke all on function private.written_in_this_transaction(xid) from public;
grant execute on function private.written_in_this_transaction(xid) to authenticated, service_role;

-- ===========================================================================
-- Fix 6, items: the location or condition changes only when an asset entry
-- saying exactly that was saved in the same step.
create or replace function private.check_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  loc_kind   text;
  loc_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      raise exception 'The kind of item cannot be changed.';
    end if;
    if new.label_serial is distinct from old.label_serial then
      raise exception 'The label on an item cannot be changed.';
    end if;
    if new.location_id is distinct from old.location_id and not exists (
      select 1 from public.asset_events e
      where e.item_id = new.id and e.kind = 'move' and e.status = 'recorded'
        and e.to_location_id = new.location_id
        and private.written_in_this_transaction(e.xmin)
    ) then
      raise exception 'An item cannot be moved by editing it. Use "Move" on the item page.';
    end if;
    if new.condition is distinct from old.condition and not exists (
      select 1 from public.asset_events e
      where e.item_id = new.id and e.kind <> 'move' and e.status in ('recorded', 'approved')
        and e.to_condition = new.condition
        and private.written_in_this_transaction(e.xmin)
    ) then
      raise exception 'The condition cannot be changed by editing. Use "Report damage", "Mark missing" or "Dispose" on the item page.';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.items i where i.label_serial = new.label_serial) then
      raise exception 'This label is already on another item.';
    end if;
    if new.condition = 'disposed' then
      raise exception 'A new item cannot start as disposed.';
    end if;
    select l.kind, l.active into loc_kind, loc_active from public.locations l where l.id = new.location_id;
    if not coalesce(loc_active, false) then
      raise exception 'That location is switched off. Pick another one.';
    end if;
    if new.kind = 'consumable' and loc_kind not in ('store_room', 'shelf') then
      raise exception 'A consumable must be in a store room or on a shelf.';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.item_categories c where c.id = new.category_id and c.active) then
    raise exception 'That category is switched off. Pick another one.';
  end if;
  return new;
end $$;

-- The item follows a saved asset entry (no setting needed any more).
create or replace function private.apply_asset_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('recorded', 'approved') then
    return null; -- pending or rejected: the item does not change
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return null;
  end if;
  if new.kind = 'move' then
    update public.items set location_id = new.to_location_id where id = new.item_id;
  else
    update public.items set condition = new.to_condition where id = new.item_id;
  end if;
  return null;
end $$;

-- ===========================================================================
-- Fix 1: "found" differences.
alter table public.stocktake_differences drop constraint stocktake_differences_kind_check;
alter table public.stocktake_differences add constraint stocktake_differences_kind_check
  check (kind in ('missing', 'move_here', 'quantity', 'found'));
-- Chosen by the approver when approving a "found" difference.
alter table public.stocktake_differences add column found_condition text
  check (found_condition in ('good', 'fair'));

create or replace function private.stocktake_findings(p_stocktake_id bigint)
returns table (item_id uuid, kind text, expected_location_id uuid, expected_quantity integer, found_quantity integer)
language sql stable security definer set search_path = '' as $$
  with st as (select s.id, s.location_id from public.stocktakes s where s.id = p_stocktake_id),
  latest as (
    select distinct on (sc.item_id) sc.item_id, sc.found_quantity
    from public.stocktake_scans sc
    where sc.stocktake_id = p_stocktake_id and sc.item_id is not null
    order by sc.item_id, sc.id desc
  ),
  area as (select private.location_subtree((select location_id from st)) as id)
  -- Expected here, in use, but not scanned.
  select i.id, 'missing'::text, i.location_id, null::integer, null::integer
  from public.items i
  where i.kind = 'fixed_asset' and i.condition in ('good', 'fair', 'damaged')
    and i.location_id in (select id from area)
    and i.id not in (select l.item_id from latest l)
  union all
  -- Scanned here, but recorded somewhere else.
  select i.id, 'move_here', i.location_id, null, null
  from latest lt join public.items i on i.id = lt.item_id
  where i.kind = 'fixed_asset' and i.condition in ('good', 'fair', 'damaged')
    and i.location_id not in (select id from area)
  union all
  -- Scanned here, but marked missing (here or anywhere else).
  select i.id, 'found', i.location_id, null, null
  from latest lt join public.items i on i.id = lt.item_id
  where i.kind = 'fixed_asset' and i.condition = 'missing'
  union all
  -- A shelf counted at a different number from the stock as it is now.
  select i.id, 'quantity', null, sl.quantity, lt.found_quantity
  from latest lt join public.items i on i.id = lt.item_id
  left join public.stock_levels sl on sl.item_id = i.id
  where i.kind = 'consumable' and sl.quantity is distinct from lt.found_quantity
$$;
revoke all on function private.stocktake_findings(bigint) from public;

-- ===========================================================================
-- Fix 6, stocktakes: only "send for approval" closes one, by a signed-in
-- admin, and (checked when the step finishes) with exactly the differences
-- the database works out.
create or replace function private.check_stocktake() returns trigger
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

  -- UPDATE: only open -> sent.
  if old.status <> 'open' or new.status is distinct from 'submitted' then
    raise exception 'A stocktake cannot be changed. It is finished only by sending it for approval.';
  end if;
  if new.location_id is distinct from old.location_id then
    raise exception 'The room of a stocktake cannot be changed.';
  end if;
  if auth.uid() is null then
    raise exception 'A stocktake must be sent for approval by a signed-in admin.';
  end if;
  new.submitted_by := auth.uid();
  new.submitted_at := now();
  return new;
end $$;

create function private.check_stocktake_sent() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'submitted' and old.status = 'open' then
    if exists (
      (select f.item_id, f.kind, f.expected_location_id, f.expected_quantity, f.found_quantity
       from private.stocktake_findings(new.id) f
       except
       select d.item_id, d.kind, d.expected_location_id, d.expected_quantity, d.found_quantity
       from public.stocktake_differences d where d.stocktake_id = new.id)
      union all
      (select d.item_id, d.kind, d.expected_location_id, d.expected_quantity, d.found_quantity
       from public.stocktake_differences d where d.stocktake_id = new.id
       except
       select f.item_id, f.kind, f.expected_location_id, f.expected_quantity, f.found_quantity
       from private.stocktake_findings(new.id) f)
    ) then
      raise exception 'A stocktake can only be sent with the differences the database works out.';
    end if;
  end if;
  return null;
end $$;
revoke all on function private.check_stocktake_sent() from public;

-- Runs when the step finishes, after the differences have been saved.
create constraint trigger check_stocktake_sent after update on public.stocktakes
  deferrable initially deferred
  for each row execute function private.check_stocktake_sent();

create or replace function public.submit_stocktake(p_stocktake_id bigint)
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

  update public.stocktakes s set status = 'submitted' where s.id = st.id returning * into st;

  insert into public.stocktake_differences (stocktake_id, item_id, kind, expected_location_id, expected_quantity, found_quantity)
  select st.id, f.item_id, f.kind, f.expected_location_id, f.expected_quantity, f.found_quantity
  from private.stocktake_findings(st.id) f;
  return st;
end $$;

-- ===========================================================================
-- Differences: added only by sending (fix 6); "found" needs a condition
-- (fix 1); approving is refused when the facts are out of date (fix 2).
create or replace function private.check_stocktake_difference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st        public.stocktakes%rowtype;
  st_status text;
  st_xmin   xid;
  it        public.items%rowtype;
begin
  if tg_op = 'INSERT' then
    select s.status, s.xmin into st_status, st_xmin from public.stocktakes s where s.id = new.stocktake_id;
    if st_status is distinct from 'submitted' or not private.written_in_this_transaction(st_xmin) then
      raise exception 'Differences are worked out by the database when a stocktake is sent for approval.';
    end if;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.found_condition := null;
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

  if new.status = 'rejected' then
    if new.decision_note is null then
      raise exception 'Rejecting a difference needs a reason.';
    end if;
    new.found_condition := null;
  else
    if old.kind = 'found' then
      if new.found_condition is null or new.found_condition not in ('good', 'fair') then
        raise exception 'Say whether the asset is in good or fair condition now.';
      end if;
    elsif new.found_condition is not null then
      raise exception 'Only a "found" difference takes a condition.';
    end if;

    -- Fix 2: an asset difference must still match the asset as it is now.
    if old.kind <> 'quantity' then
      select * into it from public.items i where i.id = old.item_id for update;
      if exists (select 1 from public.asset_events e where e.item_id = it.id and e.status = 'pending') then
        raise exception 'A disposal of this asset is waiting for approval. Decide the disposal first, or reject this difference with a reason.';
      end if;
      if it.condition = 'disposed'
         or it.location_id is distinct from old.expected_location_id
         or ((old.kind = 'found') <> (it.condition = 'missing'))
         or exists (select 1 from public.asset_events e where e.item_id = it.id and e.created_at > st.submitted_at) then
        raise exception 'This asset has changed since the stocktake was sent (it was moved, reported or found). Reject this difference with a reason, then check the asset.';
      end if;
    end if;
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;

-- Fix 6: an entry may link to a stocktake difference only when that
-- difference was approved in the same step, for the same item.
create or replace function private.check_stocktake_link() returns trigger
language plpgsql set search_path = '' as $$
declare
  d_status text;
  d_item   uuid;
  d_xmin   xid;
begin
  if tg_op = 'UPDATE' then
    if new.stocktake_difference_id is distinct from old.stocktake_difference_id then
      raise exception 'The link to a stocktake cannot be changed.';
    end if;
    return new;
  end if;
  if new.stocktake_difference_id is not null then
    select d.status, d.item_id, d.xmin into d_status, d_item, d_xmin
    from public.stocktake_differences d where d.id = new.stocktake_difference_id;
    if d_status is distinct from 'approved' or d_item is distinct from new.item_id
       or not private.written_in_this_transaction(d_xmin) then
      raise exception 'Only an approved stocktake difference can make an entry that links to a stocktake.';
    end if;
  end if;
  return new;
end $$;

-- When a difference is approved, make the matching entry (or entries).
create or replace function private.apply_stocktake_difference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st       public.stocktakes%rowtype;
  room     text;
  reporter text;
  current  integer;
  new_qty  integer;
  was_at   uuid;
begin
  if new.status <> 'approved' or old.status = 'approved' then
    return null;
  end if;
  select * into st from public.stocktakes s where s.id = new.stocktake_id;
  select l.name into room from public.locations l where l.id = st.location_id;
  select u.display_name into reporter from public.app_users u where u.id = st.submitted_by;
  reporter := coalesce(reporter, 'Seed script');

  if new.kind = 'missing' then
    insert into public.asset_events (item_id, kind, note, reported_by, stocktake_difference_id)
    values (new.item_id, 'missing', format('Not found in the stocktake of %s (stocktake %s).', room, st.id), reporter, new.id);
  elsif new.kind = 'move_here' then
    insert into public.asset_events (item_id, kind, to_location_id, note, reported_by, stocktake_difference_id)
    values (new.item_id, 'move', st.location_id, format('Found in the stocktake of %s (stocktake %s).', room, st.id), reporter, new.id);
  elsif new.kind = 'found' then
    insert into public.asset_events (item_id, kind, to_condition, note, reported_by, stocktake_difference_id)
    values (new.item_id, 'back_in_use', new.found_condition,
            format('Found in the stocktake of %s (stocktake %s).', room, st.id), reporter, new.id);
    select i.location_id into was_at from public.items i where i.id = new.item_id;
    if was_at not in (select private.location_subtree(st.location_id)) then
      insert into public.asset_events (item_id, kind, to_location_id, note, reported_by, stocktake_difference_id)
      values (new.item_id, 'move', st.location_id, format('Found in the stocktake of %s (stocktake %s).', room, st.id), reporter, new.id);
    end if;
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
  return null;
end $$;

-- ===========================================================================
-- Fix 7: switching places off.
create or replace function private.check_location_tree() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  expected      text;
  parent_kind   text;
  parent_active boolean;
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'The kind of location cannot be changed. Deactivate it and add a new one.';
  end if;

  expected := case new.kind
    when 'room' then 'building'
    when 'store_room' then 'room'
    when 'shelf' then 'store_room'
  end;

  if new.parent_id is not null then
    select l.kind, l.active into parent_kind, parent_active from public.locations l where l.id = new.parent_id;
  end if;

  if new.kind = 'building' and new.parent_id is not null then
    raise exception 'A building cannot be inside another location.';
  end if;
  if expected is not null and parent_kind is distinct from expected then
    raise exception 'A % must be inside a %.', replace(new.kind, '_', ' '), replace(expected, '_', ' ');
  end if;

  -- A place that is on must sit inside a place that is on.
  if new.active and new.parent_id is not null and not coalesce(parent_active, false)
     and (tg_op = 'INSERT' or new.parent_id is distinct from old.parent_id or not old.active) then
    raise exception 'The place it is inside is switched off. Pick another one, or switch that place back on first.';
  end if;

  -- Switching off: only an empty place, with nothing under way.
  if tg_op = 'UPDATE' and old.active and not new.active then
    if exists (select 1 from public.locations c where c.parent_id = new.id and c.active) then
      raise exception 'Switch off the places inside it first.';
    end if;
    if exists (
      select 1 from public.items i
      left join public.stock_levels sl on sl.item_id = i.id
      where i.location_id in (select private.location_subtree(new.id))
        and ((i.kind = 'fixed_asset' and i.condition <> 'disposed')
             or (i.kind = 'consumable' and (sl.quantity is null or sl.quantity > 0)))
    ) then
      raise exception 'This place still holds items. Move or dispose of its assets, and count its shelves down to zero, before switching it off.';
    end if;
    if exists (
      select 1 from public.stocktakes s
      where s.status = 'open' and new.id in (select private.location_subtree(s.location_id))
    ) then
      raise exception 'A stocktake of this room is under way. Send it for approval before switching the place off.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_location_tree() from public;

-- ===========================================================================
-- Speed: check the role once per search, not once per row.
alter policy roles_read on public.roles using ((select private.current_app_role()) is not null);
alter policy roles_add on public.roles with check ((select private.has_role('super_admin')));
alter policy roles_change on public.roles
  using ((select private.has_role('super_admin'))) with check ((select private.has_role('super_admin')));

alter policy app_users_read on public.app_users using (
  (id = (select auth.uid()) and (select private.current_app_role()) is not null)
  or (select private.has_role('super_admin', 'centre_admin', 'finance'))
);
alter policy app_users_add on public.app_users with check ((select private.has_role('super_admin')));
alter policy app_users_change on public.app_users
  using ((select private.has_role('super_admin'))) with check ((select private.has_role('super_admin')));

alter policy audit_log_read on public.audit_log using ((select private.has_role('super_admin')));

alter policy locations_read on public.locations using ((select private.has_role('super_admin', 'centre_admin')));
alter policy locations_add on public.locations with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy locations_change on public.locations
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

alter policy item_categories_read on public.item_categories using ((select private.has_role('super_admin', 'centre_admin')));
alter policy item_categories_add on public.item_categories with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy item_categories_change on public.item_categories
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

alter policy labels_read on public.labels using ((select private.has_role('super_admin', 'centre_admin')));

alter policy items_read on public.items using ((select private.has_role('super_admin', 'centre_admin')));
alter policy items_add on public.items with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy items_change on public.items
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

alter policy stock_movements_read on public.stock_movements using ((select private.has_role('super_admin', 'centre_admin')));
alter policy stock_movements_add on public.stock_movements with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy stock_movements_decide on public.stock_movements
  using ((select private.has_role('super_admin', 'centre_admin')) and kind = 'adjustment' and status = 'pending')
  with check ((select private.has_role('super_admin', 'centre_admin')));

alter policy asset_events_read on public.asset_events using ((select private.has_role('super_admin', 'centre_admin')));
alter policy asset_events_add on public.asset_events with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy asset_events_decide on public.asset_events
  using ((select private.has_role('super_admin', 'centre_admin')) and kind = 'disposal' and status = 'pending')
  with check ((select private.has_role('super_admin', 'centre_admin')));

alter policy label_print_runs_read on public.label_print_runs using ((select private.has_role('super_admin', 'centre_admin')));

alter policy stocktakes_read on public.stocktakes using ((select private.has_role('super_admin', 'centre_admin')));
alter policy stocktakes_add on public.stocktakes with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy stocktake_scans_read on public.stocktake_scans using ((select private.has_role('super_admin', 'centre_admin')));
alter policy stocktake_scans_add on public.stocktake_scans with check ((select private.has_role('super_admin', 'centre_admin')));
alter policy stocktake_differences_read on public.stocktake_differences
  using ((select private.has_role('super_admin', 'centre_admin')));
alter policy stocktake_differences_decide on public.stocktake_differences
  using ((select private.has_role('super_admin', 'centre_admin')) and status = 'pending')
  with check ((select private.has_role('super_admin', 'centre_admin')));

alter policy item_photos_read on storage.objects
  using (bucket_id = 'item-photos' and (select private.has_role('super_admin', 'centre_admin')));
alter policy item_photos_add on storage.objects
  with check (bucket_id = 'item-photos' and (select private.has_role('super_admin', 'centre_admin')));

-- ===========================================================================
-- Fix 8: nothing new is open to everyone by default, and what exists is closed.
alter default privileges in schema public revoke execute on functions from public, anon;
alter default privileges in schema private revoke execute on functions from public, anon;
revoke execute on all functions in schema private from public, anon;
revoke execute on all functions in schema public from public, anon;

-- The second security report: one row per problem. Empty means all is well.
create function public.security_problems()
returns table (object_kind text, object_name text, problem text)
language sql stable security definer set search_path = '' as $$
  -- Views must apply the reader's own access rules.
  select 'view', c.relname::text, 'does not apply the reader''s own access rules'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and (c.relkind = 'm' or not exists (
      select 1 from pg_catalog.unnest(coalesce(c.reloptions, '{}'::text[])) o
      where o in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')))
  union all
  -- Signed-out visitors must not reach any table or view.
  select 'anon_access', c.relname::text, 'signed-out visitors have access'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  union all
  -- ... or any database function.
  select 'function_open', n.nspname || '.' || p.proname, 'signed-out visitors can run it'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
  union all
  -- Functions with the owner's rights must fix where they look things up.
  select 'function_search_path', n.nspname || '.' || p.proname, 'runs with the owner''s rights but does not fix search_path'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from pg_catalog.unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
  union all
  -- No rule may depend on a setting that could be switched on by hand.
  select 'setting_flag', n.nspname || '.' || p.proname, 'relies on a setting that could be switched on by hand'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc ~* 'current_setting\s*\(\s*''icci\.'
  union all
  -- Access rules must check the role once per search, not once per row.
  select 'policy_per_row', pol.schemaname || '.' || pol.tablename || '.' || pol.policyname,
         'checks the role or the signed-in person once for every row'
  from pg_catalog.pg_policies pol
  where pol.schemaname in ('public', 'storage')
    and pg_catalog.regexp_replace(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''),
          '\( SELECT (private\.has_role|private\.current_app_role|auth\.uid)\(', '', 'g')
        ~ '(private\.has_role|private\.current_app_role|auth\.uid)\('
  union all
  -- No file store may be public.
  select 'public_bucket', b.id::text, 'files can be opened without signing in'
  from storage.buckets b
  where b.public
$$;
revoke all on function public.security_problems() from public, anon, authenticated;
grant execute on function public.security_problems() to service_role;
