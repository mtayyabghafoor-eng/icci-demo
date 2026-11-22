-- 0045: Manuals and documents (PLAN.md 5.1, slice P1.20; owner approved
-- 21 Nov 2026).
--
--   * A document belongs to a make and model (a manual, used by every unit)
--     or to one item (its warranty card, invoice, service report, a photo of
--     the maker's plate), never both.
--   * Kept in a private file store, "asset-documents": PDF or a picture, up
--     to 10 MB. Added and viewed only, never replaced or deleted.
--   * A wrong document is hidden with a reason; nothing else about it ever
--     changes. Hidden documents stay in the record.
--   * Super Admin and Centre Admin only.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asset-documents', 'asset-documents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy asset_documents_files_read on storage.objects for select to authenticated
  using (bucket_id = 'asset-documents' and (select private.has_role('super_admin', 'centre_admin')));
create policy asset_documents_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-documents' and (select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
create table public.asset_documents (
  id            bigint generated always as identity primary key,
  model_id      uuid references public.product_models (id),
  item_id       uuid references public.items (id),
  kind          text not null check (kind in ('manual', 'warranty', 'invoice', 'service_report', 'certificate', 'plate_photo', 'other')),
  title         text not null check (length(trim(title)) between 1 and 120),
  file_path     text not null unique check (file_path ~ '^[A-Za-z0-9/_.-]+$' and file_path !~ '\.\.'),
  hidden        boolean not null default false,
  hidden_reason text check (length(trim(hidden_reason)) between 1 and 500),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  constraint asset_documents_one_owner check ((model_id is null) <> (item_id is null)),
  constraint asset_documents_hidden_has_reason check (hidden = (hidden_reason is not null))
);
call private.add_standard_safeguards('asset_documents', 'id');
create index asset_documents_model on public.asset_documents (model_id) where model_id is not null;
create index asset_documents_item on public.asset_documents (item_id) where item_id is not null;

-- Whether the file is really in the store (looks as the database owner,
-- answers only yes or no for one path in this store).
create function private.asset_document_file_exists(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'asset-documents' and o.name = p_path)
$$;
revoke all on function private.asset_document_file_exists(text) from public, anon;
grant execute on function private.asset_document_file_exists(text) to authenticated, service_role;

create function private.check_asset_document() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.hidden then
      raise exception 'A new document starts shown. Hide it afterwards, with a reason, if it is wrong.';
    end if;
    if not private.asset_document_file_exists(new.file_path) then
      raise exception 'The file was not found in the document store. Please upload it again.';
    end if;
    new.title := trim(new.title);
    return new;
  end if;
  -- UPDATE: only hiding, once, with a reason.
  if old.hidden then
    raise exception 'This document is already hidden. Nothing about it can change.';
  end if;
  if not new.hidden or new.model_id is distinct from old.model_id or new.item_id is distinct from old.item_id
     or new.kind is distinct from old.kind or new.title is distinct from old.title or new.file_path is distinct from old.file_path then
    raise exception 'A document never changes. If it is wrong, hide it with a reason and add the right one.';
  end if;
  new.hidden_reason := trim(new.hidden_reason);
  return new;
end $$;
revoke all on function private.check_asset_document() from public, anon;
create trigger check_asset_document before insert or update on public.asset_documents
  for each row execute function private.check_asset_document();

create policy asset_documents_read on public.asset_documents for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy asset_documents_add on public.asset_documents for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy asset_documents_change on public.asset_documents for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));
