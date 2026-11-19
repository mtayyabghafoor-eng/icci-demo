-- 0027: Email reminders for the renewals register (PLAN.md 5.2, slice P2.9).
-- Owner's choices, 17 Nov 2026 (all recommended answers):
--   * Reminders at 60, 30 and 7 days before a due date, and none after it
--     (an overdue renewal is red on screen). Each renewal gets each reminder
--     once per due date; a missed day is caught up with the latest stage
--     only (a renewal first seen 20 days out gets the 30-day reminder only).
--   * One summary email a day to every switched-on Super Admin and Centre
--     Admin; nothing on a quiet day. Finance gets none (it cannot see renewals).
--   * People's names never go into an email: a Garda vetting renewal is
--     listed as "Garda vetting for 1 person".
--   * Sending is done by the website, through the email service. This
--     database decides what is due, remembers what was sent and to whom,
--     and refuses everyone else.
--   * The daily timer is not a person and cannot sign in. One narrow
--     exception (owner's decision, 17 Nov 2026): run_reminders and
--     record_reminder_deliveries may be called without signing in, but do
--     nothing without the timer's secret key. Only a fingerprint (SHA-256)
--     of that key is kept here; the key itself lives with the web host.
--     The security report allows exactly these two functions by name.
--   * Records are append-only: nothing here is ever changed or deleted.

-- ---------------------------------------------------------------------------
-- The timer's key fingerprint. One row. Set from the developer's PC only
-- (npm run setup:reminder-key, and the development seed), never from a screen.
create table private.reminder_timer_key (
  id       integer primary key default 1 check (id = 1),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  set_at   timestamptz not null default now()
);
alter table private.reminder_timer_key enable row level security;
revoke all on private.reminder_timer_key from public, anon, authenticated, service_role;

create function public.set_reminder_timer_key(p_key_hash text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_key_hash is null or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'The key fingerprint must be 64 lowercase hex characters.' using errcode = '22023';
  end if;
  insert into private.reminder_timer_key (id, key_hash, set_at) values (1, p_key_hash, now())
  on conflict (id) do update set key_hash = excluded.key_hash, set_at = excluded.set_at;
end $$;
revoke all on function public.set_reminder_timer_key(text) from public, anon, authenticated;
grant execute on function public.set_reminder_timer_key(text) to service_role;

-- Is this the timer's key? Compared by fingerprint; an empty or short key never matches.
create function private.is_reminder_timer_key(p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_key) >= 32 and exists (
    select 1 from private.reminder_timer_key k
    where k.key_hash = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_key, 'UTF8')), 'hex')
  ), false)
$$;
revoke all on function private.is_reminder_timer_key(text) from public, anon, authenticated;

-- Which reminder is due, from the days left before the due date:
-- 7 (0 to 7 days), 30 (8 to 30), 60 (31 to 60), otherwise none.
create function public.reminder_stage(p_days_left integer) returns integer
language sql immutable set search_path = '' as $$
  select case
    when p_days_left is null or p_days_left < 0 then null
    when p_days_left <= 7 then 7
    when p_days_left <= 30 then 30
    when p_days_left <= 60 then 60
  end
