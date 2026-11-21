-- 0042: A picture (icon) for each main category (P1.17 follow-up, owner's
-- request 21 Nov 2026): the Categories and "What we own" screens show the
-- broad categories as tiles with a symbol; opening one shows its
-- sub-categories. The icon is a word from a fixed list (each word is drawn
-- as a Lucide icon on screen); the list can grow with a later migration.
-- Sub-categories keep the default and show their main category's icon.

alter table public.item_categories
  add column icon text not null default 'other' check (icon in (
    'furniture', 'electronics', 'heating', 'building', 'kitchen', 'garden', 'vehicles', 'prayer',
    'supplies', 'other', 'tools', 'safety', 'lighting', 'books', 'sports', 'medical', 'office',
    'cleaning', 'water', 'screens', 'storage'
  ));

update public.item_categories c set icon = v.icon
from (values
  ('Furniture and furnishings', 'furniture'),
  ('Electronics, IT and sound', 'electronics'),
  ('Heating, cooling and water', 'heating'),
  ('Building systems and security', 'building'),
  ('Kitchen and catering', 'kitchen'),
  ('Garden, tools and cleaning equipment', 'garden'),
  ('Vehicles', 'vehicles'),
  ('Prayer and funeral items', 'prayer'),
  ('Supplies (used up)', 'supplies'),
  ('Other', 'other')
) as v(name, icon)
where c.name = v.name and c.parent_id is null;
