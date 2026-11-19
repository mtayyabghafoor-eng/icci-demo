-- 0032: Maintenance tickets (PLAN.md 5.3; docs/PHASE-2-AND-3.md 5.3,
-- slice P3.5). Owner's choices, 15 Nov 2026 (all recommended answers) and
-- 18 Nov 2026 (P3.5 questions, recommended answers):
--   * A ticket is about one fixed asset (its place is then taken from the
--     asset) or about a place. Refused: a consumable, a disposed asset, a
--     switched-off place.
--   * Priority: low, normal (the starting choice) or urgent.
--   * "Reported by" is a person from the directory or a typed name, the
--     same rule as asset entries.
--   * Status, who it is assigned to, closing note, cost and closed date sit
--     on the ticket for fast lists, but ONLY the database changes them, from
--     entries in maintenance_ticket_events that are never changed or deleted.
--     Typing over them is refused, even with the master key.
--   * Closing needs a closing note; the cost is optional, information only
--     (not an expense claim, not a ledger). A closed ticket can be reopened
--     with a reason. No second admin is needed to close (question 9).
--   * A ticket's details (description, place, asset, reporter, photo) do not
--     change once reported; anything new is added as a note.
--   * Photos: a private store, pictures only, up to 6 MB, add and view only.
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing.
-- The whole database side is built here; the screens for assigning,
-- progress, closing and reopening follow in slice P3.6.

