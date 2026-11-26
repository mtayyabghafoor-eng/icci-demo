-- 0051: The monthly Board report (PLAN.md 5.5; docs/PHASE-5.md section 8,
-- slice P5.6; owner approved every recommended answer, 25 Nov 2026).
--
--   * board_report(month): counts and totals only, never a person's name.
--     Two parts: "During" the month (by when the database recorded each
--     thing, in Irish time) and "As at" the moment it is asked.
--   * Spend is what was approved in the month: claims, plus corrections as
--     the new line in and the old line out, the same as the monthly file.
--     Ticket costs are never counted (they are information only).
--   * board_report_copies: "Make the final copy" freezes the numbers once
--     the month is over. Making it again keeps both copies. Nobody may add
--     a copy directly (not even the master key): only the database makes
--     one, from the same function, so its numbers cannot be typed in. It
--     never changes and is never deleted.
--   * Super Admin, Centre Admin and Finance. Finance sees counts only, as
--     everywhere: the function reads as the database owner but gives back
--     numbers, never rows.

create table public.board_report_copies (
  id         bigint generated always as identity primary key,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  report     jsonb not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('board_report_copies', 'id');
create index board_report_copies_month on public.board_report_copies (month, id desc);

create function private.check_board_report_copy() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'A final copy of a Board report never changes. Make a new copy instead; both are kept.';
  end if;
  return new;
end $$;
revoke all on function private.check_board_report_copy() from public, anon;
create trigger check_board_report_copy before insert or update on public.board_report_copies
  for each row execute function private.check_board_report_copy();

create policy board_report_copies_read on public.board_report_copies for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
-- No insert or update rule: copies are made only by make_board_report_copy() below.
revoke insert, update on public.board_report_copies from authenticated, service_role;

-- ---------------------------------------------------------------------------
create function public.board_report(p_month text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  d0     date;
  t0     timestamptz;
  t1     timestamptz;
  today  date := private.today_in_dublin();
  during jsonb;
  as_at  jsonb;
begin
  if not private.has_role('super_admin', 'centre_admin', 'finance') then
    raise exception 'Only a Super Admin, Centre Admin or Finance can see the Board report.' using errcode = '42501';
  end if;
  if p_month is null or p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Choose a month, for example 2026-11.';
  end if;
  d0 := (p_month || '-01')::date;
  t0 := d0::timestamp at time zone 'Europe/Dublin';
  t1 := (d0 + interval '1 month')::timestamp at time zone 'Europe/Dublin';

  with e as (
    select * from public.expense_entries x where x.state = 'approved'
  ),
  claims_m as (
    select * from e where e.kind = 'claim' and e.approved_at >= t0 and e.approved_at < t1
  ),
  corr_m as (
    select c.category_id, c.fund_id, c.amount_cents, prev.category_id as old_category, prev.fund_id as old_fund, prev.amount_cents as old_amount
    from e c
    cross join lateral (
      select x.category_id, x.fund_id, x.amount_cents
      from e x
      where x.id = c.corrects_id
         or (x.corrects_id = c.corrects_id and (x.approved_at < c.approved_at or (x.approved_at = c.approved_at and x.id < c.id)))
      order by (x.kind = 'correction') desc, x.approved_at desc, x.id desc
      limit 1
    ) prev
    where c.kind = 'correction' and c.approved_at >= t0 and c.approved_at < t1
  ),
  lines as (
    select category_id, fund_id, amount_cents from claims_m
    union all select category_id, fund_id, amount_cents from corr_m
    union all select old_category, old_fund, -old_amount from corr_m
  ),
  rep as (
    select r.id, r.created_at, r.withdrawn_at, coalesce((select sum(l.amount_cents) from public.expense_repayment_claims l where l.repayment_id = r.id), 0) as total
    from public.expense_repayments r
  ),
  disposals as (
    select ev.disposal_route, ev.sale_price_cents
    from public.asset_events ev
    where ev.kind = 'disposal' and ev.status = 'approved' and ev.decided_at >= t0 and ev.decided_at < t1
  )
  select jsonb_build_object(
    'spend_cents', (select coalesce(sum(amount_cents), 0) from lines),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'cents', g.cents) order by g.cents desc, g.name), '[]'::jsonb)
                    from (select ec.name, sum(l.amount_cents) as cents from lines l join public.expense_categories ec on ec.id = l.category_id
                          group by ec.name having sum(l.amount_cents) <> 0) g),
    'by_fund', (select coalesce(jsonb_agg(jsonb_build_object('name', g.name, 'restricted', g.restricted, 'cents', g.cents) order by g.restricted, g.name), '[]'::jsonb)
                from (select ef.name, ef.restricted, sum(l.amount_cents) as cents from lines l join public.expense_funds ef on ef.id = l.fund_id
                      group by ef.name, ef.restricted having sum(l.amount_cents) <> 0) g),
    'claims_approved', (select count(*) from claims_m),
    'corrections_approved', (select count(*) from corr_m),
    'no_receipt', (select jsonb_build_object('count', count(*), 'cents', coalesce(sum(amount_cents), 0)) from claims_m where receipt_lost_reason is not null),
    'over_amount', (select jsonb_build_object('count', count(*), 'cents', coalesce(sum(amount_cents), 0)) from claims_m where needs_second),
    'repaid', (select jsonb_build_object('count', count(*), 'cents', coalesce(sum(total), 0)) from rep where created_at >= t0 and created_at < t1),
    'repaid_withdrawn', (select jsonb_build_object('count', count(*), 'cents', coalesce(sum(total), 0)) from rep where withdrawn_at >= t0 and withdrawn_at < t1),
    'tickets_opened', (select count(*) from public.maintenance_tickets t where t.created_at >= t0 and t.created_at < t1),
    'tickets_closed', (select count(*) from public.maintenance_tickets t where t.closed_at >= t0 and t.closed_at < t1),
    'items_registered', (select count(*) from public.items i where i.created_at >= t0 and i.created_at < t1),
    'disposals', (select count(*) from disposals),
    'disposals_by_route', (select coalesce(jsonb_agg(jsonb_build_object('route', g.route, 'count', g.n) order by g.n desc, g.route), '[]'::jsonb)
                           from (select coalesce(disposal_route, 'not_recorded') as route, count(*) as n from disposals group by 1) g),
    'sold_cents', (select coalesce(sum(sale_price_cents), 0) from disposals),
    'stocktakes_finished', (select count(*) from public.stocktakes st where st.submitted_at >= t0 and st.submitted_at < t1),
    'loans', (select count(*) from public.library_loans ll where ll.created_at >= t0 and ll.created_at < t1),
    'returns', (select count(*) from public.library_loan_entries le where le.kind = 'returned' and le.created_at >= t0 and le.created_at < t1),
    'copies_added', (select count(*) from public.library_copies lc where lc.created_at >= t0 and lc.created_at < t1),
    'copies_lost', (select count(*) from public.library_copy_entries ce where ce.kind = 'lost' and ce.created_at >= t0 and ce.created_at < t1)
  ) into during;

  select jsonb_build_object(
    'claims_waiting', (select count(*) from public.expense_entries x where x.state in ('waiting', 'second')),
    'waiting_from_month', (select count(*) from public.expense_entries x
                           where x.kind = 'claim' and x.state in ('waiting', 'second')
                             and x.receipt_date >= d0 and x.receipt_date < (d0 + interval '1 month')::date),
    'owed_cents', (select coalesce(sum(l.owed_cents), 0) from public.expense_claim_list l where l.owed_cents > 0),
    'owed_people', (select count(distinct l.paid_by_person_id) from public.expense_claim_list l where l.owed_cents > 0),
    'assets_good', (select count(*) from public.items i where i.kind = 'fixed_asset' and i.condition = 'good'),
    'assets_fair', (select count(*) from public.items i where i.kind = 'fixed_asset' and i.condition = 'fair'),
    'assets_damaged', (select count(*) from public.items i where i.kind = 'fixed_asset' and i.condition = 'damaged'),
    'assets_missing', (select count(*) from public.items i where i.kind = 'fixed_asset' and i.condition = 'missing'),
    'assets_value_cents', (select coalesce(sum(i.value_cents), 0) from public.items i where i.kind = 'fixed_asset' and i.condition <> 'disposed'),
    'stock_low', (select count(*) from public.stock_levels sl where sl.status = 'low'),
    'stock_out', (select count(*) from public.stock_levels sl where sl.status = 'out'),
    'tickets_open', (select count(*) from public.maintenance_tickets t where t.status <> 'closed'),
    'tickets_urgent', (select count(*) from public.maintenance_tickets t where t.status <> 'closed' and t.priority = 'urgent'),
    'vetting_valid', (select count(*) from public.people_vetting pv where pv.active and pv.status = 'valid'),
    'vetting_due', (select count(*) from public.people_vetting pv where pv.active and pv.status = 'due'),
    'vetting_expired', (select count(*) from public.people_vetting pv where pv.active and pv.status = 'expired'),
    'vetting_none', (select count(*) from public.people_vetting pv where pv.active and pv.status = 'none'),
    'training_expired', (select count(*) from public.people_training pt where pt.active and pt.status = 'expired'),
    'signoffs_unsigned', (select count(*) from public.policy_grid g where g.status = 'unsigned'),
    'signoffs_overdue', (select count(*) from public.policy_grid g where g.status = 'overdue'),
    'renewals_overdue', (select count(*) from public.renewals_register rr where rr.status = 'overdue'),
    'renewals_due_30', (select count(*) from public.renewals_register rr where rr.status = 'due' and rr.due_on <= today + 30),
    'books_overdue', (select count(*) from public.library_copy_list s where s.status = 'overdue')
  ) into as_at;

  return jsonb_build_object('month', p_month, 'made_at', now(), 'during', during, 'as_at', as_at);
end $$;
revoke all on function public.board_report(text) from public, anon;
grant execute on function public.board_report(text) to authenticated;

-- "Make the final copy": only for a month that is over. The numbers come
-- from board_report() itself, so they cannot be typed in.
create function public.make_board_report_copy(p_month text)
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  new_id bigint;
  r      jsonb;
begin
  if not private.has_role('super_admin', 'centre_admin', 'finance') then
    raise exception 'Only a Super Admin, Centre Admin or Finance can make a final copy.' using errcode = '42501';
  end if;
  r := public.board_report(p_month);
  if (p_month || '-01')::date + interval '1 month' > private.today_in_dublin() then
    raise exception 'The month is not over yet. A final copy can be made from the first day of the next month.';
  end if;
  insert into public.board_report_copies (month, report) values (p_month, r) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.make_board_report_copy(text) from public, anon;
grant execute on function public.make_board_report_copy(text) to authenticated;
