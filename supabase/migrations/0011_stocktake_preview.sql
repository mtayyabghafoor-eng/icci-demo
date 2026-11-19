-- 0011: Stocktake preview (slice 8). The "finish" screen shows the
-- differences BEFORE the stocktake is sent, so they must be worked out by the
-- same rule that sending uses. That rule now lives in one place,
-- private.stocktake_findings, used by both stocktake_preview (read only) and
-- submit_stocktake (which saves them).

create function private.stocktake_findings(p_stocktake_id bigint)
returns table (item_id uuid, kind text, expected_location_id uuid, expected_quantity integer, found_quantity integer)
language sql stable security definer set search_path = '' as $$
  with st as (select s.id, s.location_id from public.stocktakes s where s.id = p_stocktake_id),
  latest as (
    select distinct on (sc.item_id) sc.item_id, sc.found_quantity
    from public.stocktake_scans sc
    where sc.stocktake_id = p_stocktake_id and sc.item_id is not null
    order by sc.item_id, sc.id desc
  ),
  area as (select private.location_subtree((select location_id from st)) as id)
  -- Expected here, in use, but not scanned.
  select i.id, 'missing'::text, i.location_id, null::integer, null::integer
  from public.items i
  where i.kind = 'fixed_asset' and i.condition in ('good', 'fair', 'damaged')
    and i.location_id in (select id from area)
    and i.id not in (select l.item_id from latest l)
  union all
  -- Scanned here, but recorded somewhere else.
  select i.id, 'move_here', i.location_id, null, null
  from latest lt join public.items i on i.id = lt.item_id
  where i.kind = 'fixed_asset' and i.condition in ('good', 'fair', 'damaged')
    and i.location_id not in (select id from area)
  union all
  -- A shelf counted at a different number from the stock as it is now.
  select i.id, 'quantity', null, sl.quantity, lt.found_quantity
  from latest lt join public.items i on i.id = lt.item_id
  left join public.stock_levels sl on sl.item_id = i.id
  where i.kind = 'consumable' and sl.quantity is distinct from lt.found_quantity
$$;
revoke all on function private.stocktake_findings(bigint) from public;

-- What sending this stocktake would list. Changes nothing.
create function public.stocktake_preview(p_stocktake_id bigint)
returns table (item_id uuid, kind text, expected_location_id uuid, expected_quantity integer, found_quantity integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can run a stocktake.' using errcode = '42501';
  end if;
  return query select * from private.stocktake_findings(p_stocktake_id);
end $$;
revoke all on function public.stocktake_preview(bigint) from public, anon;
grant execute on function public.stocktake_preview(bigint) to authenticated, service_role;

create or replace function public.submit_stocktake(p_stocktake_id bigint)
returns public.stocktakes
language plpgsql security definer set search_path = '' as $$
declare
  st public.stocktakes;
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can run a stocktake.' using errcode = '42501';
  end if;
  select * into st from public.stocktakes s where s.id = p_stocktake_id for update;
  if st.id is null then
    raise exception 'That stocktake could not be found.';
  end if;
  if st.status <> 'open' then
    raise exception 'This stocktake has already been sent for approval.';
  end if;
  if not exists (select 1 from public.stocktake_scans sc where sc.stocktake_id = st.id) then
    raise exception 'Nothing has been scanned yet. Scan the labels in the room first.';
  end if;

  perform set_config('icci.submitting_stocktake', 'on', true);
  insert into public.stocktake_differences (stocktake_id, item_id, kind, expected_location_id, expected_quantity, found_quantity)
  select st.id, f.item_id, f.kind, f.expected_location_id, f.expected_quantity, f.found_quantity
  from private.stocktake_findings(st.id) f;

  update public.stocktakes s set status = 'submitted', submitted_by = auth.uid(), submitted_at = now()
  where s.id = st.id
  returning * into st;
  perform set_config('icci.submitting_stocktake', 'off', true);
  return st;
end $$;
