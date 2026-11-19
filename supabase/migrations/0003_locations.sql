-- 0003: Locations, a tree: building > room > store room > shelf (PLAN.md 5.1).

create table public.locations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  kind       text not null check (kind in ('building', 'room', 'store_room', 'shelf')),
  parent_id  uuid references public.locations (id),
  notes      text,
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('locations', 'id');

create index locations_parent on public.locations (parent_id);

-- No two locations with the same name in the same place (ignoring capitals).
create unique index locations_unique_name_per_parent on public.locations (
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(trim(name))
);

-- Each kind must sit directly inside the kind above it. Because the kind can
-- never change, the tree can never loop back on itself.
create function private.check_location_tree() returns trigger
language plpgsql set search_path = '' as $$
declare
  expected    text;
  parent_kind text;
begin
  if tg_op = 'UPDATE' and new.kind is distinct from old.kind then
    raise exception 'The kind of location cannot be changed. Deactivate it and add a new one.';
  end if;

  expected := case new.kind
    when 'room' then 'building'
    when 'store_room' then 'room'
    when 'shelf' then 'store_room'
  end;

  if new.parent_id is not null then
    select l.kind into parent_kind from public.locations l where l.id = new.parent_id;
  end if;

  if new.kind = 'building' and new.parent_id is not null then
    raise exception 'A building cannot be inside another location.';
  end if;
  if expected is not null and parent_kind is distinct from expected then
    raise exception 'A % must be inside a %.', replace(new.kind, '_', ' '), replace(expected, '_', ' ');
  end if;
  return new;
end $$;

create trigger check_location_tree before insert or update on public.locations
  for each row execute function private.check_location_tree();

-- Row-level security: only super_admin and centre_admin can see or change
-- locations. Finance and the library operator cannot (owner decision,
-- 14 Nov 2026: least access; add read access later if expenses need it).
create policy locations_read on public.locations for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy locations_add on public.locations for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));
create policy locations_change on public.locations for update to authenticated
  using (private.has_role('super_admin', 'centre_admin'))
  with check (private.has_role('super_admin', 'centre_admin'));
