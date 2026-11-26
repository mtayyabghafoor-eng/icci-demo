-- 0053: security review of Phase 5 (docs/security-review-2026-11-26.md),
-- findings 3 and 4, with the owner's two extras A and B (26 Nov 2026).
--   * Finding 3: whoever entered a claim, or an approved correction of it,
--     cannot record or withdraw its repayment. (Before, a Centre Admin could
--     add a second People record with their own name, claim for it, and
--     pay it back themself once another admin approved it.)
--   * Extra A: a new person with the same name as someone already in People
--     (or a rename to such a name) needs "yes, this is a different person";
--     the answer is kept on the record (same_name_confirmed). The seed and
--     migrations (nobody signed in) are not asked.
--   * Extra B: whoever entered a claim cannot approve or reject a correction
--     of it.
--   * Finding 4: the Board report counts money to get back (a repaid claim
--     later corrected to less) as overpaid_cents and overpaid_people. The
--     screens show it from expense_claim_list.owed_cents below zero.

-- ---------------------------------------------------------------------------
-- Extra A.
alter table public.people add column same_name_confirmed boolean not null default false;

-- Someone else in People with this name (capitals and extra spaces ignored).
-- Looks as the owner, so the check sees everyone.
create function private.person_name_taken(p_name text, p_except uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.people p
    where p.id is distinct from p_except
      and lower(regexp_replace(trim(p.full_name), '\s+', ' ', 'g')) = lower(regexp_replace(trim(p_name), '\s+', ' ', 'g'))
  )
$$;
revoke all on function private.person_name_taken(text, uuid) from public, anon;
grant execute on function private.person_name_taken(text, uuid) to authenticated, service_role;

create function private.check_person_same_name() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.full_name is not distinct from old.full_name then
    -- The answer given when the name was chosen stays as it was.
    new.same_name_confirmed := old.same_name_confirmed;
    return new;
  end if;
  if not private.person_name_taken(new.full_name, new.id) then
    new.same_name_confirmed := false;
    return new;
  end if;
  if auth.uid() is not null and not new.same_name_confirmed then
    raise exception 'There is already a person called "%". Save only if this is a different person: tick "Yes, this is a different person".', trim(new.full_name);
  end if;
  return new;
end $$;
revoke all on function private.check_person_same_name() from public, anon;
create trigger people_same_name before insert or update on public.people
  for each row execute function private.check_person_same_name();

-- ---------------------------------------------------------------------------
-- Extra B (decisions), from 0050 with one rule added.
create or replace function private.check_expense_decision() returns trigger
language plpgsql set search_path = '' as $$
declare
  c          public.expense_claims%rowtype;
  me         uuid := auth.uid();
  st         text;
  payer      uuid;
  first_by   uuid;
  over_cents integer;
  lost_cents integer;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A decision on a claim never changes. If a claim is wrong, correct it with a new entry.';
  end if;
  perform private.lock_expense_claim(new.claim_id);
  select * into c from public.expense_claims x where x.id = new.claim_id;
  if c.id is null then
    raise exception 'This claim could not be found.';
  end if;
  if me is null then
    raise exception 'A claim must be decided by a signed-in admin.';
  end if;
  st := private.expense_state(c.id);
  new.note := nullif(trim(coalesce(new.note, '')), '');
  new.needs_second := false;

  if new.kind = 'withdrawn' then
    if st <> 'waiting' then
      raise exception 'Only a claim still waiting for its first decision can be withdrawn.';
    end if;
    if me is distinct from c.created_by then
      raise exception 'Only the person who entered this claim can withdraw it.';
    end if;
    if new.note is null then
      raise exception 'Say why the claim is being withdrawn.';
    end if;
    new.fund_id := null;
    return new;
  end if;

  if st in ('approved', 'rejected', 'withdrawn') then
    raise exception 'This claim has already been decided (%). Nothing more can be decided on it.', st;
  end if;
  if new.kind = 'approved' and st = 'second' then
    raise exception 'This claim already has its first approval. It now needs a second approver.';
  end if;
  if new.kind = 'second_approved' and st <> 'second' then
    raise exception 'This claim does not need a second approval.';
  end if;
  if me = c.created_by then
    raise exception 'You entered this claim, so a different admin must decide on it. Nobody can approve their own entry.';
  end if;
  -- 0053: nor on a correction of a claim they entered.
  if c.kind = 'correction' and me = (select o.created_by from public.expense_claims o where o.id = c.corrects_id) then
    raise exception 'You entered the claim this corrects, so a different admin must decide on the correction.';
  end if;
  payer := private.person_account(c.paid_by_person_id);
  if payer is not null and me = payer then
    raise exception 'You paid this money yourself, so a different admin must decide on it.';
  end if;
  if private.my_person_id() is null then
    raise exception 'Your account is not linked to your record in People, so you cannot approve or reject expense claims yet. Ask a Super Admin to link it.';
  end if;
  if st = 'second' then
    select d.created_by into first_by from public.expense_decisions d where d.claim_id = c.id and d.kind = 'approved';
    if me = first_by then
      raise exception 'You gave the first approval, so a different admin must give the second.';
    end if;
  end if;

  if new.kind = 'rejected' then
    if new.note is null then
      raise exception 'Rejecting a claim needs a reason.';
    end if;
    new.fund_id := null;
    return new;
  end if;

  if new.kind = 'approved' and new.fund_id is null then
    raise exception 'Choose the fund this money comes from.';
  end if;
  if new.fund_id is not null and not exists (select 1 from public.expense_funds x where x.id = new.fund_id and x.active) then
    raise exception 'That fund is switched off. Choose another.';
  end if;
  if new.kind = 'approved' then
    select s.amount_cents into over_cents from public.app_settings s where s.key = 'second_approval_cents';
    select s.amount_cents into lost_cents from public.app_settings s where s.key = 'lost_receipt_second_cents';
    new.needs_second := c.amount_cents > coalesce(over_cents, 50000)
      or (c.receipt_lost_reason is not null and c.amount_cents > coalesce(lost_cents, 5000));
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Finding 3 (repayments), from 0050 with one rule added to each.
create or replace function private.check_expense_repayment() returns trigger
language plpgsql set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if new.withdrawn_reason is not null or new.withdrawn_at is not null or new.withdrawn_by is not null then
      raise exception 'A new repayment cannot already be withdrawn.';
    end if;
    if new.paid_on > private.today_in_dublin() then
      raise exception 'The repayment date cannot be in the future.';
    end if;
    if me is not null and private.person_account(new.person_id) = me then
      raise exception 'You cannot record a repayment to yourself. Ask another admin.';
    end if;
    new.reference := nullif(trim(coalesce(new.reference, '')), '');
    return new;
  end if;
  -- UPDATE: only withdrawing it, once, with a reason.
  if old.withdrawn_reason is not null then
    raise exception 'This repayment is already withdrawn. Nothing about it can change.';
  end if;
  if new.person_id is distinct from old.person_id or new.paid_on is distinct from old.paid_on
     or new.method is distinct from old.method or new.reference is distinct from old.reference then
    raise exception 'A repayment never changes. If it is wrong, withdraw it with a reason and record the right one.';
  end if;
  new.withdrawn_reason := nullif(trim(coalesce(new.withdrawn_reason, '')), '');
  if new.withdrawn_reason is null then
    raise exception 'Say why the repayment is being withdrawn.';
  end if;
  if me is not null and private.person_account(old.person_id) = me then
    raise exception 'You cannot withdraw a repayment to yourself. Ask another admin.';
  end if;
  -- 0053: nor one for a claim you entered, or whose correction you entered.
  if me is not null and exists (
    select 1 from public.expense_repayment_claims l
    join public.expense_entries e on e.id = l.claim_id or (e.corrects_id = l.claim_id and e.state = 'approved')
    where l.repayment_id = old.id and e.created_by = me
  ) then
    raise exception 'You entered a claim in this repayment, so a different admin must withdraw it.';
  end if;
  new.withdrawn_by := me;
  new.withdrawn_at := now();
  return new;
