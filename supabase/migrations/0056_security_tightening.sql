-- 0056: Round C3, security tightening (docs/IMPROVEMENT-PLAN.md section 4,
-- 26 Nov 2026).
--   * Number counters (the "sequences" that hand out record numbers such as
--     T-0001) are closed to signed-out visitors, like everything else.
--     Before, a signed-out visitor could read them and even reset one, so
--     that new records would clash. Signed-in admins can still take the next
--     number (as every insert does) but no longer reset a counter.
--   * The Library sign-in page asks, before emailing a code, whether the
--     address is a switched-on Library Operator's. An admin's address never
--     gets a code (the database already refused such a sign-in; now the
--     email is not even sent). The answer is only yes or no, and only for
--     the Library Operator role: it says nothing about admin accounts.
--   * A document's file must sit in its own model's or item's folder
--     (models/<id>/... or items/<id>/...), and the document store takes only
--     the file names the website gives. Files and documents already there
--     stay as they are (nothing is deleted).
--   * The security report watches for the first two from now on.

-- ---------------------------------------------------------------------------
revoke all on all sequences in schema public from anon;
revoke update on all sequences in schema public from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke update on sequences from authenticated;

-- ---------------------------------------------------------------------------
create function public.library_code_allowed(p_email text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_email) <= 254 and exists (
    select 1
    from auth.users au
    join public.app_users u on u.id = au.id
    join public.roles r on r.code = u.role
    where lower(au.email) = lower(trim(p_email))
      and u.active and r.active and r.sign_in_method = 'email_code'
  ), false)
$$;
revoke all on function public.library_code_allowed(text) from public, anon, authenticated;
grant execute on function public.library_code_allowed(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Documents (0045): the store takes only the website's own file names.
drop policy asset_documents_files_add on storage.objects;
create policy asset_documents_files_add on storage.objects for insert to authenticated
  with check (
    bucket_id = 'asset-documents'
    and (select private.has_role('super_admin', 'centre_admin'))
    and name ~ '^(models|items)/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp)$'
  );

-- ... and a new document's file is in its own folder. From 0045, one check added.
create or replace function private.check_asset_document() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.hidden then
      raise exception 'A new document starts shown. Hide it afterwards, with a reason, if it is wrong.';
    end if;
    if not starts_with(new.file_path, case when new.model_id is not null then 'models/' || new.model_id::text || '/'
                                           else 'items/' || new.item_id::text || '/' end) then
      raise exception 'The file must be in the folder of its own make and model or item. Please upload it again.';
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

-- ---------------------------------------------------------------------------
-- The security report, from 0027 with three changes: the Library check is
-- allowed for signed-out visitors by name, and two checks on number counters.
create or replace function public.security_problems()
returns table (object_kind text, object_name text, problem text)
language sql stable security definer set search_path = '' as $$
  -- Views must apply the reader's own access rules.
  select 'view', c.relname::text, 'does not apply the reader''s own access rules'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and (c.relkind = 'm' or not exists (
      select 1 from pg_catalog.unnest(coalesce(c.reloptions, '{}'::text[])) o
      where o in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')))
  union all
  -- Signed-out visitors must not reach any table or view.
  select 'anon_access', c.relname::text, 'signed-out visitors have access'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  union all
  -- Round C3: nor any number counter.
  select 'anon_sequence', n.nspname || '.' || c.relname, 'signed-out visitors can read or change this number counter'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'S'
    -- (asked only of counters: the check fails on any other kind of object)
    and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege('anon', c.oid, 'USAGE, SELECT, UPDATE') else false end
  union all
  -- Round C3: and no signed-in admin may reset one.
  select 'sequence_reset', n.nspname || '.' || c.relname, 'signed-in admins can reset this number counter'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind = 'S'
    and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege('authenticated', c.oid, 'UPDATE') else false end
  union all
  -- ... or any database function, except the daily reminder timer's two,
  -- which do nothing without its secret key, and the Library sign-in check.
  select 'function_open', n.nspname || '.' || p.proname, 'signed-out visitors can run it'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    and not (n.nspname = 'public'
             and p.oid in ('public.run_reminders(text)'::pg_catalog.regprocedure,
                           'public.record_reminder_deliveries(bigint, jsonb, text)'::pg_catalog.regprocedure,
                           'public.library_code_allowed(text)'::pg_catalog.regprocedure))
  union all
  -- Functions with the owner's rights must fix where they look things up.
  select 'function_search_path', n.nspname || '.' || p.proname, 'runs with the owner''s rights but does not fix search_path'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from pg_catalog.unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
  union all
  -- No rule may depend on a setting that could be switched on by hand.
  select 'setting_flag', n.nspname || '.' || p.proname, 'relies on a setting that could be switched on by hand'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc ~* 'current_setting\s*\(\s*''icci\.'
  union all
  -- Access rules must check the role once per search, not once per row.
  select 'policy_per_row', pol.schemaname || '.' || pol.tablename || '.' || pol.policyname,
         'checks the role or the signed-in person once for every row'
  from pg_catalog.pg_policies pol
  where pol.schemaname in ('public', 'storage')
    and pg_catalog.regexp_replace(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''),
          '\( SELECT (private\.has_role|private\.current_app_role|auth\.uid)\(', '', 'g')
        ~ '(private\.has_role|private\.current_app_role|auth\.uid)\('
  union all
  -- No file store may be public.
  select 'public_bucket', b.id::text, 'files can be opened without signing in'
  from storage.buckets b
  where b.public
$$;
revoke all on function public.security_problems() from public, anon, authenticated;
grant execute on function public.security_problems() to service_role;
