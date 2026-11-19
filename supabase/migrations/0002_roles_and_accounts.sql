-- 0002: Roles and admin accounts (PLAN.md section 3).
--
-- Roles are rows in a table, not fixed in code, so new roles can be added
-- later with one new row and new rules, without restructuring.

create table public.roles (
  code        text primary key check (code ~ '^[a-z_]+$'),
  label       text not null,
  description text,
  active      boolean not null default true,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now()
);
call private.add_standard_safeguards('roles', 'code');

insert into public.roles (code, label, description) values
  ('super_admin', 'Super Admin', 'Everything a Centre Admin can do, plus manage accounts and view the audit log.'),
  ('centre_admin', 'Centre Admin', 'Uses every module, approves adjustments, publishes rota and policies, runs reports.'),
  ('finance', 'Finance', 'Approves or rejects expenses, tags funds, exports. Cannot change stock, rota, policies or people.'),
  ('library_operator', 'Library Operator', 'Phase 4: adds books, lends and returns. Sees nothing outside the library.');

-- One row per sign-in account. The id is the sign-in account's id. Because
-- this refers to the sign-in account, the sign-in account cannot be deleted
-- either: accounts are only ever switched off (active = false).
create table public.app_users (
  id           uuid primary key references auth.users (id),
  display_name text not null check (length(trim(display_name)) > 0),
  role         text not null references public.roles (code),
  active       boolean not null default true,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now()
);
call private.add_standard_safeguards('app_users', 'id');

-- ---------------------------------------------------------------------------
-- "What role does the signed-in person have?" Empty if not signed in, if the
-- account is switched off, or if the role itself is switched off. Runs with
-- the owner's rights so the rules below can use it without going in circles.
create function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role
  from public.app_users u
  join public.roles r on r.code = u.role
  where u.id = auth.uid() and u.active and r.active
$$;

create function private.has_role(variadic allowed text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() = any (allowed), false)
$$;

revoke all on function private.current_app_role() from public;
revoke all on function private.has_role(text[]) from public;
grant execute on function private.current_app_role() to authenticated, service_role;
grant execute on function private.has_role(text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Nobody can change their own role or switch off their own account. This
-- stops a super_admin locking everyone out by mistake.
create function private.guard_own_account() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'An account id cannot be changed.';
  end if;
  if auth.uid() is not null and new.id = auth.uid() then
    if new.role is distinct from old.role then
      raise exception 'You cannot change your own role. Ask another Super Admin.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'You cannot deactivate your own account. Ask another Super Admin.';
    end if;
  end if;
  return new;
end $$;

create trigger guard_own_account before update on public.app_users
  for each row execute function private.guard_own_account();

-- ---------------------------------------------------------------------------
-- Row-level security rules.

-- Roles: any active account can read the list; only super_admin changes it.
create policy roles_read on public.roles for select to authenticated
  using (private.current_app_role() is not null);
create policy roles_add on public.roles for insert to authenticated
  with check (private.has_role('super_admin'));
create policy roles_change on public.roles for update to authenticated
  using (private.has_role('super_admin')) with check (private.has_role('super_admin'));

-- Accounts: everyone sees their own row. Super, centre and finance admins see
-- everyone's name and role (needed to show who did what). The library
-- operator sees only their own. Only super_admin adds or changes accounts.
create policy app_users_read on public.app_users for select to authenticated
  using (id = (select auth.uid()) or private.has_role('super_admin', 'centre_admin', 'finance'));
create policy app_users_add on public.app_users for insert to authenticated
  with check (private.has_role('super_admin'));
create policy app_users_change on public.app_users for update to authenticated
  using (private.has_role('super_admin')) with check (private.has_role('super_admin'));

-- Audit log: only super_admin can read it. Nobody can write to it directly.
create policy audit_log_read on public.audit_log for select to authenticated
  using (private.has_role('super_admin'));
