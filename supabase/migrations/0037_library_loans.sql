-- 0037: Library borrowers, lending and returns (PLAN.md 5.4; docs/PHASE-4.md,
-- slice P4.4). Owner's choices, 19 Nov 2026 (all recommended answers):
--   * A borrower is a name and ONE contact detail (a phone OR an email, the
--     kind stored beside it), and an on/off switch. Nothing else: no
--     address, no age, no notes box. Borrowers are not the People directory.
--   * Loans are 21 days by default, at most 3 books out per borrower, no fines.
--   * A loan is never changed or deleted. Returning it, moving its due date
--     and "returned by mistake" are new entries linked to the loan. Whether a
--     copy is on loan, and when it is due, is worked out from those entries.
--   * Lending and returning lock the copy (and lending locks the borrower),
--     so two phones at once can never lend one copy twice or go past 3 books.
--   * Super Admin, Centre Admin and the Library Operator. Finance and
--     signed-out visitors get nothing.
--   * Lost and withdrawn copies come in slice P4.5.

-- ---------------------------------------------------------------------------
create table public.library_borrowers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (length(full_name) between 1 and 100),
  contact_kind text not null check (contact_kind in ('phone', 'email')),
  contact      text not null check (length(contact) between 1 and 200),
  active       boolean not null default true,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);
call private.add_standard_safeguards('library_borrowers', 'id');
create index library_borrowers_name on public.library_borrowers (lower(full_name));

create table public.library_loans (
  id           bigint generated always as identity primary key,
  copy_id      uuid not null references public.library_copies (id),
  borrower_id  uuid not null references public.library_borrowers (id),
  lent_on      date not null default private.today_in_dublin(),
  -- Filled in (lent_on + 21 days) when left empty.
  first_due_on date not null,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  check (first_due_on >= lent_on)
);
call private.add_standard_safeguards('library_loans', 'id');
create index library_loans_copy on public.library_loans (copy_id, id);
create index library_loans_borrower on public.library_loans (borrower_id, id);

create table public.library_loan_entries (
  id              bigint generated always as identity primary key,
  loan_id         bigint not null references public.library_loans (id),
  kind            text not null check (kind in ('returned', 'due_moved', 'return_undone')),
  happened_on     date not null default private.today_in_dublin(),
  new_due_on      date,
  -- "Returned by mistake": the wrong return it cancels (once only).
  undoes_entry_id bigint unique references public.library_loan_entries (id),
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_by      uuid references auth.users (id),
  updated_at      timestamptz not null default now(),
  check ((kind = 'due_moved') = (new_due_on is not null)),
  check ((kind = 'return_undone') = (undoes_entry_id is not null))
);
call private.add_standard_safeguards('library_loan_entries', 'id');
create index library_loan_entries_loan on public.library_loan_entries (loan_id, id);

-- ---------------------------------------------------------------------------
-- Loans and their entries are history: never changed, not even with the master key.
create function private.block_library_history_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Library loans and their entries are never changed. Add a new entry instead (return, move the due date, or "returned by mistake").';
end $$;
revoke all on function private.block_library_history_change() from public, anon;

create trigger block_history_change before update on public.library_loans
  for each row execute function private.block_library_history_change();
create trigger block_history_change before update on public.library_loan_entries
  for each row execute function private.block_library_history_change();

-- ---------------------------------------------------------------------------
-- Locks, taken before any check, so two phones at once queue up one behind
-- the other and the second sees what the first saved.
create function private.lock_library_copy(copy uuid) returns void
language sql set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('icci-library-copy:' || copy::text, 0))
$$;
revoke all on function private.lock_library_copy(uuid) from public, anon;
grant execute on function private.lock_library_copy(uuid) to authenticated, service_role;

create function private.lock_library_borrower(borrower uuid) returns void
language sql set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('icci-library-borrower:' || borrower::text, 0))
$$;
revoke all on function private.lock_library_borrower(uuid) from public, anon;
grant execute on function private.lock_library_borrower(uuid) to authenticated, service_role;

-- Is a loan still out? Yes, unless its latest return-or-undo entry is a return.
-- (Volatile on purpose: after a lock it must see what was just saved.)
create function private.library_loan_is_open(loan bigint) returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce((
    select e.kind <> 'returned' from public.library_loan_entries e
    where e.loan_id = loan and e.kind in ('returned', 'return_undone')
    order by e.id desc limit 1
  ), true)
