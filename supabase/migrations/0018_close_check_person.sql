-- 0018: Close the people rule-checker (migration 0017) to everyone but the
-- database itself. New functions can be run by anyone by default; the
-- automatic security report (security_problems) found this one open to
-- signed-out visitors. It only checks a role or section is switched on, and
-- runs inside the people table's own trigger, so nothing else needs it.
revoke all on function private.check_person() from public;
