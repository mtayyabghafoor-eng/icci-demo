-- 0017: The people directory (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1,
-- slice P2.1). Owner's choices, 15 Nov 2026:
--   * One main role per person.
--   * Starting lists of person roles (Caretaker and Gardener added; all need
--     vetting except Board member and Contractor) and sections.
--   * Super Admin and Centre Admin only. Finance and the Library Operator
--     see nothing (least access).
--   * A person is switched off, never deleted. The same name twice is
--     allowed (two people can share a name); the screen warns instead.
--   * Nothing else is stored about a person: no address, date of birth,
--     PPS number, photo, documents, or notes (a notes box is where medical
--     or family details end up by accident).
-- The link from a person to an admin account comes in slice P2.2.

-- ---------------------------------------------------------------------------
-- Person roles: what someone does at the Centre. Named so it is never
-- confused with "roles", which is about sign-in accounts.
create table public.person_roles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (length(trim(name)) between 1 and 100),
  needs_vetting boolean not null,
  active        boolean not null default true,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now()
);
call private.add_standard_safeguards('person_roles', 'id');
create unique index person_roles_unique_name on public.person_roles (lower(trim(name)));

insert into public.person_roles (name, needs_vetting) values
  ('Imam', true), ('Staff', true), ('Security', true), ('Cleaner', true),
  ('Caretaker', true), ('Gardener', true), ('Reception', true),
  ('Volunteer', true), ('Board member', false), ('Contractor', false);

-- ---------------------------------------------------------------------------
-- Sections: which part of the Centre.
create table public.sections (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 100),
  active     boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('sections', 'id');
create unique index sections_unique_name on public.sections (lower(trim(name)));

insert into public.sections (name) values
  ('Administration'), ('Prayer halls'), ('Women''s section'), ('Security'),
  ('Cleaning'), ('Reception'), ('Shop'), ('Restaurant'), ('Maintenance'),
  ('Volunteers');

-- ---------------------------------------------------------------------------
-- People.
create table public.people (
  id             uuid primary key default gen_random_uuid(),
  full_name      text not null check (length(trim(full_name)) between 1 and 200),
  person_role_id uuid not null references public.person_roles (id),
  section_id     uuid not null references public.sections (id),
  -- Optional. A phone number: 6 to 20 digits, with + (at the start only),
  -- spaces, brackets and dashes allowed. An email: one @ and a dot after it.
  phone          text check (
    phone ~ '^\+?[0-9 ()-]+$'
    and length(regexp_replace(phone, '[^0-9]', '', 'g')) between 6 and 20
  ),
  email          text check (length(email) <= 200 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  start_date     date,
  active         boolean not null default true,
  created_by     uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id),
  updated_at     timestamptz not null default now()
);
call private.add_standard_safeguards('people', 'id');

create index people_name on public.people (lower(full_name));
create index people_role on public.people (person_role_id);
create index people_section on public.people (section_id);

-- A new person, or someone moved to a different role or section, must get
-- one that is switched on. Someone who already has a role or section that
-- is later switched off keeps it, and can still be edited.
create function private.check_person() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.person_role_id is distinct from old.person_role_id then
    if not exists (select 1 from public.person_roles r where r.id = new.person_role_id and r.active) then
      raise exception 'That role is switched off. Pick another.';
    end if;
  end if;
  if tg_op = 'INSERT' or new.section_id is distinct from old.section_id then
    if not exists (select 1 from public.sections s where s.id = new.section_id and s.active) then
      raise exception 'That section is switched off. Pick another.';
    end if;
  end if;
  return new;
end $$;

create trigger people_check before insert or update on public.people
  for each row execute function private.check_person();

-- ---------------------------------------------------------------------------
-- Access: Super Admin and Centre Admin only. Nobody may delete (blocked by
-- the standard safeguards, even for the master key).
create policy person_roles_read on public.person_roles for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy person_roles_add on public.person_roles for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy person_roles_change on public.person_roles for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy sections_read on public.sections for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy sections_add on public.sections for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy sections_change on public.sections for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

create policy people_read on public.people for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy people_add on public.people for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy people_change on public.people for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));
