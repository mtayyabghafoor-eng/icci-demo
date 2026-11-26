-- 0050: Expense claims, their receipts, decisions, repayments and
-- corrections (PLAN.md 5.5; docs/PHASE-5.md sections 6 and 14, slices P5.2
-- to P5.4; owner approved every recommended answer, 25 Nov 2026).
--
--   * expense_claims: one row per claim (EXP-0001, from the id, never
--     reused) or per correction of an approved claim. A row never changes
--     once entered. Who paid is a person from People (not for a direct debit
--     or bank transfer by the Centre).
--   * expense_files: up to 3 receipt files (photos or PDFs) per claim, added
--     in the same step as the claim, never replaced or deleted. "Enter
--     again" points the new claim at the same stored files.
--   * expense_decisions: approved (with the fund), second_approved,
--     rejected (with a reason) or withdrawn (with a reason, by whoever
--     entered it). Never changed. Nobody decides on a claim they entered or
--     money they paid; the second approver is a third person; an approver
--     must be linked to their record in People (question 2A).
--   * A second approval is needed above the "second_approval_cents" amount,
--     and for a lost receipt above "lost_receipt_second_cents". Worked out
--     when the first approval is given, and kept with it.
--   * expense_repayments: paying a person back for one or more approved
--     claims of their own money, in one step, never to yourself. A wrong
--     repayment is withdrawn once, with a reason.
--   * A correction is a new entry pointing at an approved claim, with the
--     right amount, VAT, date, category or fund and a reason, approved by
--     the same rules (the amount rule uses the corrected total).
--   * Everything else (status, the current values, what is still owed) is
--     worked out in two views from these entries; nothing is typed over.
--   * Super Admin, Centre Admin and Finance only. Finance reads the names it
--     needs through three narrow look-ups, never the full lists.

