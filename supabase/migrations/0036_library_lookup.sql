-- 0036: Looking a book up from its ISBN (docs/PHASE-4.md section 5, slice P4.3).
-- The look-up itself happens on the website's server (only the ISBN is sent
-- to Open Library). Here, add_book_and_copy learns to record how the
-- details were entered: 'typed' by hand (as before) or 'looked_up'. The
-- person still checks and can change every detail before saving.

drop function public.add_book_and_copy(text, text, text, text, text, integer, text, text);

create function public.add_book_and_copy(
  p_label      text,
  p_title      text,
  p_author     text,
  p_isbn       text,
  p_publisher  text,
  p_year       integer,
  p_language   text,
  p_copy_note  text,
  p_entered_by text default 'typed'
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  new_book uuid;
  new_copy uuid;
begin
  if not private.has_role('super_admin', 'centre_admin', 'library_operator') then
    raise exception 'Only a Super Admin, Centre Admin or the Library Operator can add books.' using errcode = '42501';
  end if;
  insert into public.library_books (title, author, isbn, publisher, published_year, language, entered_by)
    values (p_title, p_author, p_isbn, p_publisher, p_year, p_language, coalesce(p_entered_by, 'typed'))
    returning id into new_book;
  insert into public.library_copies (book_id, label_serial, copy_note)
    values (new_book, p_label, p_copy_note)
    returning id into new_copy;
  return jsonb_build_object('book_id', new_book, 'copy_id', new_copy);
end $$;
revoke all on function public.add_book_and_copy(text, text, text, text, text, integer, text, text, text) from public, anon;
grant execute on function public.add_book_and_copy(text, text, text, text, text, integer, text, text, text) to authenticated;
