-- 0052: Two fixes from the Phase 5 security review
-- (docs/security-review-2026-11-26.md, findings 1 and 2; owner said "go",
-- 26 Nov 2026).
--
--   1. The two amounts (second approver above €500, lost receipt above €50)
--      no longer change in one step. A Super Admin asks for a new amount
--      (app_setting_changes); it takes effect only when a DIFFERENT Super
--      Admin confirms it. The person who asked may cancel; another Super
--      Admin may turn it down. One request waits per amount at a time. A
--      request never changes once decided, and is never deleted. Before
--      this, one Super Admin could lift the amount, approve a large claim
--      alone, and put it back.
--   2. A spend category or fund that is used on any claim, correction or
--      approval keeps its name for good (switch it off and add a new one
--      instead), so earlier months' files and reports never change. Before
--      this, renaming "Zakat" would have changed every past file.
--
-- The seed script and the master key (no signed-in person) may still set an
-- amount directly, as with every other rule here.

-- ---------------------------------------------------------------------------
-- 1. Asking for, and confirming, a new amount.
create table public.app_setting_changes (
  id           bigint generated always as identity primary key,
  key          text not null references public.app_settings (key),
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  status       text not null default 'waiting' check (status in ('waiting', 'confirmed', 'turned_down', 'cancelled')),
  note         text check (length(note) <= 500),
  decided_by   uuid references auth.users (id),
  decided_at   timestamptz,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  constraint app_setting_changes_decided check ((status = 'waiting') = (decided_at is null))
);
call private.add_standard_safeguards('app_setting_changes', 'id');
create unique index app_setting_changes_one_waiting on public.app_setting_changes (key) where status = 'waiting';

create function private.check_app_setting_change() returns trigger
language plpgsql set search_path = '' as $$
declare
  me      uuid := auth.uid();
  current integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'waiting' or new.decided_by is not null or new.decided_at is not null then
      raise exception 'A new request for an amount starts as waiting for a second Super Admin.';
    end if;
    select s.amount_cents into current from public.app_settings s where s.key = new.key;
    if current is not distinct from new.amount_cents then
      raise exception 'The amount is already %. Type a different amount.', to_char(new.amount_cents / 100.0, 'FM999G999G990D00');
    end if;
    if exists (select 1 from public.app_setting_changes c where c.key = new.key and c.status = 'waiting') then
      raise exception 'A change to this amount is already waiting for a second Super Admin. Confirm, turn down or cancel that one first.';
    end if;
    new.note := nullif(trim(coalesce(new.note, '')), '');
    return new;
  end if;

  -- UPDATE: only the decision, once.
  if old.status <> 'waiting' then
    raise exception 'This request has already been decided (%). It never changes again.', replace(old.status, '_', ' ');
  end if;
  if new.key is distinct from old.key or new.amount_cents is distinct from old.amount_cents then
    raise exception 'A request for an amount never changes. Cancel it and ask again.';
  end if;
  if new.status = 'waiting' then
    raise exception 'Choose to confirm, turn down or cancel the request.';
  end if;
  if new.status = 'cancelled' then
    if me is distinct from old.created_by then
      raise exception 'Only the person who asked for this change can cancel it. Another Super Admin can turn it down instead.';
    end if;
  else
    if me is not null and me = old.created_by then
      raise exception 'You asked for this change, so a different Super Admin must confirm or turn it down. Nobody can approve their own entry.';
    end if;
  end if;
  new.note := nullif(trim(coalesce(new.note, '')), '');
  new.decided_by := me;
  new.decided_at := now();
  return new;
end $$;
revoke all on function private.check_app_setting_change() from public, anon;
create trigger check_app_setting_change before insert or update on public.app_setting_changes
  for each row execute function private.check_app_setting_change();

-- On confirming, the new amount takes effect in the same step.
create function private.apply_app_setting_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'confirmed' and old.status = 'waiting' then
    update public.app_settings set amount_cents = new.amount_cents where key = new.key;
  end if;
  return null;
