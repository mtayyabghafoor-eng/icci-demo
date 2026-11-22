-- 0044: Companies, and makes and models (PLAN.md 5.1, slice P1.19; owner
-- approved 21 Nov 2026, with "a contact person for each category" added the
-- same day).
--
--   * companies: suppliers, installers, service and repair firms, and
--     makers. Name, what they do (one or more), phone, email, website and
--     notes. Switched off, never deleted. Business details only.
--   * product_models: a make and model recorded once ("Demo-Air WX-200",
--     made by a company), with its sub-category, the company that services
--     it, and how long its warranty usually lasts. Its manuals come in P1.20.
--     Every unit of that model just picks it.
--   * Items gain: make and model, the maker's serial number, who supplied it
--     and who services it. All optional. Consumables have none of these
--     except the supplier.
--   * Categories gain: a usual service company (every automatic gate goes to
--     the gate company) and a contact person from the People list, the one
--     staff phone when something in that category breaks (owner's choice:
--     staff cannot log in; a printed call sheet lists these people). A
--     sub-category without one uses its main category's.
--   * Who to call (shown in P1.21): the item's service company, else its
--     model's, else its sub-category's, else its main category's.
--   * Something switched off cannot be newly picked. Only Super Admins and
--     Centre Admins see or change any of this.

-- ---------------------------------------------------------------------------
create table public.companies (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 120),
  kinds      text[] not null default '{}' check (kinds <@ array['supplier', 'installer', 'service', 'maker', 'other']),
  -- The same phone and email rules as the people directory (0017).
  phone      text check (
    phone ~ '^\+?[0-9 ()-]+$'
    and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 20
  ),
  email      text check (length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  website    text check (length(website) <= 200 and website ~* '^https?://[^\s]+$'),
  notes      text check (length(notes) <= 1000),
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('companies', 'id');
create unique index companies_unique_name on public.companies (lower(trim(name)));

-- ---------------------------------------------------------------------------
create table public.product_models (
  id                 uuid primary key default gen_random_uuid(),
  maker_company_id   uuid not null references public.companies (id),
  model_name         text not null check (length(trim(model_name)) between 1 and 120),
  category_id        uuid not null references public.item_categories (id),
  service_company_id uuid references public.companies (id),
  warranty_months    integer check (warranty_months between 1 and 240),
  notes              text check (length(notes) <= 1000),
  active             boolean not null default true,
  created_by         uuid references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_by         uuid references auth.users (id),
  updated_at         timestamptz not null default now()
);
call private.add_standard_safeguards('product_models', 'id');
create unique index product_models_unique_per_maker on public.product_models (maker_company_id, lower(trim(model_name)));
create index product_models_category on public.product_models (category_id);

-- ---------------------------------------------------------------------------
alter table public.items
  add column model_id             uuid references public.product_models (id),
  add column maker_serial         text check (length(trim(maker_serial)) between 1 and 80),
  add column supplier_company_id  uuid references public.companies (id),
  add column service_company_id   uuid references public.companies (id),
  add constraint items_consumable_has_no_model check (
    kind = 'fixed_asset' or (model_id is null and maker_serial is null and service_company_id is null)
  );
create index items_model on public.items (model_id) where model_id is not null;
create index items_supplier on public.items (supplier_company_id) where supplier_company_id is not null;
create index items_service on public.items (service_company_id) where service_company_id is not null;

alter table public.item_categories
  add column service_company_id uuid references public.companies (id),
  add column contact_person_id  uuid references public.people (id);

-- ---------------------------------------------------------------------------
-- Nothing switched off is newly picked. One checker for every table that
-- points at a company, model or person; it looks only at what changed.
create function private.check_picked_active() returns trigger
language plpgsql set search_path = '' as $$
declare
  col  text;
  was  uuid;
  now_ uuid;
  ok   boolean;
begin
  foreach col in array tg_argv loop
    now_ := (to_jsonb(new) ->> col)::uuid;
    was := case when tg_op = 'UPDATE' then (to_jsonb(old) ->> col)::uuid end;
    if now_ is null or now_ is not distinct from was then
      continue;
    end if;
    if col = 'model_id' then
      select m.active into ok from public.product_models m where m.id = now_;
      if not coalesce(ok, false) then
        raise exception 'That make and model is switched off. Pick another one.';
      end if;
    elsif col = 'contact_person_id' then
      select p.active into ok from public.people p where p.id = now_;
      if not coalesce(ok, false) then
        raise exception 'That person is switched off. Pick someone who is switched on.';
      end if;
    else
      select c.active into ok from public.companies c where c.id = now_;
      if not coalesce(ok, false) then
        raise exception 'That company is switched off. Pick another one.';
      end if;
    end if;
  end loop;
  return new;
end $$;
revoke all on function private.check_picked_active() from public, anon;

create trigger check_picked_active before insert or update on public.items
  for each row execute function private.check_picked_active('model_id', 'supplier_company_id', 'service_company_id');
create trigger check_picked_active before insert or update on public.product_models
  for each row execute function private.check_picked_active('maker_company_id', 'service_company_id');
create trigger check_picked_active before insert or update on public.item_categories
  for each row execute function private.check_picked_active('service_company_id', 'contact_person_id');

-- A model belongs to a sub-category, like an item.
create function private.check_model_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.item_categories c where c.id = new.category_id and c.parent_id is not null and c.active) then
    raise exception 'Pick a sub-category that is switched on (for example Heating, cooling and water › Air conditioners).';
  end if;
  return new;
end $$;
revoke all on function private.check_model_category() from public, anon;
create trigger check_model_category before insert or update on public.product_models
  for each row execute function private.check_model_category();

-- ---------------------------------------------------------------------------
-- Row-level security: Super Admin and Centre Admin only, as for items.
create policy companies_read on public.companies for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy companies_add on public.companies for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy companies_change on public.companies for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy product_models_read on public.product_models for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy product_models_add on public.product_models for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy product_models_change on public.product_models for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));