-- ---------------------------------------------------------------------------
-- The file store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-photos', 'ticket-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy ticket_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'ticket-photos' and (select private.has_role('super_admin', 'centre_admin')));
create policy ticket_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'ticket-photos' and (select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
create table public.maintenance_tickets (
  id                    bigint generated always as identity primary key,
  description           text not null check (length(description) between 1 and 2000),
  priority              text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  item_id               uuid references public.items (id),
  location_id           uuid not null references public.locations (id),
  reported_by           text check (length(reported_by) <= 200),
  reported_by_person_id uuid references public.people (id),
  photo_path            text check (photo_path ~ '^[A-Za-z0-9/_.-]+$' and photo_path !~ '\.\.'),
  -- The "Report damage" entry this ticket was opened from (slice P3.6 screen).
  asset_event_id        bigint unique references public.asset_events (id),
  -- Changed only by the database, from the history entries below:
  status                text not null default 'open' check (status in ('open', 'in_progress', 'waiting', 'closed')),
  assigned_person_id    uuid references public.people (id),
  closing_note          text check (length(closing_note) <= 2000),
  cost_cents            integer check (cost_cents between 0 and 100000000),
  closed_at             timestamptz,
  created_by            uuid references auth.users (id),
  created_at            timestamptz not null default now(),
  updated_by            uuid references auth.users (id),
  updated_at            timestamptz not null default now(),
  constraint maintenance_tickets_one_reporter check (num_nonnulls(reported_by, reported_by_person_id) = 1)
);
call private.add_standard_safeguards('maintenance_tickets', 'id');

create index maintenance_tickets_open on public.maintenance_tickets (status, priority) where status <> 'closed';
create index maintenance_tickets_item on public.maintenance_tickets (item_id) where item_id is not null;
create index maintenance_tickets_location on public.maintenance_tickets (location_id);
create index maintenance_tickets_assigned on public.maintenance_tickets (assigned_person_id) where assigned_person_id is not null;
create index maintenance_tickets_reported_by_person on public.maintenance_tickets (reported_by_person_id) where reported_by_person_id is not null;

-- ---------------------------------------------------------------------------
create table public.maintenance_ticket_events (
  id                     bigint generated always as identity primary key,
  ticket_id              bigint not null references public.maintenance_tickets (id),
  kind                   text not null check (kind in ('opened', 'assigned', 'status', 'note', 'closed', 'reopened')),
  note                   text check (length(note) <= 2000),
  photo_path             text check (photo_path ~ '^[A-Za-z0-9/_.-]+$' and photo_path !~ '\.\.'),
  new_status             text check (new_status in ('open', 'in_progress', 'waiting', 'closed')),
  new_assignee_person_id uuid references public.people (id),
  cost_cents             integer check (cost_cents between 0 and 100000000),
  created_by             uuid references auth.users (id),
  created_at             timestamptz not null default now(),
  updated_by             uuid references auth.users (id),
  updated_at             timestamptz not null default now()
);
call private.add_standard_safeguards('maintenance_ticket_events', 'id');
create index maintenance_ticket_events_ticket on public.maintenance_ticket_events (ticket_id, id);
create index maintenance_ticket_events_assignee on public.maintenance_ticket_events (new_assignee_person_id)
  where new_assignee_person_id is not null;

-- ---------------------------------------------------------------------------
-- The rules for a ticket.
create function private.check_maintenance_ticket() returns trigger
language plpgsql set search_path = '' as $$
declare
  it        public.items%rowtype;
  loc_ok    boolean;
  person_ok boolean;
  ev        public.maintenance_ticket_events%rowtype;
  want_status text;
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
      -- Always the asset's own place, so the two never disagree.
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
  if new.description is distinct from old.description or new.priority is distinct from old.priority
     or new.item_id is distinct from old.item_id or new.location_id is distinct from old.location_id
     or new.reported_by is distinct from old.reported_by or new.reported_by_person_id is distinct from old.reported_by_person_id
     or new.photo_path is distinct from old.photo_path or new.asset_event_id is distinct from old.asset_event_id
     or new.created_by is distinct from old.created_by or new.created_at is distinct from old.created_at then
    raise exception 'A ticket''s details cannot be changed. Add a note to the ticket instead.';
  end if;

  if new.status is not distinct from old.status and new.assigned_person_id is not distinct from old.assigned_person_id
     and new.closing_note is not distinct from old.closing_note and new.cost_cents is not distinct from old.cost_cents
     and new.closed_at is not distinct from old.closed_at then
    return new;
  end if;

  -- Status, assignee and closing facts: exactly what the latest history
  -- entry saved in this same step says, and nothing else.
  select * into ev from public.maintenance_ticket_events e
  where e.ticket_id = new.id and private.written_in_this_transaction(e.xmin)
  order by e.id desc limit 1;
  if ev.id is null then
    raise exception 'A ticket''s status, assignee, closing note and cost cannot be typed over. Use the buttons on the ticket page.';
  end if;

  want_status := old.status;
  want_assignee := old.assigned_person_id;
  want_note := old.closing_note;
  want_cost := old.cost_cents;
  want_closed := old.closed_at;
  if ev.kind = 'assigned' then
    want_assignee := ev.new_assignee_person_id;
  elsif ev.kind = 'status' then
    want_status := ev.new_status;
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
  if new.status is distinct from want_status or new.assigned_person_id is distinct from want_assignee
     or new.closing_note is distinct from want_note or new.cost_cents is distinct from want_cost
     or new.closed_at is distinct from want_closed then
    raise exception 'A ticket''s status, assignee, closing note and cost cannot be typed over. Use the buttons on the ticket page.';
  end if;
  return new;
end $$;
revoke all on function private.check_maintenance_ticket() from public, anon;

create trigger check_maintenance_ticket before insert or update on public.maintenance_tickets
  for each row execute function private.check_maintenance_ticket();

-- Every new ticket gets its "opened" entry, in the same step.
create function private.open_maintenance_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.maintenance_ticket_events (ticket_id, kind) values (new.id, 'opened');
  return null;
end $$;
revoke all on function private.open_maintenance_ticket() from public, anon;

create trigger open_maintenance_ticket after insert on public.maintenance_tickets
  for each row execute function private.open_maintenance_ticket();

-- ---------------------------------------------------------------------------
-- The rules for a history entry. Runs with the database owner's rights so it
-- can lock the ticket (nobody may update tickets directly, and locking a
-- row needs that right); it only reads and refuses, it changes nothing.
create function private.check_maintenance_ticket_event() returns trigger
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
  if new.kind <> 'assigned' and new.new_assignee_person_id is not null then
    raise exception 'Only an "assigned" entry names who the ticket is assigned to.';
  end if;
  if new.kind <> 'status' and new.new_status is not null then
    raise exception 'The new status is filled in by the database for this kind of entry.';
  end if;

  if new.kind = 'opened' then
    -- The ticket must have been reported in this same step, with no entries yet.
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
  elsif new.kind = 'closed' then
    if t.status = 'closed' then
      raise exception 'This ticket is already closed.';
    end if;
    if new.note is null then
      raise exception 'Write a closing note saying what was done.';
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

create trigger check_maintenance_ticket_event before insert or update on public.maintenance_ticket_events
  for each row execute function private.check_maintenance_ticket_event();

-- After an entry is saved, the ticket follows it. Runs with the database
-- owner's rights; the ticket's own checker makes sure it matches the entry.
create function private.apply_maintenance_ticket_event() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'assigned' then
    update public.maintenance_tickets set assigned_person_id = new.new_assignee_person_id where id = new.ticket_id;
  elsif new.kind = 'status' then
    update public.maintenance_tickets set status = new.new_status where id = new.ticket_id;
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

create trigger apply_maintenance_ticket_event after insert on public.maintenance_ticket_events
  for each row execute function private.apply_maintenance_ticket_event();

-- ---------------------------------------------------------------------------
-- Row-level security: only super_admin and centre_admin can read and add.
-- Nobody may update a ticket directly (only the database does, above), and
-- history entries are never changed.
create policy maintenance_tickets_read on public.maintenance_tickets for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy maintenance_tickets_add on public.maintenance_tickets for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy maintenance_ticket_events_read on public.maintenance_ticket_events for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy maintenance_ticket_events_add on public.maintenance_ticket_events for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
