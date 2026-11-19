-- 0019: Connect people to what exists (docs/PHASE-2-AND-3.md 4.1, slice
-- P2.2). Owner's choices, 15 Nov 2026:
--   * A person can be linked to at most one admin account, and an account
--     to at most one person. Only a Super Admin sets, changes or removes a
--     link, and never on their own account (like "nobody changes their own
--     role"), so nobody can unlink themselves to get round later rules such
--     as "no recording your own vetting". Centre Admins can see links.
--   * "Reported by" on a new asset entry is EITHER a person from the
--     directory OR a typed name, never both, never neither. Only switched-on
--     people can be picked. Old entries keep their typed names.
--   * A stocktake approval names the admin who sent the stocktake: their
--     person record if linked, otherwise their name (as before).
--   * "Your own entry" still means the account that made it.

-- ---------------------------------------------------------------------------
-- People ↔ admin accounts.
alter table public.people add column app_user_id uuid unique references public.app_users (id);

create or replace function private.check_person() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.person_role_id is distinct from old.person_role_id then
    if not exists (select 1 from public.person_roles r where r.id = new.person_role_id and r.active) then
      raise exception 'That role is switched off. Pick another.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.section_id is distinct from old.section_id then
    if not exists (select 1 from public.sections s where s.id = new.section_id and s.active) then
      raise exception 'That section is switched off. Pick another.';
    end if;
  end if;

  -- The link to an admin account. The seed script and migrations (no
  -- signed-in person) may set it; on the website only a Super Admin can,
  -- and never for their own account.
  if (tg_op = 'INSERT' and new.app_user_id is not null)
     or (tg_op = 'UPDATE' and new.app_user_id is distinct from old.app_user_id) then
    if auth.uid() is not null then
      if not private.has_role('super_admin') then
        raise exception 'Only a Super Admin can link a person to an admin account.';
      end if;
      if new.app_user_id = auth.uid() or (tg_op = 'UPDATE' and old.app_user_id = auth.uid()) then
        raise exception 'You cannot link or unlink your own account. Ask another Super Admin.';
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Asset entries: who reported it.
alter table public.asset_events add column reported_by_person_id uuid references public.people (id);
alter table public.asset_events alter column reported_by drop not null;
-- Exactly one of the two. Every older entry has a typed name, so it fits.
alter table public.asset_events add constraint asset_events_one_reporter
  check (num_nonnulls(reported_by, reported_by_person_id) = 1);
create index asset_events_reported_by_person on public.asset_events (reported_by_person_id)
  where reported_by_person_id is not null;

-- The asset entry checker from migration 0008, with the new "reported by"
-- rules. Everything else is unchanged.
create or replace function private.check_asset_event() returns trigger
language plpgsql set search_path = '' as $$
declare
  it        public.items%rowtype;
  loc_ok    boolean;
  person_ok boolean;
  sender    uuid;
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

    -- A stocktake approval names the admin who sent the stocktake: their
    -- person record if their account is linked to a switched-on one.
    if new.stocktake_difference_id is not null and new.reported_by_person_id is null then
      select st.submitted_by into sender
      from public.stocktake_differences d
      join public.stocktakes st on st.id = d.stocktake_id
      where d.id = new.stocktake_difference_id;
      select p.id into new.reported_by_person_id
      from public.people p where p.app_user_id = sender and p.active;
      if new.reported_by_person_id is not null then
        new.reported_by := null;
      end if;
    end if;

    if new.reported_by_person_id is not null and new.reported_by is not null then
      raise exception 'Pick a person from the list or type a name, either one but not both.';
    end if;
    if new.reported_by_person_id is null and new.reported_by is null then
      raise exception 'Say who reported it.';
    end if;
    if new.reported_by_person_id is not null then
      select p.active into person_ok from public.people p where p.id = new.reported_by_person_id;
      if person_ok is null then
        raise exception 'That person is not in the people directory.';
      end if;
      if not person_ok then
        raise exception 'That person is switched off. Pick someone else, or type the name.';
      end if;
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
     or new.reported_by_person_id is distinct from old.reported_by_person_id
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

revoke all on function private.check_asset_event() from public;
revoke all on function private.check_person() from public;
