-- 0041: Categories in two levels (PLAN.md 5.1, slice P1.17; owner approved
-- 21 Nov 2026 after the Clonskeagh visit).
--
--   * About nine main categories (Furniture and furnishings, Electronics, IT
--     and sound, ...), each with sub-categories (Chairs, Lawnmowers, Air
--     conditioners, ...) and an "Other ..." sub-category, plus a main
--     category "Other". The starting list is Claude's draft for the owner to
--     edit; admins add, rename, move and switch off categories on a screen.
--   * Only two levels: a main category is inside nothing; a sub-category is
--     inside a main category. A category never changes level.
--   * An item sits in a sub-category only, never directly in a main one.
--   * Today's eleven categories keep their record numbers, so no item is
--     lost or changed: each becomes a sub-category of its new main category
--     (Furniture becomes "Other furniture", Carpets "Carpets and rugs", ...).
--   * Names stay unique across the whole list (index from 0006), so a name
--     always means one category.
--   * Nothing is ever deleted (0001 and 0015 safeguards already cover this
--     table), and the access rules are unchanged: Super Admin and Centre
--     Admin only.

alter table public.item_categories add column parent_id uuid references public.item_categories (id);
create index item_categories_parent on public.item_categories (parent_id);

-- ---------------------------------------------------------------------------
-- The shape of the tree, and switching off.
create function private.check_category_tree() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent public.item_categories%rowtype;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A category cannot be inside itself.';
    end if;
    select * into parent from public.item_categories c where c.id = new.parent_id;
    if parent.id is null or parent.parent_id is not null then
      raise exception 'A sub-category must be inside a main category.';
    end if;
  end if;

  if tg_op = 'UPDATE' and (old.parent_id is null) <> (new.parent_id is null) then
    raise exception 'A main category cannot become a sub-category, or the other way round. Add a new one instead.';
  end if;

  -- Nothing new inside a switched-off main category, and a sub-category
  -- there cannot be switched back on.
  if new.parent_id is not null and new.active and not parent.active
     and (tg_op = 'INSERT' or not old.active or new.parent_id is distinct from old.parent_id) then
    raise exception 'That main category is switched off. Switch it back on first.';
  end if;

  -- A main category is switched off only once its sub-categories are.
  if tg_op = 'UPDATE' and new.parent_id is null and old.active and not new.active
     and exists (select 1 from public.item_categories c where c.parent_id = new.id and c.active) then
    raise exception 'Switch off its sub-categories first.';
  end if;
  return new;
end $$;
revoke all on function private.check_category_tree() from public, anon;

-- The trigger itself is switched on at the end, after the starting list
-- below has moved today's categories in (which changes their level once).

-- ---------------------------------------------------------------------------
-- Items sit in a sub-category only. A separate check, so the long item check
-- from 0014 stays as it is. Because a sub-category can never become a main
-- category, an item already in a sub-category stays in one.
create function private.check_item_in_sub_category() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.item_categories c where c.id = new.category_id and c.parent_id is not null) then
    raise exception 'Pick a sub-category (for example Furniture and furnishings › Chairs), not a main category.';
  end if;
  return new;
end $$;
revoke all on function private.check_item_in_sub_category() from public, anon;

create trigger check_item_in_sub_category before insert or update on public.items
  for each row execute function private.check_item_in_sub_category();

-- ---------------------------------------------------------------------------
-- The starting list.
do $$
declare
  m record;
  main_id uuid;
  other_id uuid;
  sub text;
begin
  -- 1. Today's categories get their new names first (the new main category
  --    "Vehicles" needs its name free). Their record numbers do not change.
  update public.item_categories set name = 'Other furniture' where lower(name) = 'furniture';
  update public.item_categories set name = 'Carpets and rugs' where lower(name) = 'carpets';
  update public.item_categories set name = 'Other electronics' where lower(name) = 'electronics';
  update public.item_categories set name = 'Other kitchen equipment' where lower(name) = 'kitchen';
  update public.item_categories set name = 'Other tools and equipment' where lower(name) = 'tools';
  update public.item_categories set name = 'Other prayer items' where lower(name) = 'prayer items';
  update public.item_categories set name = 'Cars and vans' where lower(name) = 'vehicles';
  update public.item_categories set name = 'Other items' where lower(name) = 'other';

  -- 2. The main categories, each with its sub-categories. A sub-category
  --    that already exists (one of today's) is moved in; the rest are added.
  for m in
    select * from (values
      (1, 'Furniture and furnishings', array['Chairs', 'Tables', 'Shelving and cupboards', 'Carpets and rugs',
        'Curtains and blinds', 'Beds and bedroom furniture', 'Other furniture']),
      (2, 'Electronics, IT and sound', array['Computers and laptops', 'Printers and copiers', 'Network and Wi-Fi',
        'Phones', 'TVs and screens', 'Projectors', 'Sound system', 'Prayer-time displays', 'Other electronics']),
      (3, 'Heating, cooling and water', array['Air conditioners', 'Heaters and radiators', 'Boilers', 'Water heaters',
        'Fans and ventilation', 'Wudu (ablution) fittings', 'Other heating and cooling']),
      (4, 'Building systems and security', array['Automatic gates and barriers', 'Doors and shutters', 'Lifts',
        'Lighting and emergency lighting', 'Generators and power', 'Fire alarms and extinguishers', 'CCTV',
        'Access control and intercoms', 'Defibrillators and first aid', 'Other building systems']),
      (5, 'Kitchen and catering', array['Cookers and ovens', 'Fridges and freezers', 'Dishwashers',
        'Urns and water boilers', 'Other kitchen equipment']),
      (6, 'Garden, tools and cleaning equipment', array['Lawnmowers', 'Strimmers and hedge cutters', 'Leaf blowers',
        'Power tools', 'Hand tools', 'Ladders', 'Floor cleaning machines', 'Vacuum cleaners', 'Other tools and equipment']),
      (7, 'Vehicles', array['Cars and vans', 'Minibuses and buses', 'Other vehicles']),
      (8, 'Prayer and funeral items', array['Quran stands', 'Prayer mats', 'Funeral (janazah and ghusl) equipment',
        'Other prayer items']),
      (9, 'Supplies (used up)', array['Cleaning supplies', 'Stationery', 'Kitchen supplies', 'Toiletries',
        'Bulbs and batteries', 'Other supplies']),
      (10, 'Other', array['Other items'])
    ) as t(n, main, subs)
    order by n
  loop
    insert into public.item_categories (name) values (m.main) returning id into main_id;
    if m.main = 'Other' then
      other_id := main_id;
    end if;
    foreach sub in array m.subs loop
      update public.item_categories set parent_id = main_id
        where lower(trim(name)) = lower(trim(sub)) and parent_id is null and id <> main_id;
      if not found then
        insert into public.item_categories (name, parent_id) values (sub, main_id);
      end if;
    end loop;
  end loop;

  -- 3. Anything else still at the top (a category added some other way)
  --    goes under "Other", so every item stays in a sub-category.
  update public.item_categories c set parent_id = other_id
  where c.parent_id is null
    and c.id <> other_id
    and not exists (select 1 from public.item_categories s where s.parent_id = c.id)
    and c.name not in ('Furniture and furnishings', 'Electronics, IT and sound', 'Heating, cooling and water',
      'Building systems and security', 'Kitchen and catering', 'Garden, tools and cleaning equipment', 'Vehicles',
      'Prayer and funeral items', 'Supplies (used up)');
end $$;

-- ---------------------------------------------------------------------------
-- From now on the tree rules apply to every change.
create trigger check_category_tree before insert or update on public.item_categories
  for each row execute function private.check_category_tree();
