-- 0006: Items and labels (PLAN.md 5.1, slice 4).
--
-- Labels: pre-printed serial numbers ICCI-000123. A label can exist before it
-- is attached to an item. Items: a fixed asset (one record each) or a
-- consumable (one record per item per store room or shelf). Stock quantities
-- are NOT stored here: they come from stock movements in slice 5.

-- ---------------------------------------------------------------------------
-- Categories: a starting list that can be added to later.
create table public.item_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('item_categories', 'id');
create unique index item_categories_unique_name on public.item_categories (lower(trim(name)));

insert into public.item_categories (name) values
  ('Furniture'), ('Carpets'), ('Electronics'), ('Sound system'), ('Kitchen'),
  ('Cleaning supplies'), ('Stationery'), ('Tools'), ('Prayer items'), ('Other');

-- ---------------------------------------------------------------------------
-- Labels. The QR code holds only a link containing this number.
create table public.labels (
  serial     text primary key check (serial ~ '^ICCI-[0-9]{6}$'),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('labels', 'serial');

-- ---------------------------------------------------------------------------
-- Items.
create table public.items (
  id            uuid primary key default gen_random_uuid(),
  label_serial  text not null unique references public.labels (serial),
  kind          text not null check (kind in ('fixed_asset', 'consumable')),
  name          text not null check (length(trim(name)) > 0),
  category_id   uuid not null references public.item_categories (id),
  location_id   uuid not null references public.locations (id),
  -- Fixed assets only
  condition     text check (condition in ('good', 'fair', 'damaged', 'missing', 'disposed')),
  value_cents   integer check (value_cents >= 0),
  purchase_date date,
  warranty_end  date,
  -- Consumables only
  unit          text check (length(trim(unit)) > 0),
  minimum_level integer check (minimum_level >= 0),
  -- Both
  photo_path    text check (photo_path ~ '^[A-Za-z0-9/_.-]+$'),
  notes         text,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now(),
  constraint items_fields_match_kind check (
    (kind = 'fixed_asset' and condition is not null and unit is null and minimum_level is null)
    or
    (kind = 'consumable' and condition is null and value_cents is null and purchase_date is null
      and warranty_end is null and unit is not null and minimum_level is not null)
  ),
  constraint items_warranty_after_purchase check (
    purchase_date is null or warranty_end is null or warranty_end >= purchase_date
  )
);
call private.add_standard_safeguards('items', 'id');

create index items_location on public.items (location_id);
create index items_category on public.items (category_id);
create unique index items_consumable_unique_per_place on public.items (location_id, lower(trim(name)))
  where kind = 'consumable';

create function private.check_item() returns trigger
language plpgsql set search_path = '' as $$
declare
  loc_kind   text;
  loc_active boolean;
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind then
      raise exception 'The kind of item cannot be changed.';
    end if;
    if new.label_serial is distinct from old.label_serial then
      raise exception 'The label on an item cannot be changed.';
    end if;
    if new.location_id is distinct from old.location_id then
      raise exception 'An item cannot be moved by editing it. Use "Move" (coming in a later step).';
    end if;
    if new.condition is distinct from old.condition then
      raise exception 'The condition cannot be changed by editing. Use "Report damage" (coming in a later step).';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if exists (select 1 from public.items i where i.label_serial = new.label_serial) then
      raise exception 'This label is already on another item.';
    end if;
    select l.kind, l.active into loc_kind, loc_active from public.locations l where l.id = new.location_id;
    if not coalesce(loc_active, false) then
      raise exception 'That location is switched off. Pick another one.';
    end if;
    if new.kind = 'consumable' and loc_kind not in ('store_room', 'shelf') then
      raise exception 'A consumable must be in a store room or on a shelf.';
    end if;
  end if;

  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.item_categories c where c.id = new.category_id and c.active) then
    raise exception 'That category is switched off. Pick another one.';
  end if;
  return new;
end $$;

create trigger check_item before insert or update on public.items
  for each row execute function private.check_item();

-- ---------------------------------------------------------------------------
-- Row-level security: only super_admin and centre_admin. Finance and the
-- library operator see nothing (PLAN.md 5.1: finance cannot read stock).
create policy item_categories_read on public.item_categories for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy item_categories_add on public.item_categories for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));
create policy item_categories_change on public.item_categories for update to authenticated
  using (private.has_role('super_admin', 'centre_admin'))
  with check (private.has_role('super_admin', 'centre_admin'));

-- Labels can be added but never changed (no update rule at all).
create policy labels_read on public.labels for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy labels_add on public.labels for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));

create policy items_read on public.items for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy items_add on public.items for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));
create policy items_change on public.items for update to authenticated
  using (private.has_role('super_admin', 'centre_admin'))
  with check (private.has_role('super_admin', 'centre_admin'));

-- ---------------------------------------------------------------------------
-- Item history: the audit log entries for ONE item, with the name of who made
-- each change. Centre admins may see this, though not the rest of the audit
-- log (which stays super_admin only).
create function public.item_history(p_item_id uuid)
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
  order by a.changed_at, a.id
$$;

revoke all on function public.item_history(uuid) from public, anon;
grant execute on function public.item_history(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Photos: a private file store. Pictures only, up to 6 MB. Admins can add
-- and view photos; nobody can replace or delete one (a new photo is a new
-- file, and the item points to it).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', false, 6291456, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists item_photos_read on storage.objects;
drop policy if exists item_photos_add on storage.objects;
create policy item_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'item-photos' and private.has_role('super_admin', 'centre_admin'));
create policy item_photos_add on storage.objects for insert to authenticated
  with check (bucket_id = 'item-photos' and private.has_role('super_admin', 'centre_admin'));
