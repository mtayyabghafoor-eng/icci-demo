-- 0009: Label sheet printing (PLAN.md 5.1 "a printable sheet of the next N
-- labels", slice 7).
--
-- New label numbers are handed out ONLY by print_new_labels: the next N
-- numbers after the highest label that exists, one after the other. A lock
-- makes two admins printing at the same moment wait in turn, so a number is
-- never handed out twice. Labels can no longer be added one by one.
--
-- Every sheet is a print run: first and last number, who and when. Runs are
-- never changed or deleted. "Print again" (reprint_labels) records a new run
-- for the same numbers, pointing back to the original, without new labels.
--
-- Super Admin and Centre Admin only. The master key (seed script and browser
-- tests) may also hand out numbers; it is recorded as "Seed script".

create table public.label_print_runs (
  id           bigint generated always as identity primary key,
  first_number integer not null check (first_number between 1 and 999999),
  last_number  integer not null check (last_number between 1 and 999999),
  label_count  integer generated always as (last_number - first_number + 1) stored,
  reprint_of   bigint references public.label_print_runs (id),
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  check (last_number >= first_number and last_number - first_number < 210)
);
call private.add_standard_safeguards('label_print_runs', 'id');
create index label_print_runs_recent on public.label_print_runs (id desc);

-- A print run is a permanent record: nobody, not even the master key, can
-- change one.
create function private.block_print_run_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Print runs cannot be changed. To print the same labels again, use "Print again".';
end $$;
create trigger block_print_run_change before update on public.label_print_runs
  for each row execute function private.block_print_run_change();

-- Admins read runs; adding happens only through the two functions below.
revoke insert, update on public.label_print_runs from authenticated;
create policy label_print_runs_read on public.label_print_runs for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));

-- Labels: no more adding one by one (the slice 4 rule is replaced).
drop policy labels_add on public.labels;
revoke insert on public.labels from authenticated;

-- ---------------------------------------------------------------------------
-- Who may print: a signed-in Super Admin or Centre Admin (with the
-- authenticator code, which has_role already insists on), or the master key.
create function private.may_print_labels() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_role('super_admin', 'centre_admin')
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
$$;
revoke all on function private.may_print_labels() from public;

create function public.print_new_labels(p_count integer)
returns public.label_print_runs
language plpgsql security definer set search_path = '' as $$
declare
  next_no integer;
  run     public.label_print_runs;
begin
  if not private.may_print_labels() then
    raise exception 'Only a Super Admin or Centre Admin can print labels.' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 or p_count > 210 then
    raise exception 'Choose between 1 and 210 labels (210 is ten sheets).';
  end if;

  -- One at a time: anyone else printing waits here until this one is saved.
  perform pg_advisory_xact_lock(hashtext('icci.label_numbers'));

  select coalesce(max(substring(l.serial from 6)::integer), 0) + 1 into next_no from public.labels l;
  if next_no + p_count - 1 > 999999 then
    raise exception 'There are not enough label numbers left (the last one is ICCI-999999).';
  end if;

  insert into public.labels (serial)
  select 'ICCI-' || lpad(n::text, 6, '0') from generate_series(next_no, next_no + p_count - 1) as n;

  insert into public.label_print_runs (first_number, last_number)
  values (next_no, next_no + p_count - 1)
  returning * into run;
  return run;
end $$;

create function public.reprint_labels(p_run_id bigint)
returns public.label_print_runs
language plpgsql security definer set search_path = '' as $$
declare
  original public.label_print_runs;
  run      public.label_print_runs;
begin
  if not private.may_print_labels() then
    raise exception 'Only a Super Admin or Centre Admin can print labels.' using errcode = '42501';
  end if;
  select * into original from public.label_print_runs r where r.id = p_run_id;
  if original.id is null then
    raise exception 'That label sheet could not be found.';
  end if;
  insert into public.label_print_runs (first_number, last_number, reprint_of)
  values (original.first_number, original.last_number, coalesce(original.reprint_of, original.id))
  returning * into run;
  return run;
end $$;

revoke all on function public.print_new_labels(integer) from public, anon;
revoke all on function public.reprint_labels(bigint) from public, anon;
grant execute on function public.print_new_labels(integer) to authenticated, service_role;
grant execute on function public.reprint_labels(bigint) to authenticated, service_role;
