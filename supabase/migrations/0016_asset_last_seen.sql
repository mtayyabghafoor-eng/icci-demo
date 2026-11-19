-- 0016: When each fixed asset was last seen (PLAN.md 5.1, "not seen in 12
-- months" list). Owner's choices, 15 Nov 2026:
--   * "Seen" means a hands-on event: registered, moved, reported damaged,
--     marked repaired or found, or its label scanned in a stocktake.
--     Not seen: opening its page, editing its details at a desk, a "missing"
--     report, or a disposal request.
--   * Disposed assets and consumables are left out.
--   * Super Admin and Centre Admin only: the reader's own access rules apply
--     ("security invoker"), so Finance and the Library Operator see nothing,
--     the same as for items.
--
-- Worked out every time it is read, never stored, so it cannot be typed over.
-- Read-only: a view with a "latest of" search cannot be written to.

create view public.asset_last_seen with (security_invoker = true) as
select
  i.id         as item_id,
  s.seen_at    as last_seen_at,
  s.how        as last_seen_how,
  -- What the list shows and searches on, so it needs only this view.
  i.label_serial,
  i.name,
  i.location_id,
  i.condition,
  i.value_cents
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

revoke all on public.asset_last_seen from public, anon, authenticated, service_role;
grant select on public.asset_last_seen to authenticated, service_role;

-- So "the latest scan of this asset" is quick to find.
create index stocktake_scans_item on public.stocktake_scans (item_id, created_at) where item_id is not null;
