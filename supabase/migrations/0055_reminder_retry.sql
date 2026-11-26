-- 0055: a reminder email that failed is tried again (Round C4,
-- docs/IMPROVEMENT-PLAN.md section 4, 26 Nov 2026).
--   * Before: if the email service refused or could not be reached, that
--     admin never got those reminders (each reminder is claimed once).
--   * Now: on the next run (the next morning's timer, or the Super Admin's
--     button), each admin whose last email failed gets the reminders from
--     every failed email since their last good one, beside any new ones.
--   * Only reminders still worth sending: the renewal is still in the
--     register with the same due date, not yet renewed, and not past due.
--   * What was retried is written down (reminder_retries), append-only like
--     the other reminder records. Who may run and record is unchanged.

-- ---------------------------------------------------------------------------
create table public.reminder_retries (
  id           bigint generated always as identity primary key,
  run_id       bigint not null references public.reminder_runs (id),
  recipient_id uuid not null references public.app_users (id),
  sent_id      bigint not null references public.reminders_sent (id),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  constraint reminder_retries_once unique (run_id, recipient_id, sent_id)
);
call private.add_standard_safeguards('reminder_retries', 'id');
create index reminder_retries_run on public.reminder_retries (run_id);
create trigger block_change before update on public.reminder_retries for each row execute function private.block_reminder_change();
revoke insert, update on public.reminder_retries from authenticated;
create policy reminder_retries_read on public.reminder_retries for select to authenticated
  using ((select private.has_role('super_admin', 'centre_admin')));

-- ---------------------------------------------------------------------------
-- Run today's reminders, as in 0027, plus each recipient's "retry" list.
create or replace function public.run_reminders(p_key text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  how     text := private.reminder_caller(p_key);
  today   date := private.today_in_dublin();
  run     bigint;
  items   jsonb;
  people  jsonb;
  retried integer;
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

  -- Retries: reminders from each admin's failed emails since their last good one.
  insert into public.reminder_retries (run_id, recipient_id, sent_id)
  select distinct run, u.id, s.id
  from public.app_users u
  join public.roles ro on ro.code = u.role
  join public.reminder_deliveries d on d.recipient_id = u.id and d.outcome = 'failed' and d.run_id < run
  join public.reminders_sent s on s.run_id = d.run_id
       or s.id in (select x.sent_id from public.reminder_retries x where x.run_id = d.run_id and x.recipient_id = u.id)
  join public.renewals_register rr on rr.source = s.source and rr.record_id = s.record_id and rr.due_on = s.due_on
  where u.active and ro.active and u.role in ('super_admin', 'centre_admin')
    and rr.status in ('due', 'ok') and s.due_on >= today
    and d.run_id > coalesce((
      select max(ok.run_id) from public.reminder_deliveries ok
      where ok.recipient_id = u.id and ok.outcome <> 'failed'
    ), 0)
    -- Not twice in one email: a reminder new in this run is already in it.
    and not exists (select 1 from public.reminders_sent n where n.run_id = run and n.id = s.id);
  get diagnostics retried = row_count;

  if jsonb_array_length(items) > 0 or retried > 0 then
    select coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'name', u.display_name, 'email', au.email,
             'retry', coalesce((
               select jsonb_agg(jsonb_build_object(
                        'source', s.source, 'record_id', s.record_id, 'title', s.email_title, 'category', s.category,
                        'due_on', s.due_on, 'stage', s.stage, 'days_left', s.due_on - today)
                      order by s.due_on, s.email_title)
               from public.reminder_retries x join public.reminders_sent s on s.id = x.sent_id
               where x.run_id = run and x.recipient_id = u.id
             ), '[]'::jsonb))
             order by u.display_name), '[]'::jsonb)
    into people
    from public.app_users u
    join public.roles r on r.code = u.role
    join auth.users au on au.id = u.id
    where u.active and r.active and u.role in ('super_admin', 'centre_admin') and au.email is not null
      -- On a day with only retries, only the admins who missed something.
      and (jsonb_array_length(items) > 0 or exists (select 1 from public.reminder_retries x where x.run_id = run and x.recipient_id = u.id));
  else
    people := '[]'::jsonb;
  end if;

  return jsonb_build_object('run_id', run, 'run_on', today, 'trigger', how, 'items', items, 'recipients', people);
end $$;
revoke all on function public.run_reminders(text) from public, anon, authenticated;
grant execute on function public.run_reminders(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Write down what happened to each email, as in 0027. A run with only
-- retries has something to send; on such a run, only the admins it retried for.
create or replace function public.record_reminder_deliveries(p_run_id bigint, p_outcomes jsonb, p_key text default null)
returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  how       text := private.reminder_caller(p_key);
  r         public.reminder_runs;
  o         jsonb;
  added     integer := 0;
  has_new   boolean;
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
  has_new := exists (select 1 from public.reminders_sent s where s.run_id = p_run_id);
  if not has_new and not exists (select 1 from public.reminder_retries x where x.run_id = p_run_id) then
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
    if not has_new and not exists (
      select 1 from public.reminder_retries x where x.run_id = p_run_id and x.recipient_id = (o ->> 'recipient_id')::uuid
    ) then
      raise exception 'This run had nothing to send to that admin.' using errcode = '22023';
    end if;
    insert into public.reminder_deliveries (run_id, recipient_id, outcome, detail)
    values (p_run_id, (o ->> 'recipient_id')::uuid, o ->> 'outcome', nullif(left(o ->> 'detail', 300), ''));
    added := added + 1;
  end loop;
  return added;
end $$;
revoke all on function public.record_reminder_deliveries(bigint, jsonb, text) from public, anon, authenticated;
grant execute on function public.record_reminder_deliveries(bigint, jsonb, text) to anon, authenticated, service_role;
