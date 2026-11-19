-- 0038: Library lost and withdrawn copies, the lists and the Home counters
-- (PLAN.md 5.4; docs/PHASE-4.md, slice P4.5). Owner's choices, 19 Nov 2026
-- (all recommended answers):
--   * The Library Operator may mark a copy lost on their own (books are low
--     value; every entry is in the audit log). Super Admin and Centre Admin
--     too. Finance and signed-out visitors get nothing.
--   * A copy entry (lost, withdrawn, found) is never changed or deleted.
--     Whether a copy is lost or withdrawn is worked out from the latest one,
--     the way stock is worked out from movements.
--   * Lost: the copy cannot be lent. If it was on loan, the loan ends with a
--     "lost" entry (the borrower no longer has it out). Found puts it back
--     on the shelf; the old loan stays closed.
--   * Withdrawn: taken out of the collection for good. It must not be on
--     loan (return it, or mark it lost). A withdrawn copy cannot come back.
--   * Read-only lists: every copy with its status, most borrowed books, and
--     the counters for Home.

-- ---------------------------------------------------------------------------
-- A loan can now also end because the book was lost.
alter table public.library_loan_entries drop constraint library_loan_entries_kind_check;
alter table public.library_loan_entries
  add constraint library_loan_entries_kind_check
  check (kind in ('returned', 'due_moved', 'return_undone', 'lost'));

create table public.library_copy_entries (
  id          bigint generated always as identity primary key,
  copy_id     uuid not null references public.library_copies (id),
  kind        text not null check (kind in ('lost', 'withdrawn', 'found')),
  happened_on date not null default private.today_in_dublin(),
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
call private.add_standard_safeguards('library_copy_entries', 'id');
create index library_copy_entries_copy on public.library_copy_entries (copy_id, id);

create function private.block_library_copy_entry_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'A lost, withdrawn or found entry is never changed. Add a new entry instead.';
end $$;
revoke all on function private.block_library_copy_entry_change() from public, anon;

create trigger block_history_change before update on public.library_copy_entries
  for each row execute function private.block_library_copy_entry_change();

-- ---------------------------------------------------------------------------
-- 'normal', 'lost' or 'withdrawn', from the copy's latest entry.
create function private.library_copy_state(copy uuid) returns text
language sql volatile security definer set search_path = '' as $$
  select coalesce((
    select case e.kind when 'found' then 'normal' else e.kind end
    from public.library_copy_entries e where e.copy_id = copy
    order by e.id desc limit 1
  ), 'normal')
$$;
revoke all on function private.library_copy_state(uuid) from public, anon;
grant execute on function private.library_copy_state(uuid) to authenticated, service_role;

-- A loan is out unless its latest return, undo or lost entry ends it.
create or replace function private.library_loan_is_open(loan bigint) returns boolean
language sql volatile security definer set search_path = '' as $$
  select coalesce((
    select e.kind = 'return_undone' from public.library_loan_entries e
    where e.loan_id = loan and e.kind in ('returned', 'return_undone', 'lost')
    order by e.id desc limit 1
  ), true)
$$;

-- ---------------------------------------------------------------------------
-- The loan view: a lost loan is closed (and says when).
create or replace view public.library_loan_status with (security_invoker = true) as
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
  s.created_at,
  s.lost_on
from (
  select
    l.id,
    l.copy_id,
    l.borrower_id,
    l.lent_on,
    l.first_due_on,
    coalesce(m.new_due_on, l.first_due_on) as due_on,
    (r.kind is null or r.kind = 'return_undone') as is_open,
    case when r.kind = 'returned' then r.happened_on end as returned_on,
    case when r.kind = 'lost' then r.happened_on end as lost_on,
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
    where e.loan_id = l.id and e.kind in ('returned', 'return_undone', 'lost') order by e.id desc limit 1
  ) r on true
) s;

-- ---------------------------------------------------------------------------
-- Loan checks, now knowing about lost and withdrawn copies.
create or replace function private.check_library_loan() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today       date := private.today_in_dublin();
  book_active boolean;
  person_on   boolean;
  state       text;
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
  state := private.library_copy_state(new.copy_id);
  if state = 'lost' then
    raise exception 'This copy is marked lost, so it cannot be lent. If it has turned up, mark it found first.';
  elsif state = 'withdrawn' then
    raise exception 'This copy has been withdrawn from the library, so it cannot be lent.';
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

create or replace function private.check_library_loan_entry() returns trigger
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

  elsif new.kind = 'lost' then
    if not private.library_loan_is_open(ln.id) then
      raise exception 'This book is not on loan, so it cannot be marked lost from the loan.';
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
    where e.loan_id = ln.id and e.kind in ('returned', 'return_undone', 'lost')
    order by e.id desc limit 1;
    if latest.id is null or latest.kind <> 'returned' then
      raise exception 'This loan has not been returned, so there is no return to cancel.';
    end if;
    if new.undoes_entry_id is distinct from latest.id then
      raise exception 'A "returned by mistake" entry must point at this loan''s latest return.';
    end if;
    if private.library_copy_state(ln.copy_id) <> 'normal' then
      raise exception 'This copy has been marked lost or withdrawn since, so the return cannot be cancelled.';
    end if;
    if private.library_copy_open_loan(ln.copy_id) is not null then
      raise exception 'This book has been lent again since, so the return cannot be cancelled. Return it from the new loan first.';
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- A new lost / withdrawn / found entry.
create function private.check_library_copy_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today date := private.today_in_dublin();
  state text;
  loan  bigint;
