-- 0001: Shared safeguards used by every table, and the append-only audit log.
-- (CLAUDE.md "Rules with no exceptions"; PLAN.md section 4.)
--
-- Helpers live in a "private" schema, which the website's data API cannot
-- reach. Only the database itself uses them.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- New tables in "public" are never readable by signed-out visitors, and can
-- never be deleted from by signed-in users, unless a later migration says so.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke delete, truncate on tables from authenticated;

-- ---------------------------------------------------------------------------
-- Who and when: filled in by the database, so nobody can fake them.
-- auth.uid() is the signed-in person; it is empty for the seed script.
create function private.stamp_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end $$;

-- No hard deletes anywhere. This also stops the master key.
create function private.block_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Records in % cannot be deleted. Deactivate or correct them instead.', tg_table_name;
end $$;

-- ---------------------------------------------------------------------------
-- The audit log: one row per insert or update on every table.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  table_name  text not null,
  record_id   text not null,
  action      text not null check (action in ('insert', 'update')),
  changed_by  uuid,                         -- empty = seed script or migration
  changed_at  timestamptz not null default now(),
  old_values  jsonb,                        -- empty for a new record
  new_values  jsonb not null
);
create index audit_log_record on public.audit_log (table_name, record_id);
create index audit_log_time on public.audit_log (changed_at);

alter table public.audit_log enable row level security;

-- Nobody may write to it directly: only the trigger below can.
revoke all on public.audit_log from anon, authenticated, service_role;
grant select on public.audit_log to authenticated, service_role;
-- (The "who may read it" rule is added in 0002, once roles exist.)

create function private.block_audit_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'The audit log cannot be changed or deleted.';
end $$;

create trigger audit_log_no_change before update or delete on public.audit_log
  for each row execute function private.block_audit_change();
create trigger audit_log_no_truncate before truncate on public.audit_log
  for each statement execute function private.block_audit_change();

-- Runs with the database owner's rights so it can write the log, which no
-- user can. The first argument names the column that identifies the record.
create function private.write_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (table_name, record_id, action, changed_by, old_values, new_values)
  values (
    tg_table_name,
    to_jsonb(new) ->> tg_argv[0],
    lower(tg_op),
    auth.uid(),
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new)
  );
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- One call that applies every standard safeguard to a new table:
-- row-level security on, no access for signed-out visitors, no deleting,
-- who/when filled in, and every change written to the audit log.
-- The table must have created_by, created_at, updated_by, updated_at columns.
create procedure private.add_standard_safeguards(tbl text, key_col text default 'id')
language plpgsql set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format('revoke all on public.%I from anon', tbl);
  execute format('revoke delete, truncate on public.%I from authenticated', tbl);
  execute format('revoke truncate on public.%I from service_role', tbl);
  execute format('create trigger stamp_record before insert or update on public.%I
                  for each row execute function private.stamp_record()', tbl);
  execute format('create trigger block_delete before delete on public.%I
                  for each row execute function private.block_delete()', tbl);
  execute format('create trigger block_truncate before truncate on public.%I
                  for each statement execute function private.block_delete()', tbl);
  execute format('create trigger write_audit after insert or update on public.%I
                  for each row execute function private.write_audit(%L)', tbl, key_col);
end $$;

revoke all on all functions in schema private from public;
revoke all on procedure private.add_standard_safeguards(text, text) from public;
