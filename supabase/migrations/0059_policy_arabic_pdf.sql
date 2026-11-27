-- Round D7 (owner, 27 Nov 2026): a policy version can hold the policy in
-- Arabic as well as English, each shown as a flip book (English turning
-- left to right, Arabic right to left). The English PDF stays required;
-- the Arabic one is optional. It follows the same rules: uploaded first
-- into this policy's own folder, changed only while the version is a
-- draft, never changed by publishing, never changed once published.
-- Tests: tests/db/policy-arabic.test.ts.

alter table public.policy_versions
  add column file_path_ar text check (file_path_ar ~ '^policies/[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$');

comment on column public.policy_versions.file_path_ar is
  'D7: the Arabic PDF of this version (optional), in the policy-files store.';

create or replace function private.check_policy_version() returns trigger
language plpgsql set search_path = '' as $$
declare
  pol public.policies%rowtype;
begin
  select * into pol from public.policies x where x.id = coalesce(new.policy_id, old.policy_id);

  if tg_op = 'UPDATE' then
    if old.status = 'published' then
      raise exception 'A published version can never be changed. Upload a new version instead.';
    end if;
    if new.policy_id is distinct from old.policy_id then
      raise exception 'A version cannot be moved to another policy.';
    end if;

    if new.status = 'published' then
      -- Publishing: one step, by a different admin, with nothing else changed.
      if new.version_label is distinct from old.version_label or new.file_path is distinct from old.file_path
         or new.file_path_ar is distinct from old.file_path_ar
         or new.approved_on is distinct from old.approved_on or new.next_review_on is distinct from old.next_review_on then
        raise exception 'Publishing cannot change the version. Save the changes first, then another admin publishes.';
      end if;
      if auth.uid() is null then
        raise exception 'A version must be published by a signed-in admin.';
      end if;
      if auth.uid() = old.created_by or auth.uid() = old.updated_by then
        raise exception 'A different admin must publish this version. Nobody can publish a version they uploaded or last changed.';
      end if;
      if not pol.active then
        raise exception 'This policy is switched off. Switch it back on to publish.';
      end if;
      if old.next_review_on <= private.today_in_dublin() then
        raise exception 'The next review date has already passed. Change the draft before publishing.';
      end if;
      new.published_by := auth.uid();
      new.published_at := now();
      return new;
    end if;
  end if;

  -- A new draft, or a change to a draft.
  if pol.id is null then
    raise exception 'That policy could not be found.';
  end if;
  if new.status <> 'draft' or new.published_by is not null or new.published_at is not null then
    raise exception 'A new version starts as a draft. Another admin publishes it.';
  end if;
  if not pol.active then
    raise exception 'This policy is switched off. Switch it back on to add or change a version.';
  end if;
  new.version_label := regexp_replace(trim(new.version_label), '\s+', ' ', 'g');
  if new.approved_on > private.today_in_dublin() then
    raise exception 'The approval date cannot be in the future.';
  end if;
  if new.next_review_on <= new.approved_on then
    raise exception 'The next review date must be after the approval date.';
  end if;
  if new.next_review_on > (new.approved_on + interval '5 years')::date then
    raise exception 'The next review date cannot be more than 5 years after the approval date.';
  end if;
  if tg_op = 'INSERT' or new.file_path is distinct from old.file_path then
    if new.file_path not like 'policies/' || new.policy_id::text || '/%' then
      raise exception 'That PDF belongs to a different policy.';
    end if;
    if not private.policy_file_exists(new.file_path) then
      raise exception 'The PDF could not be found. Please upload it again.';
    end if;
  end if;
  -- D7: the Arabic PDF (optional) follows the same rules as the English one.
  if new.file_path_ar is not null and (tg_op = 'INSERT' or new.file_path_ar is distinct from old.file_path_ar) then
    if new.file_path_ar not like 'policies/' || new.policy_id::text || '/%' then
      raise exception 'That Arabic PDF belongs to a different policy.';
    end if;
    if not private.policy_file_exists(new.file_path_ar) then
      raise exception 'The Arabic PDF could not be found. Please upload it again.';
    end if;
  end if;
  if new.file_path_ar is not null and new.file_path_ar = new.file_path then
    raise exception 'The English and Arabic PDFs must be two different files.';
  end if;
  return new;
end $$;

revoke all on function private.check_policy_version() from public, anon;
