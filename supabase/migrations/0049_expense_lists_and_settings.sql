-- 0049: The lists and settings expense claims are built on (PLAN.md 5.5;
-- docs/PHASE-5.md, slice P5.1; owner approved every recommended answer,
-- 25 Nov 2026).
--
--   * expense_categories: what the money was spent on. A list that can grow,
--     switched off, never deleted. Starting list: Claude's draft for the
--     bookkeeper to edit (question 4).
--   * expense_funds: Unrestricted, Zakat and Fitra to start (question 5).
--     Whether a fund is restricted is fixed once it is added. The app only
--     tags spending; it never keeps a fund balance (no ledger, PLAN.md 2).
--   * app_settings: one row per setting; only the two amounts for now:
--     a second approver above €500 (question 6), and for a lost receipt
--     above €50 (question 3). Only a Super Admin changes them; no setting
--     can be invented; every change is in the audit log.
--   * Super Admin, Centre Admin and Finance read all three; Super Admin and
--     Finance keep the two lists (section 5 of the plan).
--   * my_expense_link(): "is my account linked to my People record?". An
--     approver must be linked (question 2A), so the screens can say why
--     before anyone tries.
--   * Finance reads the asset register (question 15A) through two narrow
--     look-ups: the register's own columns, and the names of places and
--     categories. Finance still cannot read the items or places tables.

-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 100),
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('expense_categories', 'id');
create unique index expense_categories_unique_name on public.expense_categories (lower(trim(name)));

insert into public.expense_categories (name) values
  ('Repairs and maintenance'), ('Cleaning and hygiene'), ('Utilities'),
  ('Kitchen and catering'), ('Office, printing and post'),
  ('Phones, internet and IT'), ('Equipment and furniture'),
  ('Vehicles and fuel'), ('Events and programmes'), ('Funeral services'),
  ('Books and learning materials'), ('Insurance, licences and fees'),
  ('Professional services'), ('Other');

-- ---------------------------------------------------------------------------
create table public.expense_funds (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 100),
  restricted boolean not null,
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('expense_funds', 'id');
create unique index expense_funds_unique_name on public.expense_funds (lower(trim(name)));

insert into public.expense_funds (name, restricted) values
  ('Unrestricted', false), ('Zakat', true), ('Fitra', true);

-- Names are stored without spaces at either end, and said plainly when
-- already taken (the unique index stays as the final guard). A fund's
-- "restricted" is chosen once: changing it would quietly change what
-- earlier claims meant.
create function private.check_expense_list() returns trigger
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
  if tg_table_name = 'expense_funds' and tg_op = 'UPDATE' then
    if (to_jsonb(new) ->> 'restricted') is distinct from (to_jsonb(old) ->> 'restricted') then
      raise exception 'Whether a fund is restricted cannot be changed once it is added. Add a new fund instead.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.check_expense_list() from public, anon;
create trigger check_expense_list before insert or update on public.expense_categories
  for each row execute function private.check_expense_list();
create trigger check_expense_list before insert or update on public.expense_funds
  for each row execute function private.check_expense_list();

-- ---------------------------------------------------------------------------
create table public.app_settings (
  key          text primary key check (key in ('second_approval_cents', 'lost_receipt_second_cents')),
  amount_cents integer not null check (amount_cents between 0 and 100000000),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);
call private.add_standard_safeguards('app_settings', 'key');

insert into public.app_settings (key, amount_cents) values
  ('second_approval_cents', 50000),
  ('lost_receipt_second_cents', 5000);

-- ---------------------------------------------------------------------------
-- Row-level security.
create policy expense_categories_read on public.expense_categories for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_categories_add on public.expense_categories for insert to authenticated
  with check ((select private.has_role('super_admin', 'finance')));
create policy expense_categories_change on public.expense_categories for update to authenticated
  using ((select private.has_role('super_admin', 'finance')))
  with check ((select private.has_role('super_admin', 'finance')));

create policy expense_funds_read on public.expense_funds for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy expense_funds_add on public.expense_funds for insert to authenticated
  with check ((select private.has_role('super_admin', 'finance')));
create policy expense_funds_change on public.expense_funds for update to authenticated
  using ((select private.has_role('super_admin', 'finance')))
  with check ((select private.has_role('super_admin', 'finance')));

-- No insert rule: the settings are made by migrations only.
create policy app_settings_read on public.app_settings for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin', 'finance')));
create policy app_settings_change on public.app_settings for update to authenticated
  using ((select private.has_role('super_admin')))
  with check ((select private.has_role('super_admin')));
revoke insert on public.app_settings from authenticated, service_role;

-- ---------------------------------------------------------------------------
-- "Is my account linked to my People record?" Only about the signed-in
-- account itself. Finance cannot read People, so this looks as the owner.
create function public.my_expense_link()
returns table (linked boolean, person_name text)
language sql stable security definer set search_path = '' as $$
  select p.id is not null, p.full_name
  from (select 1) one
  left join public.people p on p.app_user_id = auth.uid() and p.active
  where private.has_role('super_admin', 'centre_admin', 'finance')
$$;
revoke all on function public.my_expense_link() from public, anon;
grant execute on function public.my_expense_link() to authenticated;

-- ---------------------------------------------------------------------------
-- The asset register for Finance (and the admins, so there is one way to
-- read it): fixed assets the Centre still has, register columns only. No
-- notes, photos, serial numbers or history. With a place: that place and
-- everything inside it (worked out here, so a big building never needs a
-- long list of places sent from the website).
create function public.asset_register_rows(p_place uuid default null)
returns table (
  id            uuid,
  label_serial  text,
  name          text,
  category_id   uuid,
  location_id   uuid,
  condition     text,
  value_cents   integer,
  purchase_date date,
  warranty_end  date
)
language sql stable security definer set search_path = '' as $$
  with recursive inside as (
    select l.id from public.locations l where l.id = p_place
    union all
    select c.id from public.locations c join inside p on c.parent_id = p.id
  )
  select i.id, i.label_serial, i.name, i.category_id, i.location_id, i.condition,
         i.value_cents, i.purchase_date, i.warranty_end
  from public.items i
  where i.kind = 'fixed_asset' and i.condition <> 'disposed'
    and (p_place is null or i.location_id in (select x.id from inside x))
    and private.has_role('super_admin', 'centre_admin', 'finance')
$$;
revoke all on function public.asset_register_rows(uuid) from public, anon;
grant execute on function public.asset_register_rows(uuid) to authenticated;

-- The names of places and categories, so the register can say where each
-- asset is and how it is filed. Names and the tree only.
create function public.asset_register_names()
returns table (kind text, id uuid, name text, parent_id uuid, place_kind text, active boolean)
language sql stable security definer set search_path = '' as $$
  select 'place', l.id, l.name, l.parent_id, l.kind, l.active
  from public.locations l
  where private.has_role('super_admin', 'centre_admin', 'finance')
  union all
  select 'category', c.id, c.name, c.parent_id, null, c.active
  from public.item_categories c
  where private.has_role('super_admin', 'centre_admin', 'finance')
$$;
revoke all on function public.asset_register_names() from public, anon;
grant execute on function public.asset_register_names() to authenticated;