end $$;
revoke all on function private.apply_app_setting_change() from public, anon;
create trigger apply_app_setting_change after update on public.app_setting_changes
  for each row execute function private.apply_app_setting_change();

-- An amount changes only through a request confirmed in this same step
-- (or from the seed script or a migration, with nobody signed in).
create function private.check_app_setting() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.amount_cents is distinct from old.amount_cents and auth.uid() is not null
     and not exists (select 1 from public.app_setting_changes c
                     where c.key = new.key and c.status = 'confirmed'
                       and c.amount_cents = new.amount_cents and c.decided_at = now()) then
    raise exception 'An amount changes only when a second Super Admin confirms the request. Ask for the change on Expense settings.';
  end if;
  return new;
end $$;
revoke all on function private.check_app_setting() from public, anon;
create trigger check_app_setting before update on public.app_settings
  for each row execute function private.check_app_setting();

-- Nobody signed in updates app_settings directly any more.
drop policy app_settings_change on public.app_settings;
revoke update on public.app_settings from authenticated;

create policy app_setting_changes_read on public.app_setting_changes for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy app_setting_changes_add on public.app_setting_changes for insert to authenticated
  with check ((select private.has_role('super_admin')));
create policy app_setting_changes_decide on public.app_setting_changes for update to authenticated
  using ((select private.has_role('super_admin')))
  with check ((select private.has_role('super_admin')));

-- ---------------------------------------------------------------------------
-- 2. A used name is locked.
create function private.expense_list_entry_used(p_table text, p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_table
    when 'expense_categories' then exists (select 1 from public.expense_claims c where c.category_id = p_id)
    when 'expense_funds' then exists (select 1 from public.expense_claims c where c.suggested_fund_id = p_id)
                           or exists (select 1 from public.expense_decisions d where d.fund_id = p_id)
    else false
  end
$$;
revoke all on function private.expense_list_entry_used(text, uuid) from public, anon;
grant execute on function private.expense_list_entry_used(text, uuid) to authenticated, service_role;

create or replace function private.check_expense_list() returns trigger
language plpgsql set search_path = '' as $$
declare
  taken boolean;
begin
  new.name := trim(new.name);
  execute format('select exists (select 1 from public.%I x where lower(trim(x.name)) = lower($1) and x.id <> $2)', tg_table_name)
    into taken using new.name, new.id;
  if taken then
    if tg_table_name = 'expense_funds' then
      raise exception 'A fund called "%" already exists.', new.name;
    end if;
    raise exception 'A category called "%" already exists.', new.name;
  end if;
  if tg_op = 'UPDATE' then
    if tg_table_name = 'expense_funds'
       and (to_jsonb(new) ->> 'restricted') is distinct from (to_jsonb(old) ->> 'restricted') then
      raise exception 'Whether a fund is restricted cannot be changed once it is added. Add a new fund instead.';
    end if;
    if new.name is distinct from old.name and private.expense_list_entry_used(tg_table_name, old.id) then
      raise exception '"%" is already used on claims, so its name cannot change (earlier months must stay as they were). To use a new name, switch it off and add a new one.', old.name;
    end if;
  end if;
  return new;
end $$;

-- Which entries are in use, so the screen can offer "Rename" only where it
-- is still allowed. The same three roles that read the lists.
create function public.expense_list_entries_used()
returns table (id uuid)
language sql stable security definer set search_path = '' as $$
  select x.id from public.expense_categories x
  where private.has_role('super_admin', 'centre_admin', 'finance') and private.expense_list_entry_used('expense_categories', x.id)
  union all
  select x.id from public.expense_funds x
  where private.has_role('super_admin', 'centre_admin', 'finance') and private.expense_list_entry_used('expense_funds', x.id)
$$;
revoke all on function public.expense_list_entries_used() from public, anon;
grant execute on function public.expense_list_entries_used() to authenticated;