$$;
revoke all on function public.reminder_stage(integer) from public, anon;
grant execute on function public.reminder_stage(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One row each time the reminders run (by the daily timer or the button).
create table public.reminder_runs (
  id         bigint generated always as identity primary key,
  run_on     date not null,
  trigger    text not null check (trigger in ('timer', 'button')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now()
);
call private.add_standard_safeguards('reminder_runs', 'id');
create index reminder_runs_recent on public.reminder_runs (created_at desc);

-- One row per renewal, due date and stage: the reason nobody is reminded twice.
create table public.reminders_sent (
  id          bigint generated always as identity primary key,
  run_id      bigint not null references public.reminder_runs (id),
  source      text not null,
  record_id   uuid not null,
  due_on      date not null,
  stage       integer not null check (stage in (60, 30, 7)),
  email_title text not null check (length(email_title) between 1 and 200),
  category    text not null,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id),
  updated_at  timestamptz not null default now(),
  constraint reminders_sent_once unique (source, record_id, due_on, stage)
);
call private.add_standard_safeguards('reminders_sent', 'id');
create index reminders_sent_run on public.reminders_sent (run_id);

-- One row per admin per run that had something to say: sent, recorded only
-- (development, a test address, or no email service yet), or failed.
create table public.reminder_deliveries (
  id           bigint generated always as identity primary key,
  run_id       bigint not null references public.reminder_runs (id),
  recipient_id uuid not null references public.app_users (id),
  outcome      text not null check (outcome in ('sent', 'recorded only', 'failed')),
  detail       text check (length(detail) between 1 and 300),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  constraint reminder_deliveries_once unique (run_id, recipient_id)
);
call private.add_standard_safeguards('reminder_deliveries', 'id');

-- Append-only: no changes at all, not even with the master key.
create function private.block_reminder_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Reminder records are never changed.' using errcode = '42501';
end $$;
revoke all on function private.block_reminder_change() from public, anon, authenticated;
create trigger block_change before update on public.reminder_runs for each row execute function private.block_reminder_change();
create trigger block_change before update on public.reminders_sent for each row execute function private.block_reminder_change();
create trigger block_change before update on public.reminder_deliveries for each row execute function private.block_reminder_change();

-- Read: Super Admin and Centre Admin. Nobody adds rows directly; only the
-- two functions below do.
revoke insert, update on public.reminder_runs, public.reminders_sent, public.reminder_deliveries from authenticated;
create policy reminder_runs_read on public.reminder_runs for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy reminders_sent_read on public.reminders_sent for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));
create policy reminder_deliveries_read on public.reminder_deliveries for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));

-- Who may run the reminders: a signed-in Super Admin (the button), or the
-- timer with its key. Returns 'button' or 'timer'; refuses everyone else.
create function private.reminder_caller(p_key text) returns text
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_key is not null then
    if private.is_reminder_timer_key(p_key) then return 'timer'; end if;
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if private.has_role('super_admin') then return 'button'; end if;
  raise exception 'Only a Super Admin can run the reminders.' using errcode = '42501';
end $$;
revoke all on function private.reminder_caller(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Run today's reminders: find what has reached a stage and was not reminded
-- yet, remember it, and return it with the admins to email. Running twice
-- in a day finds nothing new the second time.
create function public.run_reminders(p_key text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  how    text := private.reminder_caller(p_key);
  today  date := private.today_in_dublin();
  run    bigint;
  items  jsonb;
  people jsonb;
begin
  insert into public.reminder_runs (run_on, trigger) values (today, how) returning id into run;

  with due as (
    select rr.source, rr.record_id, rr.due_on, rr.category,
           public.reminder_stage(rr.due_on - today) as stage,
           case when rr.source = 'vetting' then 'Garda vetting for 1 person' else rr.title end as email_title
    from public.renewals_register rr
    where rr.status in ('due', 'ok') and rr.due_on is not null
  ), claimed as (
    insert into public.reminders_sent (run_id, source, record_id, due_on, stage, email_title, category)
    select run, d.source, d.record_id, d.due_on, d.stage, d.email_title, d.category
    from due d where d.stage is not null
    on conflict on constraint reminders_sent_once do nothing
    returning source, record_id, due_on, stage, email_title, category
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'source', c.source, 'record_id', c.record_id, 'title', c.email_title, 'category', c.category,
           'due_on', c.due_on, 'stage', c.stage, 'days_left', c.due_on - today)
         order by c.due_on, c.email_title), '[]'::jsonb)
  into items from claimed c;

  if jsonb_array_length(items) > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.display_name, 'email', au.email)
             order by u.display_name), '[]'::jsonb)
    into people
    from public.app_users u
    join public.roles r on r.code = u.role
    join auth.users au on au.id = u.id
    where u.active and r.active and u.role in ('super_admin', 'centre_admin') and au.email is not null;
  else
    people := '[]'::jsonb;
  end if;

  return jsonb_build_object('run_id', run, 'run_on', today, 'trigger', how, 'items', items, 'recipients', people);
end $$;
revoke all on function public.run_reminders(text) from public, anon, authenticated;
grant execute on function public.run_reminders(text) to anon, authenticated, service_role;

-- Write down what happened to each email of a run, once. Same callers as
-- run_reminders; the timer may only record its own runs, the button its own.
create function public.record_reminder_deliveries(p_run_id bigint, p_outcomes jsonb, p_key text default null)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  how   text := private.reminder_caller(p_key);
  r     public.reminder_runs;
  o     jsonb;
  added integer := 0;
