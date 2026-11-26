-- 0057: Round C2, ready for real amounts of data (docs/IMPROVEMENT-PLAN.md
-- section 4, 26 Nov 2026). Nothing about what is stored changes; only how
-- lists and counters are read.
--   * Four lists get a "list order" column, so the database can sort them
--     the way the screen does (worst first) and hand over one page of 50 at
--     a time, instead of every row: tickets, Garda vetting, training and the
--     renewals register. The people directory gets each person's vetting
--     status beside them, for its vetting filter. Each is a plain view on
--     the existing one that applies the reader's own access rules.
--   * Home's counters are worked out in one pass over each list instead of
--     one pass per number (same numbers, fewer reads).
--   * The asset register's totals by place are counted by the database.
--   * An item's history comes newest first, so the newest changes are never
--     the ones left out of a long history.

-- ---------------------------------------------------------------------------
-- Tickets: not closed first (urgent, then normal, then low; open, in
-- progress, waiting; oldest first), then closed ones (most recently closed
-- first). The same order as listOrder in src/lib/tickets/rules.ts.
create view public.maintenance_ticket_list with (security_invoker = true) as
select t.*,
       case when t.status = 'closed' then 1 else 0 end as closed_rank,
       case when t.status = 'closed' then 0
            else case t.priority when 'urgent' then 0 when 'normal' then 1 else 2 end end as priority_rank,
       case t.status when 'open' then 0 when 'in_progress' then 1 when 'waiting' then 2 else 3 end as status_rank,
       case when t.status = 'closed' then -extract(epoch from coalesce(t.closed_at, t.created_at))
            else extract(epoch from t.created_at) end as order_time,
       case when t.status = 'closed' then -t.id else t.id end as order_id
from public.maintenance_tickets t;

-- Garda vetting: expired, none, due, applied, valid, not required; then the
-- soonest expiry (no date last); then the name.
create view public.people_vetting_list with (security_invoker = true) as
select v.*,
       case v.status when 'expired' then 0 when 'none' then 1 when 'due' then 2
                     when 'applied' then 3 when 'valid' then 4 else 5 end as list_rank
from public.people_vetting v;

-- Training: expired, due, valid, no expiry; then the soonest expiry; then the name.
create view public.people_training_list with (security_invoker = true) as
select t.*,
       case t.status when 'expired' then 0 when 'due' then 1 when 'valid' then 2 else 3 end as list_rank
from public.people_training t;

-- Renewals: overdue, no date yet, due, up to date, ended; then the soonest
-- due date; then the title.
create view public.renewals_register_list with (security_invoker = true) as
select r.*,
       case r.status when 'overdue' then 0 when 'none' then 1 when 'due' then 2
                     when 'ok' then 3 else 4 end as list_rank
from public.renewals_register r;

-- The people directory, with each person's vetting status beside them, so
-- the list can be filtered by it and still read one page at a time.
create view public.people_list with (security_invoker = true) as
select p.*, v.status as vetting_status
from public.people p
left join public.people_vetting v on v.person_id = p.id;

revoke all on public.maintenance_ticket_list, public.people_vetting_list, public.people_training_list, public.renewals_register_list, public.people_list
  from public, anon, authenticated;
grant select on public.maintenance_ticket_list, public.people_vetting_list, public.people_training_list, public.renewals_register_list, public.people_list
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home's counters, as in 0033, each list read once.
create or replace function public.home_counters()
returns table (
  low_stock               integer,
  out_of_stock            integer,
  damaged                 integer,
  missing                 integer,
  corrections_for_me      integer,
  disposals_for_me        integer,
  stocktake_diffs_for_me  integer,
  vetting_expired         integer,
  vetting_none            integer,
  vetting_due             integer,
  signoffs_overdue        integer,
  signoffs_unsigned       integer,
  renewals_overdue        integer,
  renewals_due_30         integer,
  rota_today              integer,
  rota_today_unfilled     integer,
  tickets_open            integer,
  tickets_urgent          integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
  today date := private.today_in_dublin();
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can see these counters.' using errcode = '42501';
  end if;

  return query
  with stock as (
    select count(*) filter (where sl.status in ('low', 'out'))::integer as low,
           count(*) filter (where sl.status = 'out')::integer as out_
    from public.stock_levels sl where sl.status in ('low', 'out')
  ), assets as (
    select count(*) filter (where i.condition = 'damaged')::integer as damaged,
           count(*) filter (where i.condition = 'missing')::integer as missing
    from public.items i where i.kind = 'fixed_asset' and i.condition in ('damaged', 'missing')
  ), vetting as (
    select count(*) filter (where pv.status = 'expired')::integer as expired,
           count(*) filter (where pv.status = 'none')::integer as none_,
           count(*) filter (where pv.status = 'due')::integer as due
    from public.people_vetting pv where pv.active and pv.status in ('expired', 'none', 'due')
  ), grid as (
    select count(*) filter (where g.status = 'overdue')::integer as overdue,
           count(*) filter (where g.status = 'unsigned')::integer as unsigned
    from public.policy_grid g where g.status in ('overdue', 'unsigned')
  ), renewals as (
    select count(*) filter (where rr.status = 'overdue')::integer as overdue,
           count(*) filter (where rr.status = 'due' and rr.due_on <= today + 30)::integer as due_30
    from public.renewals_register rr where rr.status in ('overdue', 'due')
  ), rota as (
    select count(*)::integer as today_, count(*) filter (where re.person_id is null)::integer as unfilled
    from public.rota_entries re where re.assignment_date = today
  ), tickets as (
    select count(*)::integer as open_, count(*) filter (where mt.priority = 'urgent')::integer as urgent
    from public.maintenance_tickets mt where mt.status <> 'closed'
  )
  select
    stock.low, stock.out_, assets.damaged, assets.missing,
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
                        where sc.stocktake_id = st.id and sc.created_by = me)),
    vetting.expired, vetting.none_, vetting.due,
    grid.overdue, grid.unsigned,
    renewals.overdue, renewals.due_30,
    rota.today_, rota.unfilled,
    tickets.open_, tickets.urgent
  from stock, assets, vetting, grid, renewals, rota, tickets;
end $$;
revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- An item's history, as in 0006, newest first.
create or replace function public.item_history(p_item_id uuid)
returns table (
  id              bigint,
  action          text,
  changed_at      timestamptz,
  changed_by_name text,
  old_values      jsonb,
  new_values      jsonb
)
language sql stable security definer set search_path = '' as $$
  select a.id, a.action, a.changed_at, coalesce(u.display_name, 'Seed script'), a.old_values, a.new_values
  from public.audit_log a
  left join public.app_users u on u.id = a.changed_by
  where private.has_role('super_admin', 'centre_admin')
    and a.table_name = 'items'
    and a.record_id = p_item_id::text
  order by a.changed_at desc, a.id desc
$$;
revoke all on function public.item_history(uuid) from public, anon;
grant execute on function public.item_history(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The asset register's totals by place (0049's register, counted by the
-- database), so the summary never needs every asset. Same readers as
-- asset_register_rows: Super Admin, Centre Admin and Finance.
create function public.asset_register_totals(p_place uuid default null)
returns table (location_id uuid, assets integer, total_cents bigint, without_value integer)
language sql stable security definer set search_path = '' as $$
  select r.location_id, count(*)::integer, coalesce(sum(r.value_cents), 0)::bigint,
         (count(*) filter (where r.value_cents is null))::integer
  from public.asset_register_rows(p_place) r
  group by r.location_id
$$;
revoke all on function public.asset_register_totals(uuid) from public, anon;
grant execute on function public.asset_register_totals(uuid) to authenticated;
