-- 0046: "Passed to a company" on a maintenance ticket (PLAN.md 5.1, slice
-- P1.21; owner approved 21 Nov 2026).
--
--   * A new history entry, "referred": which company the problem was passed
--     to, their job number (optional) and a note. Like every ticket entry it
--     is never changed. It does not change the ticket's status or assignee:
--     the assignee stays the person in the directory following it up.
--   * The ticket list can show the tickets passed to one company.
--   * The history checker is the one from 0033 with this one kind added;
--     everything else in it is unchanged.

alter table public.maintenance_ticket_events drop constraint maintenance_ticket_events_kind_check;
alter table public.maintenance_ticket_events add constraint maintenance_ticket_events_kind_check
  check (kind in ('opened', 'assigned', 'status', 'priority', 'note', 'closed', 'reopened', 'referred'));
alter table public.maintenance_ticket_events
  add column company_id      uuid references public.companies (id),
  add column company_job_ref text check (length(company_job_ref) between 1 and 60);
create index maintenance_ticket_events_company on public.maintenance_ticket_events (company_id) where company_id is not null;

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
  if new.kind <> 'referred' and (new.company_id is not null or new.company_job_ref is not null) then
    raise exception 'Only a "passed to a company" entry names a company.';
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
  elsif new.kind = 'referred' then
    if t.status = 'closed' then
      raise exception 'This ticket is closed. Reopen it first.';
    end if;
    if new.company_id is null then
      raise exception 'Say which company it was passed to.';
    end if;
    select c.active into person_ok from public.companies c where c.id = new.company_id;
    if not coalesce(person_ok, false) then
      raise exception 'That company is switched off. Pick another one.';
    end if;
    new.company_job_ref := nullif(trim(coalesce(new.company_job_ref, '')), '');
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
