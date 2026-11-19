-- 0024: Policy sign-offs and the policy grid (PLAN.md 5.2; docs/PHASE-2-AND-3.md
-- 4.1, slice P2.6).
-- Owner's choices:
--   * 15 Nov 2026: "overdue" is still unsigned 30 days after publishing;
--     a scan of the signed sheet is optional.
--   * 16 Nov 2026: nobody records or withdraws their own sign-off; another
--     admin enters it (the same as vetting and training).
-- And from the plan:
--   * One row per person per signed version: date signed, optional scan,
--     who entered it. Never changed or deleted; a wrong one is withdrawn with
--     a reason. One live sign-off per person per version.
--   * Only published versions can be signed. The date cannot be in the
--     future or before the version's approval date. No new sign-offs for
--     switched-off people or policies.
--   * The grid (view policy_grid) is worked out every time: one square per
--     switched-on person per switched-on policy their role must sign,
--     against the CURRENT version. A new version therefore turns everyone
--     back to unsigned by itself.
--   * Scans live in a private file store, "signoff-scans": PDF or picture,
--     up to 6 MB, add and view only. They show signatures, so admins only.

-- ---------------------------------------------------------------------------
-- The file store.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('signoff-scans', 'signoff-scans', false, 6291456, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy signoff_scans_read on storage.objects for select to authenticated
  using (bucket_id = 'signoff-scans' and (select private.has_role('super_admin', 'centre_admin')));
create policy signoff_scans_add on storage.objects for insert to authenticated
  with check (bucket_id = 'signoff-scans' and (select private.has_role('super_admin', 'centre_admin')));

create function private.signoff_scan_exists(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'signoff-scans' and o.name = p_path)
$$;
revoke all on function private.signoff_scan_exists(text) from public, anon;
grant execute on function private.signoff_scan_exists(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
create table public.policy_signoffs (
  id                bigint generated always as identity primary key,
  person_id         uuid not null references public.people (id),
  policy_version_id uuid not null references public.policy_versions (id),
  signed_on         date not null,
  scan_path         text check (scan_path ~ '^signoffs/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'),
  withdrawn_at      timestamptz,
  withdrawn_by      uuid references auth.users (id),
  withdrawn_reason  text check (length(withdrawn_reason) between 1 and 500),
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  constraint policy_signoffs_withdrawn_complete check (
    num_nonnulls(withdrawn_at, withdrawn_by, withdrawn_reason) in (0, 3)
  )
);
call private.add_standard_safeguards('policy_signoffs', 'id');
create unique index policy_signoffs_one_live on public.policy_signoffs (person_id, policy_version_id) where withdrawn_at is null;
create index policy_signoffs_version on public.policy_signoffs (policy_version_id);

create function private.check_policy_signoff() returns trigger
language plpgsql set search_path = '' as $$
declare
  p   public.people%rowtype;
  v   public.policy_versions%rowtype;
  pol public.policies%rowtype;
begin
  select * into p from public.people x where x.id = coalesce(new.person_id, old.person_id);

  if tg_op = 'INSERT' then
    select * into v from public.policy_versions x where x.id = new.policy_version_id;
    select * into pol from public.policies x where x.id = v.policy_id;
    if p.id is null then
      raise exception 'That person is not in the people directory.';
    end if;
    if v.id is null then
      raise exception 'That policy version could not be found.';
    end if;
    if new.withdrawn_at is not null or new.withdrawn_by is not null or new.withdrawn_reason is not null then
      raise exception 'A new entry cannot already be withdrawn.';
    end if;
    if auth.uid() is not null and p.app_user_id = auth.uid() then
      raise exception 'You cannot record your own sign-off. Ask another admin.';
    end if;
    if not p.active then
      raise exception 'This person is switched off. Switch them back on to record a sign-off.';
    end if;
    if v.status <> 'published' then
      raise exception 'Only a published version can be signed.';
    end if;
    if not pol.active then
      raise exception 'This policy is switched off. Switch it back on to record sign-offs.';
    end if;
    if new.signed_on > private.today_in_dublin() then
      raise exception 'The date signed cannot be in the future.';
    end if;
    if new.signed_on < v.approved_on then
      raise exception 'The date signed cannot be before the version was approved.';
    end if;
    if new.scan_path is not null then
      if new.scan_path not like 'signoffs/' || new.policy_version_id::text || '/%' then
        raise exception 'That scan belongs to a different policy version.';
      end if;
      if not private.signoff_scan_exists(new.scan_path) then
        raise exception 'The scan could not be found. Please upload it again.';
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: only withdrawing an entry, once, with a reason.
  if old.withdrawn_at is not null then
    raise exception 'This entry is already withdrawn. Nothing more can change.';
  end if;
  if new.person_id is distinct from old.person_id or new.policy_version_id is distinct from old.policy_version_id
     or new.signed_on is distinct from old.signed_on or new.scan_path is distinct from old.scan_path then
    raise exception 'Sign-offs cannot be changed. Withdraw the wrong one and record a new one.';
  end if;
  if auth.uid() is null then
    raise exception 'An entry must be withdrawn by a signed-in admin.';
  end if;
  if p.app_user_id = auth.uid() then
    raise exception 'You cannot withdraw your own sign-off. Ask another admin.';
  end if;
  new.withdrawn_reason := nullif(regexp_replace(trim(coalesce(new.withdrawn_reason, '')), '\s+', ' ', 'g'), '');
  if new.withdrawn_reason is null then
    raise exception 'Withdrawing an entry needs a reason.';
  end if;
  new.withdrawn_by := auth.uid();
  new.withdrawn_at := now();
  return new;
end $$;

create trigger check_policy_signoff before insert or update on public.policy_signoffs
  for each row execute function private.check_policy_signoff();
revoke all on function private.check_policy_signoff() from public, anon;

create policy policy_signoffs_read on public.policy_signoffs for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy policy_signoffs_add on public.policy_signoffs for insert to authenticated
  with check ((select private.has_role('super_admin', 'centre_admin')));
create policy policy_signoffs_withdraw on public.policy_signoffs for update to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')))
  with check ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- The rule for one square, on its own so it can be checked with any dates:
-- signed (green), overdue (red: still unsigned 30 days after the version was
-- published), or unsigned (amber).
create function public.signoff_status(p_published_on date, p_signed boolean, p_today date)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_signed then 'signed'
    when p_today > p_published_on + 30 then 'overdue'
    else 'unsigned'
  end
$$;
revoke all on function public.signoff_status(date, boolean, date) from public, anon;
grant execute on function public.signoff_status(date, boolean, date) to authenticated, service_role;

-- One square per switched-on person per switched-on policy their role must
-- sign, against the policy's current (newest published) version. Policies
-- with nothing published yet have no squares. The reader's own access rules apply.
create view public.policy_grid with (security_invoker = true) as
select
  x.id                as person_id,
  x.full_name,
  x.person_role_id,
  x.section_id,
  pol.id              as policy_id,
  pol.title,
  cur.id              as policy_version_id,
  cur.version_label,
  (cur.published_at at time zone 'Europe/Dublin')::date as published_on,
  so.signed_on,
  public.signoff_status((cur.published_at at time zone 'Europe/Dublin')::date, so.signed_on is not null, t.today) as status
from public.policies pol
cross join (select private.today_in_dublin() as today) t
join lateral (
  select v.id, v.version_label, v.published_at
  from public.policy_versions v
  where v.policy_id = pol.id and v.status = 'published'
  order by v.published_at desc, v.id desc
  limit 1
) cur on true
join public.policy_required_roles r on r.policy_id = pol.id and r.active
join public.people x on x.person_role_id = r.person_role_id and x.active
left join lateral (
  select s.signed_on
  from public.policy_signoffs s
  where s.person_id = x.id and s.policy_version_id = cur.id and s.withdrawn_at is null
  limit 1
) so on true
where pol.active;

revoke all on public.policy_grid from public, anon, authenticated, service_role;
grant select on public.policy_grid to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Home page counters (migration 0020) gain two sign-off numbers: squares
-- overdue and squares still unsigned (not yet overdue). Everything else is
-- unchanged.
drop function public.home_counters();
create function public.home_counters()
returns table (
  low_stock               integer,
  out_of_stock            integer,
  damaged                 integer,
  missing                 integer,
  corrections_for_me      integer,
  disposals_for_me        integer,
  stocktake_diffs_for_me  integer,
  vetting_expired         integer,
  vetting_none            integer,
  vetting_due             integer,
  signoffs_overdue        integer,
  signoffs_unsigned       integer
)
language plpgsql stable security invoker set search_path = '' as $$
declare
  me uuid := auth.uid();
begin
  if not private.has_role('super_admin', 'centre_admin') then
    raise exception 'Only a Super Admin or Centre Admin can see these counters.' using errcode = '42501';
  end if;

  return query select
    (select count(*)::integer from public.stock_levels sl where sl.status in ('low', 'out')),
    (select count(*)::integer from public.stock_levels sl where sl.status = 'out'),
    (select count(*)::integer from public.items i where i.kind = 'fixed_asset' and i.condition = 'damaged'),
    (select count(*)::integer from public.items i where i.kind = 'fixed_asset' and i.condition = 'missing'),
    (select count(*)::integer from public.stock_movements m
      where m.status = 'pending' and m.created_by is distinct from me),
    (select count(*)::integer from public.asset_events e
      where e.status = 'pending' and e.created_by is distinct from me),
    (select count(*)::integer from public.stocktake_differences d
      join public.stocktakes st on st.id = d.stocktake_id
      where d.status = 'pending'
        and st.created_by is distinct from me
        and st.submitted_by is distinct from me
        and d.created_by is distinct from me
        and not exists (select 1 from public.stocktake_scans sc
                        where sc.stocktake_id = st.id and sc.created_by = me)),
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'expired'),
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'none'),
    (select count(*)::integer from public.people_vetting pv where pv.active and pv.status = 'due'),
    (select count(*)::integer from public.policy_grid g where g.status = 'overdue'),
    (select count(*)::integer from public.policy_grid g where g.status = 'unsigned');
end $$;

revoke all on function public.home_counters() from public, anon;
grant execute on function public.home_counters() to authenticated, service_role;