-- ---------------------------------------------------------------------------
-- The receipt store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy expense_receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'expense-receipts' and (select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_receipts_add on storage.objects for insert to authenticated
  with check (bucket_id = 'expense-receipts' and (select private.has_role('super_admin', 'centre_admin', 'finance')));

-- ---------------------------------------------------------------------------
-- Small look-ups the rules need. People cannot be read by Finance, so these
-- look as the database owner and answer one narrow question each.

-- The signed-in account's own (switched-on) person record, if linked.
create function private.my_person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.app_user_id = auth.uid() and p.active
$$;
revoke all on function private.my_person_id() from public, anon;
grant execute on function private.my_person_id() to authenticated, service_role;

-- The admin account linked to a person, if any.
create function private.person_account(p_person uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select p.app_user_id from public.people p where p.id = p_person
$$;
revoke all on function private.person_account(uuid) from public, anon;
grant execute on function private.person_account(uuid) to authenticated, service_role;

create function private.person_is_active(p_person uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.active from public.people p where p.id = p_person), false)
$$;
revoke all on function private.person_is_active(uuid) from public, anon;
grant execute on function private.person_is_active(uuid) to authenticated, service_role;

create function private.expense_file_exists(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'expense-receipts' and o.name = p_path)
$$;
revoke all on function private.expense_file_exists(text) from public, anon;
grant execute on function private.expense_file_exists(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
create table public.expense_claims (
  id                  bigint generated always as identity primary key,
  kind                text not null default 'claim' check (kind in ('claim', 'correction')),
  corrects_id         bigint references public.expense_claims (id),
  copied_from_id      bigint unique references public.expense_claims (id),
  amount_cents        integer not null check (amount_cents between 1 and 100000000),
  vat_cents           integer check (vat_cents >= 0),
  receipt_date        date not null check (receipt_date >= date '2000-01-01'),
  category_id         uuid not null references public.expense_categories (id),
  description         text not null check (length(trim(description)) between 1 and 500),
  paid_to_company_id  uuid references public.companies (id),
  paid_to_text        text check (length(trim(paid_to_text)) between 1 and 200),
  ticket_id           bigint references public.maintenance_tickets (id),
  payment             text not null check (payment in ('centre_direct', 'centre_card', 'personal')),
  paid_by_person_id   uuid references public.people (id),
  suggested_fund_id   uuid references public.expense_funds (id),
  receipt_lost_reason text check (length(trim(receipt_lost_reason)) between 1 and 500),
  correction_reason   text check (length(trim(correction_reason)) between 1 and 500),
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_by          uuid references auth.users (id),
  updated_at          timestamptz not null default now(),
  constraint expense_claims_vat check (vat_cents is null or vat_cents <= amount_cents),
  constraint expense_claims_one_paid_to check (num_nonnulls(paid_to_company_id, paid_to_text) <= 1),
  constraint expense_claims_payer check ((payment = 'centre_direct') = (paid_by_person_id is null)),
  constraint expense_claims_correction check (
    ((kind = 'correction') = (corrects_id is not null)) and ((kind = 'correction') = (correction_reason is not null))
  ),
  constraint expense_claims_copy check (copied_from_id is null or kind = 'claim')
);
call private.add_standard_safeguards('expense_claims', 'id');
create index expense_claims_corrects on public.expense_claims (corrects_id) where corrects_id is not null;
create index expense_claims_ticket on public.expense_claims (ticket_id) where ticket_id is not null;
create index expense_claims_paid_by on public.expense_claims (paid_by_person_id) where paid_by_person_id is not null;
create index expense_claims_receipt_date on public.expense_claims (receipt_date, amount_cents);

-- ---------------------------------------------------------------------------
create table public.expense_files (
  id         bigint generated always as identity primary key,
  claim_id   bigint not null references public.expense_claims (id),
  position   smallint not null check (position between 1 and 3),
  file_path  text not null check (file_path ~ '^[A-Za-z0-9/_.-]+$' and file_path !~ '\.\.'),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  unique (claim_id, position)
);
call private.add_standard_safeguards('expense_files', 'id');

-- ---------------------------------------------------------------------------
create table public.expense_decisions (
  id           bigint generated always as identity primary key,
  claim_id     bigint not null references public.expense_claims (id),
  kind         text not null check (kind in ('approved', 'second_approved', 'rejected', 'withdrawn')),
  fund_id      uuid references public.expense_funds (id),
  note         text check (length(note) <= 1000),
  -- Filled in by the database on the first approval:
  needs_second boolean not null default false,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  unique (claim_id, kind)
);
call private.add_standard_safeguards('expense_decisions', 'id');

-- ---------------------------------------------------------------------------
create table public.expense_repayments (
  id               bigint generated always as identity primary key,
  person_id        uuid not null references public.people (id),
  paid_on          date not null check (paid_on >= date '2000-01-01'),
  method           text not null check (method in ('bank_transfer', 'cash', 'cheque')),
  reference        text check (length(trim(reference)) between 1 and 100),
  withdrawn_reason text check (length(trim(withdrawn_reason)) between 1 and 500),
  withdrawn_by     uuid references auth.users (id),
  withdrawn_at     timestamptz,
  created_by       uuid references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id),
  updated_at       timestamptz not null default now(),
  constraint expense_repayments_withdrawn check (
    (withdrawn_reason is null) = (withdrawn_at is null)
  )
);
call private.add_standard_safeguards('expense_repayments', 'id');
create index expense_repayments_person on public.expense_repayments (person_id);

create table public.expense_repayment_claims (
  id           bigint generated always as identity primary key,
  repayment_id bigint not null references public.expense_repayments (id),
  claim_id     bigint not null references public.expense_claims (id),
  -- What was paid for this claim: filled in by the database.
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  unique (repayment_id, claim_id)
);
call private.add_standard_safeguards('expense_repayment_claims', 'id');
create index expense_repayment_claims_claim on public.expense_repayment_claims (claim_id);

-- Locks one claim row until the end of the step, so two decisions (or a
-- decision and a correction, or two repayments) on it are handled one after
-- the other. Looks as the owner: nobody may update a claim, so the reader's
-- own rights could not lock it.
create function private.lock_expense_claim(p_id bigint) returns void
language sql volatile security definer set search_path = '' as $$
  select null::void from public.expense_claims x where x.id = p_id for update
$$;
revoke all on function private.lock_expense_claim(bigint) from public, anon;
grant execute on function private.lock_expense_claim(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Where a claim or correction stands, from its decisions.
create function private.expense_state(p_id bigint) returns text
language sql stable set search_path = '' as $$
  select case
    when exists (select 1 from public.expense_decisions d where d.claim_id = p_id and d.kind = 'withdrawn') then 'withdrawn'
    when exists (select 1 from public.expense_decisions d where d.claim_id = p_id and d.kind = 'rejected') then 'rejected'
    when exists (select 1 from public.expense_decisions d where d.claim_id = p_id and d.kind = 'second_approved') then 'approved'
    when exists (select 1 from public.expense_decisions d where d.claim_id = p_id and d.kind = 'approved' and not d.needs_second) then 'approved'
    when exists (select 1 from public.expense_decisions d where d.claim_id = p_id and d.kind = 'approved') then 'second'
    else 'waiting'
  end
$$;
revoke all on function private.expense_state(bigint) from public, anon;
grant execute on function private.expense_state(bigint) to authenticated, service_role;

-- Every claim and correction with where it stands and who decided.
create view public.expense_entries with (security_invoker = true) as
select c.*,
  case
    when w.id is not null then 'withdrawn'
    when r.id is not null then 'rejected'
    when a.id is not null and (not a.needs_second or b.id is not null) then 'approved'
    when a.id is not null then 'second'
    else 'waiting'
  end as state,
  a.created_by as first_by,
  a.created_at as first_at,
  a.fund_id as first_fund_id,
  coalesce(a.needs_second, false) as needs_second,
  b.created_by as second_by,
  b.created_at as second_at,
  b.fund_id as second_fund_id,
  coalesce(b.fund_id, a.fund_id) as fund_id,
  case when a.id is not null and (not a.needs_second or b.id is not null) then coalesce(b.created_at, a.created_at) end as approved_at,
  coalesce(w.created_by, r.created_by) as closed_by,
  coalesce(w.created_at, r.created_at) as closed_at,
  coalesce(w.note, r.note) as closed_note
from public.expense_claims c
left join public.expense_decisions a on a.claim_id = c.id and a.kind = 'approved'
left join public.expense_decisions b on b.claim_id = c.id and b.kind = 'second_approved'
left join public.expense_decisions r on r.claim_id = c.id and r.kind = 'rejected'
left join public.expense_decisions w on w.claim_id = c.id and w.kind = 'withdrawn';
revoke all on public.expense_entries from anon;

-- Claims (not corrections) with their current values: those of the latest
-- approved correction, if any. What was repaid, and what is still owed.
create view public.expense_claim_list with (security_invoker = true) as
select e.*,
  k.id as correction_id,
  coalesce(k.amount_cents, e.amount_cents) as current_amount_cents,
  case when k.id is not null then k.vat_cents else e.vat_cents end as current_vat_cents,
  coalesce(k.receipt_date, e.receipt_date) as current_receipt_date,
  coalesce(k.category_id, e.category_id) as current_category_id,
  coalesce(k.fund_id, e.fund_id) as current_fund_id,
  coalesce(p.repaid, 0)::integer as repaid_cents,
  case when e.state = 'approved' and e.payment = 'personal'
    then coalesce(k.amount_cents, e.amount_cents) - coalesce(p.repaid, 0)::integer else 0 end as owed_cents,
  coalesce(f.file_count, 0)::integer as file_count
from public.expense_entries e
left join lateral (
  select x.id, x.amount_cents, x.vat_cents, x.receipt_date, x.category_id, x.fund_id
  from public.expense_entries x
  where x.corrects_id = e.id and x.state = 'approved'
  order by x.approved_at desc, x.id desc
  limit 1
) k on true
left join lateral (
  select sum(l.amount_cents) as repaid
  from public.expense_repayment_claims l
  join public.expense_repayments rp on rp.id = l.repayment_id and rp.withdrawn_reason is null
  where l.claim_id = e.id
) p on true
left join lateral (
  select count(*) as file_count from public.expense_files ef where ef.claim_id = e.id
) f on true
where e.kind = 'claim';
revoke all on public.expense_claim_list from anon;

-- ---------------------------------------------------------------------------
-- The rules for a new claim or correction. Nothing on it ever changes.
create function private.check_expense_claim() returns trigger
language plpgsql set search_path = '' as $$
declare
  orig public.expense_claim_list%rowtype;
  src  public.expense_entries%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A claim never changes once it is entered. Withdraw it and enter it again, or correct it once it is approved.';
  end if;

  new.description := trim(new.description);
  new.paid_to_text := nullif(trim(coalesce(new.paid_to_text, '')), '');
  new.receipt_lost_reason := nullif(trim(coalesce(new.receipt_lost_reason, '')), '');
  new.correction_reason := nullif(trim(coalesce(new.correction_reason, '')), '');

  if new.receipt_date > private.today_in_dublin() then
    raise exception 'The date on the receipt cannot be in the future.';
  end if;
  if new.vat_cents is not null and new.vat_cents > new.amount_cents then
    raise exception 'The VAT cannot be more than the amount.';
  end if;
  if not exists (select 1 from public.expense_categories x where x.id = new.category_id and x.active) then
    raise exception 'That spend category is switched off. Pick another.';
  end if;
  if new.suggested_fund_id is not null
     and not exists (select 1 from public.expense_funds x where x.id = new.suggested_fund_id and x.active) then
    raise exception 'That fund is switched off. Pick another.';
  end if;

  if new.kind = 'correction' then
    if new.corrects_id is null or new.correction_reason is null then
      raise exception 'A correction needs the claim it corrects and a reason.';
    end if;
    -- One correction at a time: lock the claim being corrected.
    perform private.lock_expense_claim(new.corrects_id);
    select * into orig from public.expense_claim_list x where x.id = new.corrects_id;
    if orig.id is null then
      raise exception 'Only a claim can be corrected, not a correction. Correct the claim itself.';
    end if;
    if orig.state <> 'approved' then
      raise exception 'Only an approved claim can be corrected. A waiting claim can be withdrawn and entered again.';
    end if;
    if exists (select 1 from public.expense_entries x where x.corrects_id = new.corrects_id and x.state in ('waiting', 'second')) then
      raise exception 'A correction of this claim is already waiting for a decision. Decide on that one first.';
    end if;
    if new.suggested_fund_id is null then
      raise exception 'Say which fund the corrected claim should come from.';
    end if;
    if new.amount_cents = orig.current_amount_cents
       and new.vat_cents is not distinct from orig.current_vat_cents
       and new.receipt_date = orig.current_receipt_date
       and new.category_id = orig.current_category_id
       and new.suggested_fund_id is not distinct from orig.current_fund_id then
      raise exception 'Nothing is different from the claim as it stands. Change the amount, VAT, date, category or fund.';
    end if;
    -- Who paid, to whom and for what stay as on the claim.
    new.copied_from_id := null;
    new.description := orig.description;
    new.paid_to_company_id := orig.paid_to_company_id;
    new.paid_to_text := orig.paid_to_text;
    new.ticket_id := orig.ticket_id;
    new.payment := orig.payment;
    new.paid_by_person_id := orig.paid_by_person_id;
    new.receipt_lost_reason := orig.receipt_lost_reason;
    return new;
  end if;

  -- A claim.
  if new.paid_by_person_id is not null and not private.person_is_active(new.paid_by_person_id) then
    raise exception 'That person is switched off in People. Pick someone else.';
  end if;
  if new.copied_from_id is not null then
    select * into src from public.expense_entries x where x.id = new.copied_from_id;
    if src.id is null or src.kind <> 'claim' or src.state not in ('withdrawn', 'rejected') then
      raise exception 'Only a withdrawn or rejected claim can be entered again.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_expense_claim() from public, anon;
create trigger check_expense_claim before insert or update on public.expense_claims
  for each row execute function private.check_expense_claim();

-- At the end of the step: a claim has a receipt file, or says why it is lost.
create function private.check_expense_claim_receipt() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'claim' and new.receipt_lost_reason is null
     and not exists (select 1 from public.expense_files f where f.claim_id = new.id) then
    raise exception 'Add a photo or PDF of the receipt, or tick "Receipt lost" and say why.';
  end if;
  return null;
end $$;
revoke all on function private.check_expense_claim_receipt() from public, anon;
create constraint trigger check_expense_claim_receipt after insert on public.expense_claims
  deferrable initially deferred for each row execute function private.check_expense_claim_receipt();

-- ---------------------------------------------------------------------------
-- Receipt files: only in the same step as the claim, by whoever entered it.
create function private.check_expense_file() returns trigger
language plpgsql set search_path = '' as $$
declare
  c public.expense_claims%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'A receipt file never changes.';
  end if;
  select * into c from public.expense_claims x where x.id = new.claim_id;
  if c.id is null or c.kind <> 'claim' then
    raise exception 'Receipts belong to a claim, not a correction.';
  end if;
  if c.created_at <> now() or c.created_by is distinct from auth.uid() then
    raise exception 'Receipts are added when the claim is entered. To change them, withdraw the claim and enter it again.';
  end if;
  if c.receipt_lost_reason is not null then
    raise exception 'This claim says the receipt is lost. Untick "Receipt lost" to add the receipt.';
  end if;
  if not private.expense_file_exists(new.file_path)
     and not exists (select 1 from public.expense_files f where f.claim_id = c.copied_from_id and f.file_path = new.file_path) then
    raise exception 'The receipt file was not found in the store. Please add it again.';
  end if;
  return new;
end $$;
revoke all on function private.check_expense_file() from public, anon;
create trigger check_expense_file before insert or update on public.expense_files
  for each row execute function private.check_expense_file();

-- ---------------------------------------------------------------------------
-- Decisions. The claim is locked first, so two at once cannot both pass.
create function private.check_expense_decision() returns trigger
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
revoke all on function private.check_expense_decision() from public, anon;
create trigger check_expense_decision before insert or update on public.expense_decisions
  for each row execute function private.check_expense_decision();

-- ---------------------------------------------------------------------------
-- Repayments.
create function private.check_expense_repayment() returns trigger
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
  new.withdrawn_by := me;
  new.withdrawn_at := now();
  return new;
end $$;
revoke all on function private.check_expense_repayment() from public, anon;
create trigger check_expense_repayment before insert or update on public.expense_repayments
  for each row execute function private.check_expense_repayment();

create function private.check_expense_repayment_claim() returns trigger
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
  if c.owed_cents <= 0 then
    raise exception 'EXP-% has already been paid back.', lpad(c.id::text, 4, '0');
  end if;
  new.amount_cents := c.owed_cents;
  return new;
end $$;
revoke all on function private.check_expense_repayment_claim() from public, anon;
create trigger check_expense_repayment_claim before insert or update on public.expense_repayment_claims
  for each row execute function private.check_expense_repayment_claim();

create function private.check_expense_repayment_has_claims() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.expense_repayment_claims l where l.repayment_id = new.id) then
    raise exception 'Pick at least one claim to pay back.';
  end if;
  return null;
end $$;
revoke all on function private.check_expense_repayment_has_claims() from public, anon;
create constraint trigger check_expense_repayment_has_claims after insert on public.expense_repayments
  deferrable initially deferred for each row execute function private.check_expense_repayment_has_claims();

-- ---------------------------------------------------------------------------
-- Row-level security.
create policy expense_claims_read on public.expense_claims for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_claims_add on public.expense_claims for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'finance')));

