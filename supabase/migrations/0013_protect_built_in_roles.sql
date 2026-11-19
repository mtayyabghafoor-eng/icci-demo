-- 0013: Protect the built-in roles (audit fix 5, 15 Nov 2026).
--
-- Switching off the Super Admin or Centre Admin role, or changing how a role
-- signs in, locks out everyone who has it. The new test proved it: before
-- this change, running it switched off both roles on the development
-- database. This puts them back as migrations 0002 and 0005 set them, then
-- refuses any such change from now on, even with the master key. Only a later
-- numbered migration can change them (for example Phase 4, the library).
-- Their wording (label, description) can still be edited.

update public.roles set active = true, sign_in_method = 'authenticator'
  where code in ('super_admin', 'centre_admin', 'finance');
update public.roles set active = true, sign_in_method = 'email_code'
  where code = 'library_operator';

create function private.guard_built_in_roles() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.code in ('super_admin', 'centre_admin', 'finance', 'library_operator') then
    if new.code is distinct from old.code then
      raise exception 'A built-in role cannot be renamed.';
    end if;
    if new.active is distinct from old.active then
      raise exception 'A built-in role cannot be switched off. Switch off the accounts instead.';
    end if;
    if new.sign_in_method is distinct from old.sign_in_method then
      raise exception 'How a built-in role signs in can only be changed by a database update, not on screen.';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.guard_built_in_roles() from public;

create trigger guard_built_in_roles before update on public.roles
  for each row execute function private.guard_built_in_roles();