end $$;

create or replace function private.check_expense_repayment_claim() returns trigger
language plpgsql set search_path = '' as $$
declare
  r public.expense_repayments%rowtype;
  c public.expense_claim_list%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A repayment never changes. If it is wrong, withdraw it with a reason.';
  end if;
  select * into r from public.expense_repayments x where x.id = new.repayment_id;
  if r.id is null or r.created_at <> now() or r.created_by is distinct from auth.uid() or r.withdrawn_reason is not null then
    raise exception 'Claims are added to a repayment when it is recorded, never later.';
  end if;
  perform private.lock_expense_claim(new.claim_id);
  select * into c from public.expense_claim_list x where x.id = new.claim_id;
  if c.id is null then
    raise exception 'Only a claim can be paid back.';
  end if;
  if c.state <> 'approved' then
    raise exception 'EXP-% is not approved, so it cannot be paid back yet.', lpad(c.id::text, 4, '0');
  end if;
  if c.payment <> 'personal' then
    raise exception 'EXP-% was paid by the Centre, so nobody is owed for it.', lpad(c.id::text, 4, '0');
  end if;
  if c.paid_by_person_id <> r.person_id then
    raise exception 'All the claims in one repayment must be for the same person.';
  end if;
  -- 0053: whoever entered the claim, or an approved correction of it, does
  -- not record its repayment (security review 26 Nov 2026, finding 3).
  if c.created_by = auth.uid() then
    raise exception 'You entered EXP-%, so a different admin must record its repayment.', lpad(c.id::text, 4, '0');
  end if;
  if exists (select 1 from public.expense_entries e where e.corrects_id = c.id and e.state = 'approved' and e.created_by = auth.uid()) then
    raise exception 'You entered a correction of EXP-%, so a different admin must record its repayment.', lpad(c.id::text, 4, '0');
  end if;
  if c.owed_cents <= 0 then
    raise exception 'EXP-% has already been paid back.', lpad(c.id::text, 4, '0');
  end if;
  new.amount_cents := c.owed_cents;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Finding 4 (the Board report), from 0051 with two figures added.
create or replace function public.board_report(p_month text)
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
    'overpaid_cents', (select coalesce(-sum(l.owed_cents), 0) from public.expense_claim_list l where l.owed_cents < 0),
    'overpaid_people', (select count(distinct l.paid_by_person_id) from public.expense_claim_list l where l.owed_cents < 0),
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