create policy expense_files_read on public.expense_files for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_files_add on public.expense_files for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'finance')));

create policy expense_decisions_read on public.expense_decisions for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_decisions_add on public.expense_decisions for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'finance')));

create policy expense_repayments_read on public.expense_repayments for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_repayments_add on public.expense_repayments for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_repayments_change on public.expense_repayments for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')))
  with check ((select private.has_role('super_admin', 'centre_admin', 'finance')));

create policy expense_repayment_claims_read on public.expense_repayment_claims for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_repayment_claims_add on public.expense_repayment_claims for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin', 'finance')));

-- ---------------------------------------------------------------------------
-- Entering a claim (or a correction) with its receipt files in one step.
-- Runs with the caller's own rights: every rule above still applies.
create function public.enter_expense_claim(
  p_amount_cents        integer,
  p_receipt_date        date,
  p_category_id         uuid,
  p_description         text,
  p_payment             text,
  p_paid_by_person_id   uuid default null,
  p_vat_cents           integer default null,
  p_paid_to_company_id  uuid default null,
  p_paid_to_text        text default null,
  p_ticket_id           bigint default null,
  p_suggested_fund_id   uuid default null,
  p_receipt_lost_reason text default null,
  p_files               text[] default '{}',
  p_copied_from_id      bigint default null,
  p_corrects_id         bigint default null,
  p_correction_reason   text default null
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  new_id bigint;
  i      integer;
begin
  if coalesce(array_length(p_files, 1), 0) > 3 then
    raise exception 'A claim can have at most 3 receipt files.';
  end if;
  insert into public.expense_claims (
    kind, corrects_id, copied_from_id, amount_cents, vat_cents, receipt_date, category_id, description,
    paid_to_company_id, paid_to_text, ticket_id, payment, paid_by_person_id, suggested_fund_id,
    receipt_lost_reason, correction_reason)
  values (
    case when p_corrects_id is null then 'claim' else 'correction' end, p_corrects_id, p_copied_from_id,
    p_amount_cents, p_vat_cents, p_receipt_date, p_category_id,
    case when p_corrects_id is null then p_description else coalesce(p_description, '-') end,
    p_paid_to_company_id, p_paid_to_text, p_ticket_id, p_payment, p_paid_by_person_id, p_suggested_fund_id,
    p_receipt_lost_reason, p_correction_reason)
  returning id into new_id;
  for i in 1 .. coalesce(array_length(p_files, 1), 0) loop
    insert into public.expense_files (claim_id, position, file_path) values (new_id, i, p_files[i]);
  end loop;
  return new_id;
end $$;
revoke all on function public.enter_expense_claim(integer, date, uuid, text, text, uuid, integer, uuid, text, bigint, uuid, text, text[], bigint, bigint, text) from public, anon;
grant execute on function public.enter_expense_claim(integer, date, uuid, text, text, uuid, integer, uuid, text, bigint, uuid, text, text[], bigint, bigint, text) to authenticated, service_role;

-- Paying one person back for several claims, in one step.
create function public.record_expense_repayment(
  p_claim_ids bigint[],
  p_paid_on   date,
  p_method    text,
  p_reference text default null
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  person uuid;
  new_id bigint;
  cid    bigint;
begin
  if coalesce(array_length(p_claim_ids, 1), 0) = 0 then
    raise exception 'Pick at least one claim to pay back.';
  end if;
  select c.paid_by_person_id into person from public.expense_claims c where c.id = p_claim_ids[1];
  if person is null then
    raise exception 'EXP-% was paid by the Centre, so nobody is owed for it.', lpad(p_claim_ids[1]::text, 4, '0');
  end if;
  insert into public.expense_repayments (person_id, paid_on, method, reference)
  values (person, p_paid_on, p_method, p_reference)
  returning id into new_id;
  foreach cid in array p_claim_ids loop
    insert into public.expense_repayment_claims (repayment_id, claim_id, amount_cents) values (new_id, cid, 1);
  end loop;
  return new_id;
end $$;
revoke all on function public.record_expense_repayment(bigint[], date, text, text) from public, anon;
grant execute on function public.record_expense_repayment(bigint[], date, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Narrow look-ups, so Finance can enter and read claims without reading
-- People, Companies or Tickets themselves. Names only.

-- People: everyone switched on, plus anyone already named on a claim or a
-- repayment. "has_account": linked to an admin account (so the screen can
-- warn that they cannot approve their own money). "is_me": the signed-in
-- account's own record.
create function public.expense_people()
returns table (id uuid, full_name text, active boolean, has_account boolean, is_me boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.full_name, p.active, p.app_user_id is not null, p.app_user_id is not distinct from auth.uid() and auth.uid() is not null
  from public.people p
  where private.has_role('super_admin', 'centre_admin', 'finance')
    and (p.active
      or exists (select 1 from public.expense_claims c where c.paid_by_person_id = p.id)
      or exists (select 1 from public.expense_repayments r where r.person_id = p.id))
$$;
revoke all on function public.expense_people() from public, anon;
grant execute on function public.expense_people() to authenticated;

create function public.expense_companies()
returns table (id uuid, name text, active boolean)
language sql stable security definer set search_path = '' as $$
  select co.id, co.name, co.active
  from public.companies co
  where private.has_role('super_admin', 'centre_admin', 'finance')
    and (co.active or exists (select 1 from public.expense_claims c where c.paid_to_company_id = co.id))
$$;
revoke all on function public.expense_companies() from public, anon;
grant execute on function public.expense_companies() to authenticated;

-- Tickets: number, a short description, status and the (information-only)
-- cost, so a claim can say which repair it paid for.
create function public.expense_tickets()
returns table (id bigint, description text, status text, cost_cents integer, closed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select t.id, left(t.description, 120), t.status, t.cost_cents, t.closed_at
  from public.maintenance_tickets t
  where private.has_role('super_admin', 'centre_admin', 'finance')
$$;
revoke all on function public.expense_tickets() from public, anon;
grant execute on function public.expense_tickets() to authenticated;

-- ---------------------------------------------------------------------------
-- Home counters for expenses. "for_me": waiting entries the signed-in admin
-- is allowed to decide (the same rules as above). Runs with the reader's
-- own rights.
create function public.expense_counters()
returns table (for_me integer, waiting integer, owed_people integer, owed_cents bigint, linked boolean)
language plpgsql stable security invoker set search_path = '' as $$
declare
  me     uuid := auth.uid();
  linked boolean := private.my_person_id() is not null;
begin
  if not private.has_role('super_admin', 'centre_admin', 'finance') then
    raise exception 'Only a Super Admin, Centre Admin or Finance can see these counters.' using errcode = '42501';
  end if;
  return query select
    (select count(*)::integer from public.expense_entries e
      where linked and e.state in ('waiting', 'second')
        and e.created_by is distinct from me
        and private.person_account(e.paid_by_person_id) is distinct from me
        and (e.state = 'waiting' or e.first_by is distinct from me)),
    (select count(*)::integer from public.expense_entries e where e.state in ('waiting', 'second')),
    (select count(distinct l.paid_by_person_id)::integer from public.expense_claim_list l where l.owed_cents > 0),
    (select coalesce(sum(l.owed_cents), 0)::bigint from public.expense_claim_list l where l.owed_cents > 0),
    linked;
end $$;
revoke all on function public.expense_counters() from public, anon;
grant execute on function public.expense_counters() to authenticated;
