-- 0005: The database insists on the right kind of sign-in (PLAN.md section 3).
--
-- Super Admin, Centre Admin and Finance must have entered the code from their
-- authenticator app. Signed in with only a password, they have no access at
-- all: a stolen password alone opens nothing.
--
-- The library operator will sign in with an emailed code. That is built with
-- the library in Phase 4; until then the role has no access at all.
--
-- How each role signs in is stored on the role, so roles added later only
-- need a new row.

alter table public.roles
  add column sign_in_method text not null default 'authenticator'
    check (sign_in_method in ('authenticator', 'email_code'));

update public.roles set sign_in_method = 'email_code' where code = 'library_operator';

comment on column public.roles.sign_in_method is
  'authenticator: password + authenticator-app code. email_code: emailed one-time code (Phase 4; no access until built).';

-- "What role does the signed-in person have?" Now also empty unless they
-- signed in the way their role requires.
--   aal2 = Supabase's mark that the authenticator code was entered.
create or replace function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role
  from public.app_users u
  join public.roles r on r.code = u.role
  where u.id = auth.uid()
    and u.active
    and r.active
    and case r.sign_in_method
          when 'authenticator' then coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          else false -- emailed-code sign-in is not built yet (Phase 4)
        end
$$;

-- Accounts: reading your own row now also needs a full, valid sign-in.
-- (Before, anyone signed in could read their own row.)
drop policy app_users_read on public.app_users;
create policy app_users_read on public.app_users for select to authenticated
  using (
    (id = (select auth.uid()) and private.current_app_role() is not null)
    or private.has_role('super_admin', 'centre_admin', 'finance')
  );
