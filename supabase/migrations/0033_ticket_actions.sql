-- 0033: Maintenance tickets: assign, progress, close, reopen (docs/PHASE-2-AND-3.md
-- 5.3 and 5.4, slice P3.6). Owner's choices, 19 Nov 2026 (recommended answers):
--   * Priority can change after reporting, as a history entry ("priority"),
--     never typed over.
--   * A ticket can be assigned to any switched-on person in the directory
--     (already the rule in migration 0032).
--   * Closing a ticket on a damaged asset can mark the asset repaired (good
--     or fair) in the same step: close_maintenance_ticket saves the ordinary
--     asset entry and the closing entry together, or neither. The closing
--     entry points at the asset entry, whose note names the ticket.
--   * Home page: "Open tickets" (not closed), with urgent ones counted
--     separately.

-- ---------------------------------------------------------------------------
-- New history facts.
alter table public.maintenance_ticket_events drop constraint maintenance_ticket_events_kind_check;
alter table public.maintenance_ticket_events add constraint maintenance_ticket_events_kind_check
  check (kind in ('opened', 'assigned', 'status', 'priority', 'note', 'closed', 'reopened'));
alter table public.maintenance_ticket_events
  add column new_priority text check (new_priority in ('low', 'normal', 'urgent')),
  add column asset_event_id bigint unique references public.asset_events (id);

-- ---------------------------------------------------------------------------
-- The ticket checker from migration 0032, with priority now following a
-- "priority" entry. Everything else is unchanged.
create or replace function private.check_maintenance_ticket() returns trigger
language plpgsql set search_path = '' as $$
declare
  it        public.items%rowtype;
  loc_ok    boolean;
  person_ok boolean;
  ev        public.maintenance_ticket_events%rowtype;
  want_status text;
  want_priority text;
  want_assignee uuid;
  want_note text;
  want_cost integer;
  want_closed timestamptz;
begin
  if tg_op = 'INSERT' then
    if new.status is distinct from 'open' or new.assigned_person_id is not null or new.closing_note is not null
       or new.cost_cents is not null or new.closed_at is not null then
      raise exception 'A new ticket starts open and unassigned. Status, assignee, closing note and cost are added later.';
    end if;

    new.description := nullif(trim(coalesce(new.description, '')), '');
    if new.description is null then
      raise exception 'Describe the problem.';
    end if;

    if new.item_id is not null then
      select * into it from public.items i where i.id = new.item_id;
      if it.id is null then
        raise exception 'That item could not be found.';
      end if;
      if it.kind <> 'fixed_asset' then
        raise exception 'A ticket cannot be about a consumable. Pick the place instead.';
      end if;
      if it.condition = 'disposed' then
        raise exception 'This asset has been disposed of. A ticket cannot be opened for it.';
      end if;
      new.location_id := it.location_id;
    elsif new.location_id is null then
      raise exception 'Say where the problem is.';
    end if;
    select l.active into loc_ok from public.locations l where l.id = new.location_id;
    if not coalesce(loc_ok, false) then
      raise exception 'That location is switched off. Pick another one.';
    end if;

    if new.asset_event_id is not null and not exists (
      select 1 from public.asset_events e
      where e.id = new.asset_event_id and e.kind = 'damage' and e.item_id is not distinct from new.item_id
    ) then
      raise exception 'A ticket can only come from a damage report for the same asset.';
    end if;

    new.reported_by := nullif(trim(coalesce(new.reported_by, '')), '');
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
    return new;
  end if;

  -- UPDATE: the details never change.
  if new.description is distinct from old.description
     or new.item_id is distinct from old.item_id or new.location_id is distinct from old.location_id
     or new.reported_by is distinct from old.reported_by or new.reported_by_person_id is distinct from old.reported_by_person_id
     or new.photo_path is distinct from old.photo_path or new.asset_event_id is distinct from old.asset_event_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'A ticket''s details cannot be changed. Add a note to the ticket instead.';
  end if;

  if new.status is not distinct from old.status and new.priority is not distinct from old.priority
     and new.assigned_person_id is not distinct from old.assigned_person_id
     and new.closing_note is not distinct from old.closing_note and new.cost_cents is not distinct from old.cost_cents
     and new.closed_at is not distinct from old.closed_at then
    return new;
  end if;

  -- Status, priority, assignee and closing facts: exactly what the latest
  -- history entry saved in this same step says, and nothing else.
  select * into ev from public.maintenance_ticket_events e
  where e.ticket_id = new.id and private.written_in_this_transaction(e.xmin)
  order by e.id desc limit 1;
  if ev.id is null then
    raise exception 'A ticket''s status, priority, assignee, closing note and cost cannot be typed over. Use the buttons on the ticket page.';
  end if;

  want_status := old.status;
  want_priority := old.priority;
  want_assignee := old.assigned_person_id;
  want_note := old.closing_note;
  want_cost := old.cost_cents;
  want_closed := old.closed_at;
  if ev.kind = 'assigned' then
    want_assignee := ev.new_assignee_person_id;
  elsif ev.kind = 'status' then
    want_status := ev.new_status;
  elsif ev.kind = 'priority' then
    want_priority := ev.new_priority;
  elsif ev.kind = 'closed' then
    want_status := 'closed';
    want_note := ev.note;
    want_cost := ev.cost_cents;
    want_closed := ev.created_at;
  elsif ev.kind = 'reopened' then
    want_status := 'open';
    want_note := null;
    want_cost := null;
    want_closed := null;
  end if;
  if new.status is distinct from want_status or new.priority is distinct from want_priority
     or new.assigned_person_id is distinct from want_assignee
     or new.closing_note is distinct from want_note or new.cost_cents is distinct from want_cost
     or new.closed_at is distinct from want_closed then
    raise exception 'A ticket''s status, priority, assignee, closing note and cost cannot be typed over. Use the buttons on the ticket page.';
  end if;
  return new;
