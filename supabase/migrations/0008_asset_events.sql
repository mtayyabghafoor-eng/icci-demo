-- 0008: Fixed assets: move, damage, missing, found or repaired, disposal
-- (PLAN.md 5.1 admin action 4, slice 6).
--
-- Every one of these is one row in asset_events, and rows are never changed
-- or deleted. Kinds:
--   move         the asset went to another place (to_location_id)
--   damage       condition becomes "damaged"
--   missing      condition becomes "missing"
--   back_in_use  a damaged asset was repaired, or a missing one found:
--                condition becomes "good" or "fair" (to_condition)
--   disposal     condition becomes "disposed", but only once a DIFFERENT
--                admin approves it (owner's choice, 14 Nov 2026). Disposed
--                is final.
-- Each needs a note and who reported it (free text until the people
-- directory exists in Phase 2), and may have a photo.
--
-- The item's own location and condition are changed ONLY by the database,
-- from these events. Typing over them is still refused (see check_item).

create table public.asset_events (
  id               bigint generated always as identity primary key,
  item_id          uuid not null references public.items (id),
  kind             text not null check (kind in ('move', 'damage', 'missing', 'back_in_use', 'disposal')),
  -- Filled in by the database from the item, so they cannot be faked:
  from_location_id uuid references public.locations (id),
  from_condition   text check (from_condition in ('good', 'fair', 'damaged', 'missing')),
  -- Where it went (move only) and the condition it now has:
  to_location_id   uuid references public.locations (id),
  to_condition     text check (to_condition in ('good', 'fair', 'damaged', 'missing', 'disposed')),
  note             text not null check (length(note) <= 2000),
  reported_by      text not null check (length(reported_by) <= 200),
  photo_path       text check (photo_path ~ '^[A-Za-z0-9/_.-]+$' and photo_path !~ '\.\.'),
  status           text not null check (status in ('recorded', 'pending', 'approved', 'rejected')),
  decided_by       uuid references auth.users (id),
  decided_at       timestamptz,
  decision_note    text check (length(decision_note) <= 1000),
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now()
);
call private.add_standard_safeguards('asset_events', 'id');

create index asset_events_item on public.asset_events (item_id, id);
create index asset_events_pending on public.asset_events (status) where status = 'pending';
-- Only one disposal of an asset may wait for approval at a time.
create unique index asset_events_one_pending_per_item on public.asset_events (item_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- The rules for a new event, and for deciding on a disposal.
create function private.check_asset_event() returns trigger
language plpgsql set search_path = '' as $$
declare
  it        public.items%rowtype;
  loc_ok    boolean;
begin
  if tg_op = 'INSERT' then
    -- Lock the item so two events for it are handled one after the other.
    select * into it from public.items i where i.id = new.item_id for update;
    if it.id is null or it.kind <> 'fixed_asset' then
      raise exception 'Only fixed assets can be moved, reported or disposed of. Consumables are counted instead.';
    end if;
    if it.condition = 'disposed' then
      raise exception 'This asset has been disposed of. Nothing more can be recorded for it.';
    end if;
    if exists (select 1 from public.asset_events e where e.item_id = new.item_id and e.status = 'pending') then
      raise exception 'A disposal of this asset is waiting for approval. A different admin must decide on it first.';
    end if;
    if new.decided_by is not null or new.decided_at is not null or new.decision_note is not null then
      raise exception 'A new entry cannot already have a decision.';
    end if;
    if new.status is not null and new.status not in ('recorded', 'pending') then
      raise exception 'A new entry cannot already be approved or rejected.';
    end if;

    new.note := nullif(trim(coalesce(new.note, '')), '');
    new.reported_by := nullif(trim(coalesce(new.reported_by, '')), '');
    if new.note is null then
      raise exception 'Write a note saying what happened.';
    end if;
    if new.reported_by is null then
      raise exception 'Say who reported it.';
    end if;

    -- Where it was and its condition before: always from the item itself.
    new.from_location_id := it.location_id;
    new.from_condition := it.condition;

    if new.kind <> 'move' and new.to_location_id is not null then
      raise exception 'Only a move has a place to go.';
    end if;
    if new.kind <> 'back_in_use' and new.to_condition is not null then
      raise exception 'The new condition is filled in by the database for this kind of entry.';
    end if;

    if new.kind = 'move' then
      if new.to_location_id is null then
        raise exception 'Say where the asset is going.';
      end if;
      if new.to_location_id = it.location_id then
        raise exception 'The asset is already there. Pick a different place.';
      end if;
      select l.active into loc_ok from public.locations l where l.id = new.to_location_id;
      if not coalesce(loc_ok, false) then
        raise exception 'That location is switched off. Pick another one.';
      end if;
      new.to_condition := null;
      new.status := 'recorded';
    elsif new.kind = 'damage' then
      if it.condition = 'damaged' then
        raise exception 'This asset is already marked damaged.';
      end if;
      new.to_condition := 'damaged';
      new.status := 'recorded';
    elsif new.kind = 'missing' then
      if it.condition = 'missing' then
        raise exception 'This asset is already marked missing.';
      end if;
      new.to_condition := 'missing';
      new.status := 'recorded';
    elsif new.kind = 'back_in_use' then
      if it.condition not in ('damaged', 'missing') then
        raise exception 'Only a damaged or missing asset can be marked repaired or found.';
      end if;
      if new.to_condition is null or new.to_condition not in ('good', 'fair') then
        raise exception 'Say whether it is now in good or fair condition.';
      end if;
      new.status := 'recorded';
    else -- disposal
      new.to_condition := 'disposed';
      new.status := 'pending';
    end if;
    return new;
  end if;

  -- UPDATE: only a decision on a pending disposal.
  if old.kind <> 'disposal' or old.status <> 'pending' then
    raise exception 'Asset entries cannot be changed. If one is wrong, record a new entry with a note.';
  end if;
  if new.item_id is distinct from old.item_id or new.kind is distinct from old.kind
     or new.from_location_id is distinct from old.from_location_id or new.from_condition is distinct from old.from_condition
     or new.to_location_id is distinct from old.to_location_id or new.to_condition is distinct from old.to_condition
     or new.note is distinct from old.note or new.reported_by is distinct from old.reported_by
     or new.photo_path is distinct from old.photo_path then
    raise exception 'Only the decision on a disposal can be filled in.';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'A disposal can only be approved or rejected.';
  end if;
  if auth.uid() is null then
    raise exception 'A disposal must be approved or rejected by a signed-in admin.';
  end if;
  if auth.uid() = old.created_by then
    raise exception 'A different admin must approve or reject this disposal. Nobody can decide on their own entry.';
  end if;
  new.decision_note := nullif(trim(coalesce(new.decision_note, '')), '');
  if new.status = 'rejected' and new.decision_note is null then
    raise exception 'Rejecting a disposal needs a reason.';
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;

-- Runs before the "stamp_record" trigger (triggers run in name order).
create trigger check_asset_event before insert or update on public.asset_events
  for each row execute function private.check_asset_event();

-- ---------------------------------------------------------------------------
-- After an event is saved (or a disposal approved), the item follows it.
-- Runs with the database owner's rights, and raises a flag for this one
-- change only, so check_item lets the location or condition change.
create function private.apply_asset_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status not in ('recorded', 'approved') then
    return null; -- pending or rejected: the item does not change
  end if;
  if tg_op = 'UPDATE' and old.status = new.status then
    return null;
  end if;
  perform set_config('icci.applying_asset_event', 'on', true);
  if new.kind = 'move' then
    update public.items set location_id = new.to_location_id where id = new.item_id;
  else
    update public.items set condition = new.to_condition where id = new.item_id;
  end if;
  perform set_config('icci.applying_asset_event', 'off', true);
  return null;
end $$;
revoke all on function private.apply_asset_event() from public;

create trigger apply_asset_event after insert or update on public.asset_events
  for each row execute function private.apply_asset_event();

-- ---------------------------------------------------------------------------
-- Items: location and condition may now change, but only from an event.
-- A new item cannot start as disposed (disposal needs approval).
create or replace function private.check_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  loc_kind   text;
  loc_active boolean;
  from_event boolean := coalesce(current_setting('icci.applying_asset_event', true), 'off') = 'on';
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      raise exception 'The kind of item cannot be changed.';
    end if;
    if new.label_serial is distinct from old.label_serial then
      raise exception 'The label on an item cannot be changed.';
    end if;
    if new.location_id is distinct from old.location_id and not from_event then
      raise exception 'An item cannot be moved by editing it. Use "Move" on the item page.';
    end if;
    if new.condition is distinct from old.condition and not from_event then
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

-- ---------------------------------------------------------------------------
-- Row-level security: only super_admin and centre_admin. Finance, the library
-- operator and signed-out visitors cannot read or record anything.
create policy asset_events_read on public.asset_events for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy asset_events_add on public.asset_events for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));
create policy asset_events_decide on public.asset_events for update to authenticated
  using (private.has_role('super_admin', 'centre_admin') and kind = 'disposal' and status = 'pending')
  with check (private.has_role('super_admin', 'centre_admin'));
