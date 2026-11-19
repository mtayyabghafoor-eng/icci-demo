-- Slice P4.1: the Library Operator signs in with an emailed one-time code
-- (PLAN.md 3, docs/PHASE-4.md section 7).
--
-- "What role does the signed-in person have?" stays empty unless they signed
-- in exactly the way their role requires. The sign-in pass (the JWT) records
-- how: "aal" (aal2 = an authenticator code was entered) and "amr", the list
-- of methods used ("password", "totp", "otp" = emailed code).
--
--   authenticator roles (Super Admin, Centre Admin, Finance):
--       password AND authenticator code. New: the password must be in the
--       list, so an emailed code plus the authenticator app no longer
--       counts (before, the database looked only at aal2).
--   email_code roles (Library Operator):
--       an emailed code. Password, or password + authenticator, is refused.
--
-- The role's sign_in_method cannot be changed by anyone through the website
-- (migration 0013 protects the built-in roles).

create or replace function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role
  from public.app_users u
  join public.roles r on r.code = u.role
  where u.id = auth.uid()
    and u.active
    and r.active
    and case r.sign_in_method
          when 'authenticator' then
                coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
            and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "password"}]'::jsonb
            and coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "totp"}]'::jsonb
          when 'email_code' then
                coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "otp"}]'::jsonb
            and not coalesce(auth.jwt() -> 'amr', '[]'::jsonb) @> '[{"method": "password"}]'::jsonb
          else false
        end
$$;

comment on column public.roles.sign_in_method is
  'authenticator: password + authenticator-app code. email_code: emailed one-time code only (slice P4.1).';
