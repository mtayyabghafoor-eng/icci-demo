-- 0058: Round C5, the accounts screen and the audit log screen (PLAN.md 3,
-- docs/IMPROVEMENT-PLAN.md section 4; audit fix 4 in docs/PHASE-2-AND-3.md).
-- Owner's choice (26 Nov 2026): option A, the website's server makes the
-- sign-in itself with the master key, only after this database confirms a
-- signed-in Super Admin is asking. Everything else happens here, as that
-- Super Admin, under the database's own rules.
--
--   * A new admin account gets a one-time temporary password, shown once.
--     It works for 24 hours. Until its owner has set up their authenticator
--     AND chosen their own password, the account sees nothing at all (its
--     role is empty), so the temporary password opens only the set-up.
--   * A Super Admin can give someone a new temporary password (forgotten
--     password, or the 24 hours passed) and reset their two-factor (lost
--     phone). Never their own: another Super Admin does it.
--   * Every account action is written down in account_events, which is never
--     changed or deleted. The Library Operator signs in by emailed code, so
--     never gets a password.

-- ---------------------------------------------------------------------------
alter table public.app_users add column temporary_password_until timestamptz;

-- The fingerprint of each temporary password as Supabase stores it, so the
-- database can tell the owner really chose a new one. Nobody reads it.
create table private.temporary_passwords (
  user_id       uuid primary key references auth.users (id),
  password_hash text not null,
  set_at        timestamptz not null default now()
);
alter table private.temporary_passwords enable row level security;
revoke all on private.temporary_passwords from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
create table public.account_events (
  id         bigint generated always as identity primary key,
  account_id uuid not null references public.app_users (id),
  kind       text not null check (kind in ('created', 'temporary_password', 'two_factor_reset', 'set_up_finished', 'switched_off', 'switched_on')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('account_events', 'id');
create index account_events_account on public.account_events (account_id, id desc);
create function private.block_account_event_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Account records are never changed.' using errcode = '42501';
end $$;
revoke all on function private.block_account_event_change() from public, anon, authenticated;
create trigger block_change before update on public.account_events for each row execute function private.block_account_event_change();
revoke insert, update on public.account_events from authenticated;
create policy account_events_read on public.account_events for select to authenticated
  using ((select private.has_role('super_admin')));

-- Switching an account off or on is written down too.
create function private.note_account_switch() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.active is distinct from old.active then
    insert into public.account_events (account_id, kind) values (new.id, case when new.active then 'switched_on' else 'switched_off' end);
  end if;
  return new;
end $$;
revoke all on function private.note_account_switch() from public, anon, authenticated;
create trigger note_account_switch after update on public.app_users for each row execute function private.note_account_switch();

-- ---------------------------------------------------------------------------
-- The role check (0034), with one more condition: no role while a
-- temporary password is still waiting to be replaced.
create or replace function private.current_app_role() returns text
language sql stable security definer set search_path = '' as $$
  select u.role
  from public.app_users u
  join public.roles r on r.code = u.role
  where u.id = auth.uid()
    and u.active
    and r.active
    and u.temporary_password_until is null
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

-- ---------------------------------------------------------------------------
-- Only a signed-in Super Admin, and never on their own account.
create function private.check_account_manager(p_account uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_role('super_admin') then
    raise exception 'Only a Super Admin can manage accounts.' using errcode = '42501';
  end if;
  if p_account = auth.uid() then
    raise exception 'You cannot do this to your own account. Ask another Super Admin.' using errcode = '42501';
  end if;
end $$;
revoke all on function private.check_account_manager(uuid) from public, anon, authenticated;

/** Asked by the website before it uses the master key at all. */
create function public.may_manage_accounts() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('super_admin')
$$;
revoke all on function public.may_manage_accounts() from public, anon;
grant execute on function public.may_manage_accounts() to authenticated;

-- Remembers the temporary password's fingerprint and starts its 24 hours.
create function private.start_temporary_password(p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  hash text;
begin
  select au.encrypted_password into hash from auth.users au where au.id = p_account;
  if hash is null or hash = '' then
    raise exception 'That sign-in has no password to make temporary.';
  end if;
  insert into private.temporary_passwords (user_id, password_hash, set_at) values (p_account, hash, now())
  on conflict (user_id) do update set password_hash = excluded.password_hash, set_at = excluded.set_at;
  update public.app_users set temporary_password_until = now() + interval '24 hours' where id = p_account;
end $$;
revoke all on function private.start_temporary_password(uuid) from public, anon, authenticated;

-- A new account for a sign-in the website has just made. Admin roles start
-- with a temporary password; the Library Operator signs in by emailed code.
create function public.create_account(p_account uuid, p_display_name text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  method text;
begin
  perform private.check_account_manager(p_account);
  if p_display_name is null or length(trim(p_display_name)) not between 1 and 80 then
    raise exception 'Enter the name to show for this account (80 characters at most).';
  end if;
  select r.sign_in_method into method from public.roles r where r.code = p_role and r.active;
  if method is null then
    raise exception 'Choose one of the roles.';
  end if;
  if not exists (select 1 from auth.users au where au.id = p_account) then
    raise exception 'That sign-in does not exist.';
  end if;
  if exists (select 1 from public.app_users u where u.id = p_account) then
    raise exception 'That sign-in already has an account.';
  end if;
  -- As the Super Admin, so who added it is recorded as usual.
  insert into public.app_users (id, display_name, role) values (p_account, trim(p_display_name), p_role);
  if method = 'authenticator' then
    perform private.start_temporary_password(p_account);
  end if;
  insert into public.account_events (account_id, kind) values (p_account, 'created');
end $$;
revoke all on function public.create_account(uuid, text, text) from public, anon;
grant execute on function public.create_account(uuid, text, text) to authenticated;

-- After the website has set a new temporary password: it works for 24
-- hours, and the account sees nothing until its owner chooses their own.
create function public.note_temporary_password(p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_account_manager(p_account);
  if not exists (
    select 1 from public.app_users u join public.roles r on r.code = u.role
    where u.id = p_account and r.sign_in_method = 'authenticator'
  ) then
    raise exception 'This account signs in with an emailed code, so it has no password.';
  end if;
  perform private.start_temporary_password(p_account);
  insert into public.account_events (account_id, kind) values (p_account, 'temporary_password');
end $$;
revoke all on function public.note_temporary_password(uuid) from public, anon;
grant execute on function public.note_temporary_password(uuid) to authenticated;

-- Before the website removes someone's authenticator (lost phone).
create function public.note_two_factor_reset(p_account uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.check_account_manager(p_account);
  if not exists (select 1 from public.app_users u where u.id = p_account) then
    raise exception 'That account does not exist.';
  end if;
  insert into public.account_events (account_id, kind) values (p_account, 'two_factor_reset');
end $$;
revoke all on function public.note_two_factor_reset(uuid) from public, anon;
grant execute on function public.note_two_factor_reset(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- The signed-in person's own set-up: 'ready', 'choose_password' (a
-- temporary password still to replace), 'expired' (its 24 hours are over)
-- or 'none' (no account). Works with the password alone, before the code.
create function public.my_set_up_state() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
             when u.temporary_password_until is null then 'ready'
             when u.temporary_password_until < now() then 'expired'
             else 'choose_password'
           end
    from public.app_users u where u.id = auth.uid() and u.active
  ), 'none')
$$;
revoke all on function public.my_set_up_state() from public, anon;
grant execute on function public.my_set_up_state() to authenticated;

-- The last step of a first sign-in: only with the authenticator set up and
-- just used, within the 24 hours, and with a password that is really new.
create function public.finish_first_set_up() returns void
language plpgsql security definer set search_path = '' as $$
declare
  u public.app_users;
  old_hash text;
  now_hash text;
begin
  select * into u from public.app_users where id = auth.uid() and active;
  if u.id is null or u.temporary_password_until is null then
    raise exception 'There is nothing to finish for this account.';
  end if;
  if u.temporary_password_until < now() then
    raise exception 'The temporary password has run out. Ask a Super Admin for a new one.';
  end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Set up your authenticator first.';
  end if;
  select t.password_hash into old_hash from private.temporary_passwords t where t.user_id = u.id;
  select au.encrypted_password into now_hash from auth.users au where au.id = u.id;
  if now_hash is null or now_hash = old_hash then
    raise exception 'Choose your own new password first.';
  end if;
  update public.app_users set temporary_password_until = null where id = u.id;
  insert into public.account_events (account_id, kind) values (u.id, 'set_up_finished');
end $$;
revoke all on function public.finish_first_set_up() from public, anon;
grant execute on function public.finish_first_set_up() to authenticated;

-- ---------------------------------------------------------------------------
-- The audit log screen reads names with each entry: the person who made the
-- change, for Super Admins only (as the audit log itself, 0002).
create view public.audit_log_list with (security_invoker = true) as
select a.*, u.display_name as changed_by_name
from public.audit_log a
left join public.app_users u on u.id = a.changed_by;
revoke all on public.audit_log_list from public, anon, authenticated;
grant select on public.audit_log_list to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Nobody sets or clears the 24-hour flag by hand, not even a Super Admin:
-- only the functions above (which run as the database owner) do.
create function private.guard_temporary_password() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated', 'anon')
     and new.temporary_password_until is distinct from (case when tg_op = 'UPDATE' then old.temporary_password_until end) then
    raise exception 'A temporary password is given only from the accounts screen.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.guard_temporary_password() from public, anon, authenticated;
create trigger guard_temporary_password before insert or update on public.app_users
  for each row execute function private.guard_temporary_password();

-- ---------------------------------------------------------------------------
-- The accounts screen's list: each account with its sign-in email, whether
-- an authenticator is set up, the last sign-in and the linked person. Super
-- Admins only (others get nothing), so the website needs no master key to read.
create function public.account_list()
returns table (
  id                       uuid,
  display_name             text,
  role                     text,
  role_label               text,
  sign_in_method           text,
  active                   boolean,
  email                    text,
  temporary_password_until timestamptz,
  has_authenticator        boolean,
  last_sign_in_at          timestamptz,
  created_at               timestamptz,
  person_id                uuid,
  person_name              text
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.display_name, u.role, r.label, r.sign_in_method, u.active, au.email::text,
         u.temporary_password_until,
         exists (select 1 from auth.mfa_factors f where f.user_id = u.id and f.factor_type = 'totp' and f.status = 'verified'),
         au.last_sign_in_at, u.created_at, p.id, p.full_name
  from public.app_users u
  join public.roles r on r.code = u.role
  join auth.users au on au.id = u.id
  left join public.people p on p.app_user_id = u.id
  where private.has_role('super_admin')
$$;
revoke all on function public.account_list() from public, anon;
grant execute on function public.account_list() to authenticated;

-- A sign-in made for this email whose account was never added (the screen
-- was interrupted in between), so adding it again can finish the job.
create function public.sign_in_without_account(p_email text) returns uuid
language sql stable security definer set search_path = '' as $$
  select au.id from auth.users au
  where private.has_role('super_admin')
    and lower(au.email) = lower(trim(p_email))
    and not exists (select 1 from public.app_users u where u.id = au.id)
$$;
revoke all on function public.sign_in_without_account(text) from public, anon;
grant execute on function public.sign_in_without_account(text) to authenticated;