begin
  select * into r from public.reminder_runs where id = p_run_id;
  if r.id is null then
    raise exception 'That run does not exist.' using errcode = '22023';
  end if;
  if r.trigger <> how or (how = 'button' and r.created_by is distinct from auth.uid()) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  if r.run_on <> private.today_in_dublin() then
    raise exception 'Only today''s run can be recorded.' using errcode = '22023';
  end if;
  if exists (select 1 from public.reminder_deliveries d where d.run_id = p_run_id) then
    raise exception 'This run is already recorded.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.reminders_sent s where s.run_id = p_run_id) then
    raise exception 'This run had nothing to send.' using errcode = '22023';
  end if;
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' or jsonb_array_length(p_outcomes) = 0 then
    raise exception 'List what happened to each email.' using errcode = '22023';
  end if;

  for o in select * from jsonb_array_elements(p_outcomes) loop
    if not exists (
      select 1 from public.app_users u join public.roles ro on ro.code = u.role
      where u.id = (o ->> 'recipient_id')::uuid and u.active and ro.active and u.role in ('super_admin', 'centre_admin')
    ) then
      raise exception 'Reminders go only to switched-on Super Admins and Centre Admins.' using errcode = '22023';
    end if;
    insert into public.reminder_deliveries (run_id, recipient_id, outcome, detail)
    values (p_run_id, (o ->> 'recipient_id')::uuid, o ->> 'outcome', nullif(left(o ->> 'detail', 300), ''));
    added := added + 1;
  end loop;
  return added;
end $$;
revoke all on function public.record_reminder_deliveries(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_reminder_deliveries(bigint, jsonb, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The security report: signed-out visitors may run exactly these two
-- functions (owner's decision, 17 Nov 2026), and nothing else.
create or replace function public.security_problems()
returns table (object_kind text, object_name text, problem text)
language sql stable security definer set search_path = '' as $$
  -- Views must apply the reader's own access rules.
  select 'view', c.relname::text, 'does not apply the reader''s own access rules'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v', 'm')
    and (c.relkind = 'm' or not exists (
      select 1 from pg_catalog.unnest(coalesce(c.reloptions, '{}'::text[])) o
      where o in ('security_invoker=true', 'security_invoker=on', 'security_invoker=1')))
  union all
  -- Signed-out visitors must not reach any table or view.
  select 'anon_access', c.relname::text, 'signed-out visitors have access'
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
    and pg_catalog.has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
  union all
  -- ... or any database function, except the daily reminder timer's two,
  -- which do nothing without its secret key.
  select 'function_open', n.nspname || '.' || p.proname, 'signed-out visitors can run it'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    and not (n.nspname = 'public'
             and p.oid in ('public.run_reminders(text)'::pg_catalog.regprocedure,
                           'public.record_reminder_deliveries(bigint, jsonb, text)'::pg_catalog.regprocedure))
  union all
  -- Functions with the owner's rights must fix where they look things up.
  select 'function_search_path', n.nspname || '.' || p.proname, 'runs with the owner''s rights but does not fix search_path'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
    and not exists (select 1 from pg_catalog.unnest(coalesce(p.proconfig, '{}'::text[])) cfg where cfg like 'search_path=%')
  union all
  -- No rule may depend on a setting that could be switched on by hand.
  select 'setting_flag', n.nspname || '.' || p.proname, 'relies on a setting that could be switched on by hand'
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosrc ~* 'current_setting\s*\(\s*''icci\.'
  union all
  -- Access rules must check the role once per search, not once per row.
  select 'policy_per_row', pol.schemaname || '.' || pol.tablename || '.' || pol.policyname,
         'checks the role or the signed-in person once for every row'
  from pg_catalog.pg_policies pol
  where pol.schemaname in ('public', 'storage')
    and pg_catalog.regexp_replace(coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''),
          '\( SELECT (private\.has_role|private\.current_app_role|auth\.uid)\(', '', 'g')
        ~ '(private\.has_role|private\.current_app_role|auth\.uid)\('
  union all
  -- No file store may be public.
  select 'public_bucket', b.id::text, 'files can be opened without signing in'
  from storage.buckets b
  where b.public
$$;
revoke all on function public.security_problems() from public, anon, authenticated;
grant execute on function public.security_problems() to service_role;