$$;
revoke all on function private.library_loan_is_open(bigint) from public, anon;
grant execute on function private.library_loan_is_open(bigint) to authenticated, service_role;

-- The loan a copy is out on now, if any.
create function private.library_copy_open_loan(copy uuid) returns bigint
language sql volatile security definer set search_path = '' as $$
  select l.id from public.library_loans l
  where l.copy_id = copy and private.library_loan_is_open(l.id)
  order by l.id desc limit 1
$$;
revoke all on function private.library_copy_open_loan(uuid) from public, anon;
grant execute on function private.library_copy_open_loan(uuid) to authenticated, service_role;

create function private.library_books_out(borrower uuid) returns integer
language sql volatile security definer set search_path = '' as $$
  select count(*)::integer from public.library_loans l
  where l.borrower_id = borrower and private.library_loan_is_open(l.id)
$$;
revoke all on function private.library_books_out(uuid) from public, anon;
grant execute on function private.library_books_out(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- A borrower: a name and one contact detail, checked.
create function private.check_library_borrower() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  digits integer;
begin
  new.full_name := private.tidy_text(new.full_name);
  new.contact := private.tidy_text(new.contact);
  if new.full_name is null then
    raise exception 'A borrower needs a name.';
  end if;
  if new.contact is null then
    raise exception 'A borrower needs one way to contact them: a phone number or an email address.';
  end if;
  if new.contact_kind = 'phone' then
    digits := length(regexp_replace(new.contact, '[^0-9]', '', 'g'));
    if new.contact !~ '^\+?[0-9 ()-]+$' or digits not between 7 and 15 then
      raise exception 'That phone number does not look right. Use digits only, for example 087 123 4567.';
    end if;
  elsif new.contact_kind = 'email' then
    new.contact := lower(new.contact);
    if new.contact !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'That email address does not look right. Check it has an @ and a full stop, for example name@example.ie.';
    end if;
  end if;

  if tg_op = 'UPDATE' and old.active and not new.active then
    perform private.lock_library_borrower(new.id);
    if private.library_books_out(new.id) > 0 then
      raise exception 'This borrower still has books on loan. They must all come back before the borrower is switched off.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_library_borrower() from public, anon;

create trigger check_library_borrower before insert or update on public.library_borrowers
  for each row execute function private.check_library_borrower();

-- ---------------------------------------------------------------------------
-- A new loan. Runs with the owner's rights so the checks see every loan.
create function private.check_library_loan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today       date := private.today_in_dublin();
  book_active boolean;
  person_on   boolean;
begin
  -- A person always lends today. Only the seed script and tests (no one
  -- signed in, master key) can record a loan from the past.
  if auth.uid() is not null then
    new.lent_on := today;
  end if;
  if new.lent_on > today then
    raise exception 'A book cannot be lent on a day in the future.';
  end if;
  if new.first_due_on is null then
    new.first_due_on := new.lent_on + 21;
  end if;
  if auth.uid() is not null then
    if new.first_due_on < today then
      raise exception 'The due date cannot be in the past.';
    end if;
    if new.first_due_on > today + 365 then
      raise exception 'The due date cannot be more than a year away.';
    end if;
  end if;

  perform private.lock_library_copy(new.copy_id);
  select b.active into book_active
  from public.library_copies c join public.library_books b on b.id = c.book_id
  where c.id = new.copy_id;
  if book_active is null then
    raise exception 'That copy could not be found.';
  end if;
  if not book_active then
    raise exception 'This book is switched off, so it cannot be lent.';
  end if;
  if private.library_copy_open_loan(new.copy_id) is not null then
    raise exception 'This book is already on loan. Return it first.';
  end if;

  perform private.lock_library_borrower(new.borrower_id);
  select br.active into person_on from public.library_borrowers br where br.id = new.borrower_id;
  if person_on is null then
    raise exception 'That borrower could not be found.';
  end if;
  if not person_on then
    raise exception 'This borrower is switched off. Switch them back on first.';
  end if;
  if private.library_books_out(new.borrower_id) >= 3 then
    raise exception 'This borrower already has 3 books out, the most allowed. One must come back first.';
  end if;
  return new;
end $$;
revoke all on function private.check_library_loan() from public, anon;

create trigger check_library_loan before insert on public.library_loans
  for each row execute function private.check_library_loan();

-- A new entry on a loan: returned, due date moved, or "returned by mistake".
create function private.check_library_loan_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today   date := private.today_in_dublin();
  ln      public.library_loans%rowtype;
  latest  public.library_loan_entries%rowtype;
begin
  select * into ln from public.library_loans l where l.id = new.loan_id;
  if ln.id is null then
    raise exception 'That loan could not be found.';
  end if;
  perform private.lock_library_copy(ln.copy_id);

  if auth.uid() is not null then
    new.happened_on := today;
  end if;
  if new.happened_on > today or new.happened_on < ln.lent_on then
    raise exception 'The date must be between the day the book was lent and today.';
  end if;

  if new.kind = 'returned' then
    if not private.library_loan_is_open(ln.id) then
      raise exception 'This book is not on loan, so it cannot be returned.';
    end if;

  elsif new.kind = 'due_moved' then
    if not private.library_loan_is_open(ln.id) then
      raise exception 'This loan has been returned; its due date cannot be moved.';
    end if;
    if new.new_due_on < ln.lent_on or (auth.uid() is not null and new.new_due_on < today) then
      raise exception 'The new due date cannot be in the past.';
    end if;
    if new.new_due_on > today + 365 then
      raise exception 'The new due date cannot be more than a year away.';
    end if;

  elsif new.kind = 'return_undone' then
    select * into latest from public.library_loan_entries e
    where e.loan_id = ln.id and e.kind in ('returned', 'return_undone')
    order by e.id desc limit 1;
    if latest.id is null or latest.kind <> 'returned' then
      raise exception 'This loan has not been returned, so there is no return to cancel.';
    end if;
    if new.undoes_entry_id is distinct from latest.id then
      raise exception 'A "returned by mistake" entry must point at this loan''s latest return.';
    end if;
    if private.library_copy_open_loan(ln.copy_id) is not null then
      raise exception 'This book has been lent again since, so the return cannot be cancelled. Return it from the new loan first.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_library_loan_entry() from public, anon;

create trigger check_library_loan_entry before insert on public.library_loan_entries
  for each row execute function private.check_library_loan_entry();

-- ---------------------------------------------------------------------------
-- Access: Super Admin, Centre Admin and the Library Operator. Borrowers can
-- be added and corrected; loans and entries only added. No delete
-- (standard safeguards).
create policy library_borrowers_read on public.library_borrowers for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_borrowers_add on public.library_borrowers for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_borrowers_change on public.library_borrowers for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')))
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));

