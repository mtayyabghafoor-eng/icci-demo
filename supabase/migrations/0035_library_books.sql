-- 0035: Library books and copies (PLAN.md 5.4; docs/PHASE-4.md, slice P4.2).
-- Owner's choices, 19 Nov 2026 (all recommended answers):
--   * One record per copy, one ICCI label per copy. Books use the same
--     labels as items (printed by an admin). A label is on an item OR a
--     library copy, never both, and on one copy only.
--   * Super Admin, Centre Admin and the Library Operator add, read and
--     correct books and copies. Finance sees nothing. Nothing is deleted.
--   * A book is one title and edition: title (any language, Arabic too),
--     optional author, optional ISBN (checked, stored as 13 digits, one
--     book record per ISBN), optional publisher and year, and language.
--   * A copy cannot move to another book or label; only its note changes.
--   * Lending, returns, lost and withdrawn copies come in later slices.

-- ---------------------------------------------------------------------------
-- ISBN: digits only, the check digit right, always 13 digits.
-- A 10-digit ISBN (older books) becomes the same book's 13-digit one.
create function private.normalise_isbn(raw text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  s     text := upper(regexp_replace(coalesce(raw, ''), '^\s*ISBN[:\s]*', '', 'i'));
  total integer := 0;
  i     integer;
  body  text;
begin
  s := regexp_replace(s, '[\s-]', '', 'g');
  if s = '' then
    return null;
  end if;
  if s ~ '^[0-9]{9}[0-9X]$' then
    for i in 1..10 loop
      total := total + (case when substr(s, i, 1) = 'X' then 10 else substr(s, i, 1)::integer end) * (11 - i);
    end loop;
    if total % 11 <> 0 then
      raise exception 'That ISBN does not look right. Check the digits under the barcode.';
    end if;
    body := '978' || substr(s, 1, 9);
  elsif s ~ '^97[89][0-9]{10}$' then
    body := substr(s, 1, 12);
  else
    raise exception 'That ISBN does not look right. An ISBN has 13 digits (or 10 on older books).';
  end if;
  total := 0;
  for i in 1..12 loop
    total := total + substr(body, i, 1)::integer * (case when i % 2 = 0 then 3 else 1 end);
  end loop;
  body := body || ((10 - total % 10) % 10)::text;
  if length(s) = 13 and body <> s then
    raise exception 'That ISBN does not look right. Check the digits under the barcode.';
  end if;
  return body;
end $$;
revoke all on function private.normalise_isbn(text) from public, anon;
grant execute on function private.normalise_isbn(text) to authenticated, service_role;

-- Spaces tidied: trimmed, and runs of spaces made one. Empty becomes null.
create function private.tidy_text(raw text) returns text
language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(trim(coalesce(raw, '')), '\s+', ' ', 'g'), '')
$$;
revoke all on function private.tidy_text(text) from public, anon;
grant execute on function private.tidy_text(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
create table public.library_books (
  id             uuid primary key default gen_random_uuid(),
  title          text not null check (length(title) between 1 and 300),
  author         text check (length(author) between 1 and 200),
  isbn           text check (isbn ~ '^97[89][0-9]{10}$'),
  publisher      text check (length(publisher) between 1 and 200),
  published_year integer check (published_year between 1000 and 2100),
  language       text not null check (language in ('en', 'ar', 'other')),
  -- How the details were entered: typed by hand, or looked up from the ISBN (P4.3).
  entered_by     text not null default 'typed' check (entered_by in ('typed', 'looked_up')),
  active         boolean not null default true,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now()
);
call private.add_standard_safeguards('library_books', 'id');
create unique index library_books_unique_isbn on public.library_books (isbn) where isbn is not null;
create index library_books_title on public.library_books (lower(title));

create function private.check_library_book() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := private.tidy_text(new.title);
  new.author := private.tidy_text(new.author);
  new.publisher := private.tidy_text(new.publisher);
  if new.title is null then
    raise exception 'A book needs a title.';
  end if;
  if tg_op = 'INSERT' or new.isbn is distinct from old.isbn then
    new.isbn := private.normalise_isbn(new.isbn);
  end if;
  if new.published_year is not null
     and new.published_year > extract(year from private.today_in_dublin())::integer + 1 then
    raise exception 'The year cannot be in the future.';
  end if;
  return new;
end $$;
revoke all on function private.check_library_book() from public, anon;

create trigger check_library_book before insert or update on public.library_books
  for each row execute function private.check_library_book();

-- ---------------------------------------------------------------------------
create table public.library_copies (
  id           uuid primary key default gen_random_uuid(),
  book_id      uuid not null references public.library_books (id),
  label_serial text not null unique references public.labels (serial),
  copy_note    text check (length(copy_note) between 1 and 200),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);
call private.add_standard_safeguards('library_copies', 'id');
create index library_copies_book on public.library_copies (book_id);

-- Both checks below take the same lock on the label number, so an item and
-- a copy can never be given the same label at the same moment.
create function private.lock_label(serial text) returns void
language sql set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('icci-label:' || serial, 0))
$$;
revoke all on function private.lock_label(text) from public, anon;