begin
  if auth.uid() is not null then
    new.happened_on := today;
  end if;
  if new.happened_on > today then
    raise exception 'The date cannot be in the future.';
  end if;

  perform private.lock_library_copy(new.copy_id);
  if not exists (select 1 from public.library_copies c where c.id = new.copy_id) then
    raise exception 'That copy could not be found.';
  end if;
  state := private.library_copy_state(new.copy_id);
  loan := private.library_copy_open_loan(new.copy_id);

  if new.kind = 'lost' then
    if state = 'lost' then
      raise exception 'This copy is already marked lost.';
    elsif state = 'withdrawn' then
      raise exception 'This copy has been withdrawn from the library, so it cannot be marked lost.';
    end if;
    -- Lost while on loan: the borrower no longer has it out.
    if loan is not null then
      insert into public.library_loan_entries (loan_id, kind) values (loan, 'lost');
    end if;
  elsif new.kind = 'withdrawn' then
    if state = 'withdrawn' then
      raise exception 'This copy has already been withdrawn.';
    end if;
    if loan is not null then
      raise exception 'This copy is on loan. Return it first, or mark it lost.';
    end if;
  elsif new.kind = 'found' then
    if state <> 'lost' then
      raise exception 'Only a copy marked lost can be marked found.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_library_copy_entry() from public, anon;

create trigger check_library_copy_entry before insert on public.library_copy_entries
  for each row execute function private.check_library_copy_entry();

-- ---------------------------------------------------------------------------
-- Access: Super Admin, Centre Admin and the Library Operator. Added, never
-- changed, never deleted.
create policy library_copy_entries_read on public.library_copy_entries for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_copy_entries_add on public.library_copy_entries for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));

-- Mark a copy lost, withdrawn or found. Runs with the caller's own rights.
create function public.mark_copy(p_copy_id uuid, p_kind text) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  perform private.require_library_role();
  insert into public.library_copy_entries (copy_id, kind) values (p_copy_id, p_kind);
end $$;
revoke all on function public.mark_copy(uuid, text) from public, anon;
grant execute on function public.mark_copy(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Every copy with its status now, worked out from its entries and loans. The
-- reader's own access rules apply.
create view public.library_copy_list with (security_invoker = true) as
select
  c.id,
  c.book_id,
  c.label_serial,
  b.title,
  b.author,
  b.language,
  b.active as book_active,
  case
    when ce.kind = 'lost' then 'lost'
    when ce.kind = 'withdrawn' then 'withdrawn'
    when l.id is null then 'available'
    when l.days_overdue > 0 then 'overdue'
    else 'on_loan'
  end as status,
  case when ce.kind in ('lost', 'withdrawn') then ce.happened_on end as flagged_on,
  l.id as loan_id,
  l.borrower_id,
  l.lent_on,
  l.due_on,
  coalesce(l.days_overdue, 0) as days_overdue
from public.library_copies c
join public.library_books b on b.id = c.book_id
left join lateral (
  select e.kind, e.happened_on from public.library_copy_entries e
  where e.copy_id = c.id order by e.id desc limit 1
) ce on true
left join lateral (
  select s.id, s.borrower_id, s.lent_on, s.due_on, s.days_overdue from public.library_loan_status s
  where s.copy_id = c.id and s.is_open order by s.id desc limit 1
) l on true;

revoke all on public.library_copy_list from public, anon, authenticated, service_role;
grant select on public.library_copy_list to authenticated, service_role;

-- Most borrowed: books by how many times a copy was lent in a period.
create function public.library_most_borrowed(p_since date, p_until date default null)
returns table (book_id uuid, title text, author text, loans bigint)
language plpgsql stable security invoker set search_path = '' as $$
begin
  perform private.require_library_role();
  return query
    select b.id, b.title, b.author, count(*)::bigint
    from public.library_loans l
    join public.library_copies c on c.id = l.copy_id
    join public.library_books b on b.id = c.book_id
    where l.lent_on >= p_since and (p_until is null or l.lent_on <= p_until)
    group by b.id, b.title, b.author
    order by count(*) desc, b.title
    limit 200;
end $$;
revoke all on function public.library_most_borrowed(date, date) from public, anon;
grant execute on function public.library_most_borrowed(date, date) to authenticated;

-- The Home counters for the library. Also open to the Library Operator, who
-- cannot use home_counters.
create function public.library_counters()
returns table (books_overdue integer, due_soon integer, books_on_loan integer, copies_lost integer)
language plpgsql stable security invoker set search_path = '' as $$
declare
  today date := private.today_in_dublin();
begin
  perform private.require_library_role();
  return query
    select
      (count(*) filter (where s.status = 'overdue'))::integer,
      (count(*) filter (where s.status = 'on_loan' and s.due_on <= today + 3))::integer,
      (count(*) filter (where s.status in ('on_loan', 'overdue')))::integer,
      (count(*) filter (where s.status = 'lost'))::integer
    from public.library_copy_list s;
end $$;
revoke all on function public.library_counters() from public, anon;
grant execute on function public.library_counters() to authenticated;