create policy library_loans_read on public.library_loans for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_loans_add on public.library_loans for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));

create policy library_loan_entries_read on public.library_loan_entries for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_loan_entries_add on public.library_loan_entries for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));

-- ---------------------------------------------------------------------------
-- Each loan as it stands now, worked out from its entries. The reader's own
-- access rules apply.
create view public.library_loan_status with (security_invoker = true) as
select
  s.id,
  s.copy_id,
  s.borrower_id,
  s.lent_on,
  s.first_due_on,
  s.due_on,
  s.is_open,
  s.returned_on,
  case when s.is_open and s.due_on < s.today then s.today - s.due_on else 0 end as days_overdue,
  case when not s.is_open and s.returned_on > s.due_on then s.returned_on - s.due_on else 0 end as days_late,
  s.lent_by,
  s.created_at
from (
  select
    l.id,
    l.copy_id,
    l.borrower_id,
    l.lent_on,
    l.first_due_on,
    coalesce(m.new_due_on, l.first_due_on) as due_on,
    r.kind is distinct from 'returned' as is_open,
    case when r.kind = 'returned' then r.happened_on end as returned_on,
    l.created_by as lent_by,
    l.created_at,
    private.today_in_dublin() as today
  from public.library_loans l
  left join lateral (
    select e.new_due_on from public.library_loan_entries e
    where e.loan_id = l.id and e.kind = 'due_moved' order by e.id desc limit 1
  ) m on true
  left join lateral (
    select e.kind, e.happened_on from public.library_loan_entries e
    where e.loan_id = l.id and e.kind in ('returned', 'return_undone') order by e.id desc limit 1
  ) r on true
) s;

