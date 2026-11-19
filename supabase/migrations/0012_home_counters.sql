-- 0012: Home page counters (PLAN.md 5.7, slice 9). Owner's choices, 15 Nov 2026:
--   * Only counters whose lists exist today: low stock, and missing or
--     damaged assets. Later phases add theirs.
--   * One "waiting for you" counter per approval queue (stock corrections,
--     disposals, stocktake differences). It counts only entries the signed-in
--     admin is allowed to decide: never their own, never a stocktake they
--     took part in (the same rules the database enforces when deciding).
--   * Finance sees a short note instead (no access to items), so only Super
--     Admin and Centre Admin can ask for the counters.
--
-- Read-only. "security invoker" means the reader's own row-level security
-- rules still apply: this function cannot show anything the lists do not.

create function public.home_counters()
returns table (
  low_stock               integer,
  out_of_stock            integer,
  damaged                 integer,
  missing                 integer,
  corrections_for_me      integer,
  disposals_for_me        integer,
  stocktake_diffs_for_me  integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can see these counters.' using errcode = '42501';
  end if;

  return query select
    (select count(*)::integer from public.stock_levels sl where sl.status in ('low', 'out')),
    (select count(*)::integer from public.stock_levels sl where sl.status = 'out'),
    (select count(*)::integer from public.items i where i.kind = 'fixed_asset' and i.condition = 'damaged'),
    (select count(*)::integer from public.items i where i.kind = 'fixed_asset' and i.condition = 'missing'),
    (select count(*)::integer from public.stock_movements m
      where m.status = 'pending' and m.created_by is distinct from me),
    (select count(*)::integer from public.asset_events e
      where e.status = 'pending' and e.created_by is distinct from me),
    (select count(*)::integer from public.stocktake_differences d
      join public.stocktakes st on st.id = d.stocktake_id
      where d.status = 'pending'
        and st.created_by is distinct from me
        and st.submitted_by is distinct from me
        and d.created_by is distinct from me
        and not exists (select 1 from public.stocktake_scans sc
                        where sc.stocktake_id = st.id and sc.created_by = me));
end $$;

revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;
