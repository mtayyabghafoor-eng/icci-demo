-- 0023: Let signed-in admins' entries use the "is this PDF really in the
-- file store?" check from 0022. It only answers yes or no for one path in the
-- policy-files store, and is never callable by signed-out visitors.
grant execute on function private.policy_file_exists(text) to authenticated;
