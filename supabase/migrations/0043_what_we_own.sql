-- 0043: "What we own" (PLAN.md 5.1, slice P1.18; owner approved 21 Nov 2026).
--
--   * category_counts(place): for each sub-category, how many fixed assets
--     the Centre has (disposed left out), how many work (Good or Fair, the
--     owner's choice), how many do not (Damaged), how many are Missing, and
--     how many have a maintenance ticket not yet closed; for supplies, how
--     many stock lines and how many are low or out. With a place, only what
--     is in that place or anywhere inside it. Main categories are the sum of
--     their sub-categories (added up on screen).
--   * Worked out by the database with the signed-in admin's own rights, so
--     the access rules apply: Finance, the Library Operator and signed-out
--     visitors get nothing.
--   * The "Not seen in 12 months" view also gives each asset's category, so
--     that list can be filtered by category.

create function public.category_counts(p_place uuid default null)
returns table (
  category_id       uuid,
  total             integer,
  working           integer,
  not_working       integer,
  missing           integer,
  with_open_tickets integer,
  stock_lines       integer,
  stock_low         integer,
  stock_out         integer
)
language sql stable security invoker set search_path = '' as $$
  with recursive inside as (
    select l.id from public.locations l where l.id = p_place
    union all
    select c.id from public.locations c join inside p on c.parent_id = p.id
  ),
  scope as (
    select i.id, i.kind, i.condition, i.category_id
    from public.items i
    where (p_place is null or i.location_id in (select id from inside))
      and (i.condition is null or i.condition <> 'disposed')
  )
  select
    s.category_id,
    (count(*) filter (where s.kind = 'fixed_asset'))::integer,
    (count(*) filter (where s.condition in ('good', 'fair')))::integer,
    (count(*) filter (where s.condition = 'damaged'))::integer,
    (count(*) filter (where s.condition = 'missing'))::integer,
    (count(*) filter (where s.kind = 'fixed_asset' and exists (
      select 1 from public.maintenance_tickets t where t.item_id = s.id and t.status <> 'closed'
    )))::integer,
    (count(*) filter (where s.kind = 'consumable'))::integer,
    (count(*) filter (where sl.status = 'low'))::integer,
    (count(*) filter (where sl.status = 'out'))::integer
  from scope s
  left join public.stock_levels sl on sl.item_id = s.id
  group by s.category_id
$$;
revoke all on function public.category_counts(uuid) from public, anon;
grant execute on function public.category_counts(uuid) to authenticated;

-- "Not seen in 12 months": the same view as 0016, plus the category.
create or replace view public.asset_last_seen with (security_invoker = true) as
select
  i.id         as item_id,
  s.seen_at    as last_seen_at,
  s.how        as last_seen_how,
  i.label_serial,
  i.name,
  i.location_id,
  i.condition,
  i.value_cents,
  i.category_id
from public.items i
cross join lateral (
  select x.seen_at, x.how
  from (
    select i.created_at as seen_at, 'registered'::text as how
    union all
    select e.created_at, e.kind
    from public.asset_events e
    where e.item_id = i.id and e.kind in ('move', 'damage', 'back_in_use')
    union all
    select sc.created_at, 'stocktake_scan'
    from public.stocktake_scans sc
    where sc.item_id = i.id
  ) x
  order by x.seen_at desc
  limit 1
) s
where i.kind = 'fixed_asset' and i.condition <> 'disposed';