revoke all on public.library_loan_status from public, anon, authenticated, service_role;
grant select on public.library_loan_status to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The buttons. Each runs with the caller's own rights, so the access rules
-- above apply, and refuses anyone outside the library roles.
create function private.require_library_role() returns void
language plpgsql stable set search_path = '' as $$
begin
  if not private.has_role('super_admin', 'centre_admin', 'library_operator') then
    raise exception 'Only a Super Admin, Centre Admin or the Library Operator can do this.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.require_library_role() from public, anon;
grant execute on function private.require_library_role() to authenticated, service_role;

-- Lend: the due date is 21 days from today unless another is given.
create function public.lend_copy(p_copy_id uuid, p_borrower_id uuid, p_due_on date default null) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  new_loan bigint;
begin
  perform private.require_library_role();
  insert into public.library_loans (copy_id, borrower_id, first_due_on)
    values (p_copy_id, p_borrower_id, p_due_on)
    returning id into new_loan;
  return new_loan;
end $$;
revoke all on function public.lend_copy(uuid, uuid, date) from public, anon;
grant execute on function public.lend_copy(uuid, uuid, date) to authenticated;

-- Lend to someone new: the borrower and the loan are saved together, or neither.
create function public.lend_copy_to_new_borrower(
  p_copy_id      uuid,
  p_full_name    text,
  p_contact_kind text,
  p_contact      text,
  p_due_on       date default null
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  new_borrower uuid;
  new_loan     bigint;
begin
  perform private.require_library_role();
  insert into public.library_borrowers (full_name, contact_kind, contact)
    values (p_full_name, p_contact_kind, p_contact)
    returning id into new_borrower;
  insert into public.library_loans (copy_id, borrower_id, first_due_on)
    values (p_copy_id, new_borrower, p_due_on)
    returning id into new_loan;
  return jsonb_build_object('loan_id', new_loan, 'borrower_id', new_borrower);
end $$;
revoke all on function public.lend_copy_to_new_borrower(uuid, text, text, text, date) from public, anon;
grant execute on function public.lend_copy_to_new_borrower(uuid, text, text, text, date) to authenticated;

-- Return: one step. Says how many days late (for information only: no fines).
create function public.return_copy(p_copy_id uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  loan bigint;
  late integer;
begin
  perform private.require_library_role();
  perform private.lock_library_copy(p_copy_id);
  loan := private.library_copy_open_loan(p_copy_id);
  if loan is null then
    raise exception 'This book is not on loan, so it cannot be returned.';
  end if;
  insert into public.library_loan_entries (loan_id, kind) values (loan, 'returned');
  select s.days_late into late from public.library_loan_status s where s.id = loan;
  return jsonb_build_object('loan_id', loan, 'days_late', coalesce(late, 0));
end $$;
revoke all on function public.return_copy(uuid) from public, anon;
grant execute on function public.return_copy(uuid) to authenticated;

create function public.move_due_date(p_loan_id bigint, p_due_on date) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform private.require_library_role();
  if p_due_on is null then
    raise exception 'Pick the new due date.';
  end if;
  insert into public.library_loan_entries (loan_id, kind, new_due_on) values (p_loan_id, 'due_moved', p_due_on);
end $$;
revoke all on function public.move_due_date(bigint, date) from public, anon;
grant execute on function public.move_due_date(bigint, date) to authenticated;

-- "Returned by mistake, still on loan": cancels the loan's latest return.
create function public.undo_return(p_loan_id bigint) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  ret bigint;
begin
  perform private.require_library_role();
  select e.id into ret from public.library_loan_entries e
  where e.loan_id = p_loan_id and e.kind in ('returned', 'return_undone')
  order by e.id desc limit 1;
  -- The entry's own check refuses it if that latest entry is not a return.
  insert into public.library_loan_entries (loan_id, kind, undoes_entry_id)
    values (p_loan_id, 'return_undone', coalesce(ret, 0));
end $$;
revoke all on function public.undo_return(bigint) from public, anon;
grant execute on function public.undo_return(bigint) to authenticated;
