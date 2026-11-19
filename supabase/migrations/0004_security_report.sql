-- 0004: A security report the tests use to check EVERY table, including
-- tables added in later slices, follows the rules: row-level security on,
-- deleting blocked, changes audited, who/when columns present.
-- Only the master key (tests on this PC) can run it.

create function public.security_report()
returns table (
  table_name         text,
  rls_enabled        boolean,
  blocks_delete      boolean,
  audited            boolean,
  has_record_columns boolean
)
language sql stable security definer set search_path = '' as $$
  select
    c.relname::text,
    c.relrowsecurity,
    -- a "before delete" row trigger (tgtype bits: 2 = before, 8 = delete)
    -- and a "before truncate" trigger (bit 32)
    exists (select 1 from pg_catalog.pg_trigger t
            where t.tgrelid = c.oid and (t.tgtype & 2) <> 0 and (t.tgtype & 8) <> 0)
      and exists (select 1 from pg_catalog.pg_trigger t
                  where t.tgrelid = c.oid and (t.tgtype & 32) <> 0),
    exists (select 1 from pg_catalog.pg_trigger t
            join pg_catalog.pg_proc p on p.oid = t.tgfoid
            join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
            where t.tgrelid = c.oid and pn.nspname = 'private' and p.proname = 'write_audit'),
    (select count(*) from pg_catalog.pg_attribute a
     where a.attrelid = c.oid and not a.attisdropped
       and a.attname in ('created_by', 'created_at', 'updated_by', 'updated_at')) = 4
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  order by 1
$$;

revoke all on function public.security_report() from public, anon, authenticated;
grant execute on function public.security_report() to service_role;