end $$;
revoke all on function private.check_maintenance_ticket() from public, anon;

-- ---------------------------------------------------------------------------
-- The history entry checker from migration 0032, with "priority" entries and
-- the link from a closing entry to the repair saved with it. Runs with the
-- database owner's rights only to lock the ticket; it changes nothing.
create or replace function private.check_maintenance_ticket_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  t         public.maintenance_tickets%rowtype;
  person_ok boolean;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Ticket history cannot be changed. If something is wrong, add a note.';
  end if;

  -- Lock the ticket so two entries for it are handled one after the other.
  select * into t from public.maintenance_tickets x where x.id = new.ticket_id for update;
  if t.id is null then
    raise exception 'That ticket could not be found.';
  end if;

  new.note := nullif(trim(coalesce(new.note, '')), '');
  if new.kind <> 'closed' and new.cost_cents is not null then
    raise exception 'A cost is recorded only when closing a ticket.';
  end if;
  if new.kind <> 'closed' and new.asset_event_id is not null then
    raise exception 'Only a closing entry can point at a repair.';
  end if;
  if new.kind <> 'assigned' and new.new_assignee_person_id is not null then
    raise exception 'Only an "assigned" entry names who the ticket is assigned to.';
  end if;
  if new.kind <> 'status' and new.new_status is not null then
    raise exception 'The new status is filled in by the database for this kind of entry.';
  end if;
  if new.kind <> 'priority' and new.new_priority is not null then
    raise exception 'Only a "priority" entry changes the priority.';
  end if;

  if new.kind = 'opened' then
    if not exists (select 1 from public.maintenance_tickets x
                   where x.id = t.id and private.written_in_this_transaction(x.xmin))
       or exists (select 1 from public.maintenance_ticket_events e where e.ticket_id = t.id) then
      raise exception 'The "opened" entry is written by the database when the ticket is reported.';
    end if;
    new.new_status := 'open';
  elsif new.kind = 'note' then
    if new.note is null then
      raise exception 'Write the note.';
    end if;
  elsif new.kind = 'assigned' then
    if t.status = 'closed' then
      raise exception 'This ticket is closed. Reopen it first.';
    end if;
    if new.new_assignee_person_id is null then
      raise exception 'Say who the ticket is assigned to.';
    end if;
    if new.new_assignee_person_id is not distinct from t.assigned_person_id then
      raise exception 'The ticket is already assigned to this person.';
    end if;
    select p.active into person_ok from public.people p where p.id = new.new_assignee_person_id;
    if person_ok is null then
      raise exception 'That person is not in the people directory.';
    end if;
    if not person_ok then
      raise exception 'That person is switched off. Pick someone who is switched on.';
    end if;
  elsif new.kind = 'status' then
    if t.status = 'closed' then
      raise exception 'This ticket is closed. Reopen it first.';
    end if;
    if new.new_status is null or new.new_status = 'closed' then
      raise exception 'Choose open, in progress or waiting. To close a ticket, use Close.';
    end if;
    if new.new_status = t.status then
      raise exception 'The ticket already has that status.';
    end if;
  elsif new.kind = 'priority' then
    if t.status = 'closed' then
      raise exception 'This ticket is closed. Reopen it first.';
    end if;
    if new.new_priority is null then
      raise exception 'Choose the new priority.';
    end if;
    if new.new_priority = t.priority then
      raise exception 'The ticket already has that priority.';
    end if;
  elsif new.kind = 'closed' then
    if t.status = 'closed' then
      raise exception 'This ticket is already closed.';
    end if;
    if new.note is null then
      raise exception 'Write a closing note saying what was done.';
    end if;
    if new.asset_event_id is not null and not exists (
      select 1 from public.asset_events e
      where e.id = new.asset_event_id and e.kind = 'back_in_use' and e.item_id = t.item_id
        and private.written_in_this_transaction(e.xmin)
    ) then
      raise exception 'A closing entry can only point at a repair saved in the same step, for the ticket''s own asset.';
    end if;
    new.new_status := 'closed';
  else -- reopened
    if t.status <> 'closed' then
      raise exception 'This ticket is not closed, so it cannot be reopened.';
    end if;
    if new.note is null then
      raise exception 'Write the reason for reopening.';
    end if;
    new.new_status := 'open';
  end if;
  return new;
