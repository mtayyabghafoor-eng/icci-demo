-- 0015: Two findings from the fresh-eyes security review (15 Nov 2026).
--
--   * Record numbers. An admin could change the id of an item, location or
--     category (or a role's code) as long as nothing pointed at it yet. That
--     cuts the record off from its history in the audit log. Every table now
--     refuses it, even with the master key, and the security report checks it.
--   * Moving a place. Moving a room or store room (changing what it is
--     inside) silently moves everything in it, with no "Move" entry. The
--     owner chose: a place that still holds items, or overlaps a stocktake
--     under way (either way round), can be neither switched off nor moved.
--     Empty places can. Disposed assets do not count.

create function private.block_key_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) -> tg_argv[0]) is distinct from (to_jsonb(old) -> tg_argv[0]) then
    raise exception 'A record number cannot be changed. It links the record to its history.';
  end if;
  return new;
end $$;
revoke all on function private.block_key_change() from public, anon;

-- Every existing table except the audit log (which cannot be changed at all).
do $$
declare
  t record;
begin
  for t in
    select c.relname, a.attname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    join pg_catalog.pg_index i on i.indrelid = c.oid and i.indisprimary
    join pg_catalog.pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
    where n.nspname = 'public' and c.relkind = 'r' and c.relname <> 'audit_log'
  loop
    execute format('create trigger block_key_change before update on public.%I
                    for each row execute function private.block_key_change(%L)', t.relname, t.attname);
  end loop;
end $$;

-- New tables get it too.
create or replace procedure private.add_standard_safeguards(tbl text, key_col text default 'id')
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
  execute format('create trigger block_key_change before update on public.%I
                  for each row execute function private.block_key_change(%L)', tbl, key_col);
  execute format('create trigger write_audit after insert or update on public.%I
                  for each row execute function private.write_audit(%L)', tbl, key_col);
end $$;
revoke all on procedure private.add_standard_safeguards(text, text) from public;

-- The table report gains "key_locked".
drop function public.security_report();
create function public.security_report()
returns table (
  table_name         text,
  rls_enabled        boolean,
  blocks_delete      boolean,
  audited            boolean,
  has_record_columns boolean,
  key_locked         boolean
)
language sql stable security definer set search_path = '' as $$
  select
    c.relname::text,
    c.relrowsecurity,
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
       and a.attname in ('created_by', 'created_at', 'updated_by', 'updated_at')) = 4,
    exists (select 1 from pg_catalog.pg_trigger t
            join pg_catalog.pg_proc p on p.oid = t.tgfoid
            join pg_catalog.pg_namespace pn on pn.oid = p.pronamespace
            where t.tgrelid = c.oid and pn.nspname = 'private' and p.proname = 'block_key_change')
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
  order by 1
$$;
revoke all on function public.security_report() from public, anon, authenticated;
grant execute on function public.security_report() to service_role;

-- ---------------------------------------------------------------------------
-- Places: switching off and moving.
create or replace function private.check_location_tree() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  expected      text;
  parent_kind   text;
  parent_active boolean;
  switching_off boolean := tg_op = 'UPDATE' and old.active and not new.active;
  moving        boolean := tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id;
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'The kind of location cannot be changed. Deactivate it and add a new one.';
  end if;

  expected := case new.kind
    when 'room' then 'building'
    when 'store_room' then 'room'
    when 'shelf' then 'store_room'
  end;

  if new.parent_id is not null then
    select l.kind, l.active into parent_kind, parent_active from public.locations l where l.id = new.parent_id;
  end if;

  if new.kind = 'building' and new.parent_id is not null then
    raise exception 'A building cannot be inside another location.';
  end if;
  if expected is not null and parent_kind is distinct from expected then
    raise exception 'A % must be inside a %.', replace(new.kind, '_', ' '), replace(expected, '_', ' ');
  end if;

  -- A place that is on must sit inside a place that is on.
  if new.active and new.parent_id is not null and not coalesce(parent_active, false)
     and (tg_op = 'INSERT' or moving or not old.active) then
    raise exception 'The place it is inside is switched off. Pick another one, or switch that place back on first.';
  end if;

  if switching_off or moving then
    -- Anything still in it (or in a place inside it)?
    if exists (
      select 1 from public.items i
      left join public.stock_levels sl on sl.item_id = i.id
      where i.location_id in (select private.location_subtree(new.id))
        and ((i.kind = 'fixed_asset' and i.condition <> 'disposed')
             or (i.kind = 'consumable' and (sl.quantity is null or sl.quantity > 0)))
    ) then
      if moving then
        raise exception 'This place still holds items, which would move without a "Move" entry. Move the items first, or leave the place where it is.';
      end if;
      raise exception 'This place still holds items. Move or dispose of its assets, and count its shelves down to zero, before switching it off.';
    end if;
    -- A stocktake under way in it, or around it?
    if exists (
      select 1 from public.stocktakes s
      where s.status = 'open'
        and (new.id in (select private.location_subtree(s.location_id))
             or s.location_id in (select private.location_subtree(new.id)))
    ) then
      raise exception 'A stocktake of this room is under way. Send it for approval before switching off or moving the place.';
    end if;
  end if;

  if switching_off and exists (select 1 from public.locations c where c.parent_id = new.id and c.active) then
    raise exception 'Switch off the places inside it first.';
  end if;
  return new;
end $$;
revoke all on function private.check_location_tree() from public, anon;