-- Runs with the owner's rights: the Library Operator cannot read items, but
-- the database must still check the label is not on one.
create function private.check_library_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  book_active boolean;
begin
  new.copy_note := private.tidy_text(new.copy_note);
  if tg_op = 'UPDATE' then
    if new.book_id is distinct from old.book_id then
      raise exception 'A copy cannot be moved to another book. Add a new copy instead.';
    end if;
    if new.label_serial is distinct from old.label_serial then
      raise exception 'A copy''s label cannot be changed.';
    end if;
    return new;
  end if;

  perform private.lock_label(new.label_serial);
  if exists (select 1 from public.items i where i.label_serial = new.label_serial) then
    raise exception 'This label is already on an item. Use a new label for the book.';
  end if;
  if exists (select 1 from public.library_copies c where c.label_serial = new.label_serial) then
    raise exception 'This label is already on another copy. Use a new label.';
  end if;
  select b.active into book_active from public.library_books b where b.id = new.book_id;
  if book_active is null then
    raise exception 'That book could not be found.';
  end if;
  if not book_active then
    raise exception 'This book is switched off. Switch it back on to add a copy.';
  end if;
  return new;
end $$;
revoke all on function private.check_library_copy() from public, anon;

create trigger check_library_copy before insert or update on public.library_copies
  for each row execute function private.check_library_copy();

-- Items: a label on a library copy cannot be used for an item.
create function private.check_item_label_not_on_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.label_serial is distinct from old.label_serial then
    perform private.lock_label(new.label_serial);
    if exists (select 1 from public.library_copies c where c.label_serial = new.label_serial) then
      raise exception 'This label is already on a library book. Use a new label for the item.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_item_label_not_on_copy() from public, anon;

create trigger check_item_label_not_on_copy before insert or update on public.items
  for each row execute function private.check_item_label_not_on_copy();

-- ---------------------------------------------------------------------------
-- Access: Super Admin, Centre Admin and the Library Operator. No delete
-- (standard safeguards).
create policy library_books_read on public.library_books for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_books_add on public.library_books for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_books_change on public.library_books for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')))
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));

create policy library_copies_read on public.library_copies for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_copies_add on public.library_copies for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));
create policy library_copies_change on public.library_copies for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'library_operator')))
  with check ((select private.has_role('super_admin', 'centre_admin', 'library_operator')));

-- ---------------------------------------------------------------------------
-- Add a book and its first copy together: both are saved, or neither.
-- Runs with the caller's own rights, so the access rules above apply.
create function public.add_book_and_copy(
  p_label     text,
  p_title     text,
  p_author    text,
  p_isbn      text,
  p_publisher text,
  p_year      integer,
  p_language  text,
  p_copy_note text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  new_book uuid;
  new_copy uuid;
begin
  if not private.has_role('super_admin', 'centre_admin', 'library_operator') then
    raise exception 'Only a Super Admin, Centre Admin or the Library Operator can add books.' using errcode = '42501';
  end if;
  insert into public.library_books (title, author, isbn, publisher, published_year, language)
    values (p_title, p_author, p_isbn, p_publisher, p_year, p_language)
    returning id into new_book;
  insert into public.library_copies (book_id, label_serial, copy_note)
    values (new_book, p_label, p_copy_note)
    returning id into new_copy;
  return jsonb_build_object('book_id', new_book, 'copy_id', new_copy);
end $$;
revoke all on function public.add_book_and_copy(text, text, text, text, text, integer, text, text) from public, anon;
grant execute on function public.add_book_and_copy(text, text, text, text, text, integer, text, text) to authenticated;

-- What a label is used for, for the Scan button: an item, a library copy,
-- free (printed, not used yet) or unknown. It tells the Library Operator
-- only this, never what the item is.
create function public.label_use(p_serial text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  copy uuid;
begin
  if not private.has_role('super_admin', 'centre_admin', 'library_operator') then
    raise exception 'Your account cannot open labels.' using errcode = '42501';
  end if;
  select c.id into copy from public.library_copies c where c.label_serial = p_serial;
  if copy is not null then
    return jsonb_build_object('use', 'book_copy', 'copy_id', copy);
  end if;
  if exists (select 1 from public.items i where i.label_serial = p_serial) then
    return jsonb_build_object('use', 'item', 'copy_id', null);
  end if;
  if exists (select 1 from public.labels l where l.serial = p_serial) then
    return jsonb_build_object('use', 'free', 'copy_id', null);
  end if;
  return jsonb_build_object('use', 'unknown', 'copy_id', null);
end $$;
revoke all on function public.label_use(text) from public, anon;
grant execute on function public.label_use(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The Library list: each book with how many copies it has. The reader's own
-- access rules apply.
create view public.library_book_list with (security_invoker = true) as
select
  b.id,
  b.title,
  b.author,
  b.isbn,
  b.publisher,
  b.published_year,
  b.language,
  b.active,
  b.created_at,
  (select count(*) from public.library_copies c where c.book_id = b.id)::integer as copies
from public.library_books b;

revoke all on public.library_book_list from public, anon, authenticated, service_role;
grant select on public.library_book_list to authenticated, service_role;