end $$;
revoke all on function private.check_maintenance_ticket_event() from public, anon;

-- After an entry is saved, the ticket follows it (now including priority).
create or replace function private.apply_maintenance_ticket_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'assigned' then
    update public.maintenance_tickets set assigned_person_id = new.new_assignee_person_id where id = new.ticket_id;
  elsif new.kind = 'status' then
    update public.maintenance_tickets set status = new.new_status where id = new.ticket_id;
  elsif new.kind = 'priority' then
    update public.maintenance_tickets set priority = new.new_priority where id = new.ticket_id;
  elsif new.kind = 'closed' then
    update public.maintenance_tickets
      set status = 'closed', closing_note = new.note, cost_cents = new.cost_cents, closed_at = new.created_at
      where id = new.ticket_id;
  elsif new.kind = 'reopened' then
    update public.maintenance_tickets
      set status = 'open', closing_note = null, cost_cents = null, closed_at = null
      where id = new.ticket_id;
  end if;
  return null;
end $$;
revoke all on function private.apply_maintenance_ticket_event() from public, anon;

-- ---------------------------------------------------------------------------
-- Close a ticket, and if asked, mark its damaged asset repaired in the same
-- step. Runs with the signed-in admin's own rights: the access rules and the
-- checkers above apply exactly as on any other entry.
create function public.close_maintenance_ticket(
  p_ticket_id bigint,
  p_note text,
  p_cost_cents integer default null,
  p_repaired_condition text default null
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  t         public.maintenance_tickets%rowtype;
  item_condition text;
  me_person uuid;
  me_name   text;
  repair_id bigint;
  closed_id bigint;
  note      text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can close a ticket.' using errcode = '42501';
  end if;
  select * into t from public.maintenance_tickets x where x.id = p_ticket_id;
  if t.id is null then
    raise exception 'That ticket could not be found.';
  end if;
  if note is null then
    raise exception 'Write a closing note saying what was done.';
  end if;

  if p_repaired_condition is not null then
    if p_repaired_condition not in ('good', 'fair') then
      raise exception 'Say whether it is now in good or fair condition.';
    end if;
    if t.item_id is null then
      raise exception 'This ticket is not about an asset, so there is nothing to mark repaired.';
    end if;
    select i.condition into item_condition from public.items i where i.id = t.item_id;
    if item_condition is distinct from 'damaged' then
      raise exception 'The asset is not marked damaged, so it cannot be marked repaired.';
    end if;
    -- Reported by: your own person record if your account is linked to a
    -- switched-on one, otherwise your name.
    select p.id into me_person from public.people p where p.app_user_id = auth.uid() and p.active;
    if me_person is null then
      select u.display_name into me_name from public.app_users u where u.id = auth.uid();
      me_name := coalesce(me_name, 'An admin');
    end if;
    insert into public.asset_events (item_id, kind, to_condition, note, reported_by, reported_by_person_id)
    values (
      t.item_id, 'back_in_use', p_repaired_condition,
      left('Repaired: ticket T-' || lpad(t.id::text, 4, '0') || ' closed. ' || note, 2000),
      me_name, me_person
    )
    returning id into repair_id;
  end if;

  insert into public.maintenance_ticket_events (ticket_id, kind, note, cost_cents, asset_event_id)
  values (t.id, 'closed', note, p_cost_cents, repair_id)
  returning id into closed_id;
  return closed_id;
end $$;
revoke all on function public.close_maintenance_ticket(bigint, text, integer, text) from public, anon;
grant execute on function public.close_maintenance_ticket(bigint, text, integer, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home page counters gain "Open tickets". Everything else is unchanged from
-- migration 0030.
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
  rota_today_unfilled     integer,
  tickets_open            integer,
  tickets_urgent          integer
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
    (select count(*)::integer from public.rota_entries re where re.assignment_date = today and re.person_id is null),
    (select count(*)::integer from public.maintenance_tickets mt where mt.status <> 'closed'),
    (select count(*)::integer from public.maintenance_tickets mt where mt.status <> 'closed' and mt.priority = 'urgent');
end $$;

revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;
