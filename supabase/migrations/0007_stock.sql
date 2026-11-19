-- 0007: Stock (PLAN.md 5.1, slice 5): restock, weekly count, adjustment,
-- low-stock list.
--
-- Every stock entry is one row in stock_movements, and rows are never
-- changed or deleted. There are three kinds:
--   count       what was found on the shelf (the quantity is the number found)
--   restock     how many were added (at least one)
--   adjustment  a correction of ONE earlier count or restock: the right number
--               and a reason. It waits as "pending" until a DIFFERENT admin
--               approves or rejects it. Only the decision can ever be filled in.
--
-- The quantity on the shelf is never stored. The stock_levels view works it
-- out: the latest count, plus every restock since. An approved adjustment
-- replaces the number in the entry it corrects (the original row stays).

create table public.stock_movements (
  id            bigint generated always as identity primary key,
  item_id       uuid not null references public.items (id),
  kind          text not null check (kind in ('count', 'restock', 'adjustment')),
  quantity      integer not null check (quantity >= 0 and quantity <= 1000000),
  corrects_id   bigint references public.stock_movements (id),
  reason        text check (length(reason) <= 1000),
  status        text not null check (status in ('recorded', 'pending', 'approved', 'rejected')),
  decided_by    uuid references auth.users (id),
  decided_at    timestamptz,
  decision_note text check (length(decision_note) <= 1000),
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id),
  updated_at    timestamptz not null default now()
);
-- The status is filled in by the rules below, never chosen by the person entering.

call private.add_standard_safeguards('stock_movements', 'id');

create index stock_movements_item on public.stock_movements (item_id, kind, id);
create index stock_movements_corrects on public.stock_movements (corrects_id);
create index stock_movements_pending on public.stock_movements (status) where status = 'pending';
-- Only one correction of an entry may wait for approval at a time.
create unique index stock_movements_one_pending_per_entry on public.stock_movements (corrects_id)
  where status = 'pending';

-- The number an entry counts for now: the latest approved correction, or the
-- number entered if it was never corrected.
create function private.effective_quantity(p_movement_id bigint) returns integer
language sql stable set search_path = '' as $$
  select coalesce(
    (select a.quantity from public.stock_movements a
     where a.corrects_id = m.id and a.kind = 'adjustment' and a.status = 'approved'
     order by a.decided_at desc, a.id desc limit 1),
    m.quantity)
  from public.stock_movements m where m.id = p_movement_id
$$;
revoke all on function private.effective_quantity(bigint) from public;
grant execute on function private.effective_quantity(bigint) to authenticated, service_role;

create function private.check_stock_movement() returns trigger
language plpgsql set search_path = '' as $$
declare
  item_kind   text;
  target      public.stock_movements%rowtype;
begin
  if tg_op = 'INSERT' then
    select i.kind into item_kind from public.items i where i.id = new.item_id;
    if item_kind is distinct from 'consumable' then
      raise exception 'Only consumables have stock. Fixed assets are not counted.';
    end if;
    if new.decided_by is not null or new.decided_at is not null or new.decision_note is not null then
      raise exception 'A new stock entry cannot already have a decision.';
    end if;

    if new.kind in ('count', 'restock') then
      if new.status is not null and new.status <> 'recorded' then
        raise exception 'A count or restock does not need approval.';
      end if;
      new.status := 'recorded';
      if new.corrects_id is not null or new.reason is not null then
        raise exception 'Only an adjustment has a reason and corrects an earlier entry.';
      end if;
      if new.kind = 'restock' and new.quantity < 1 then
        raise exception 'A restock must add at least one.';
      end if;
    else
      if new.status is not null and new.status <> 'pending' then
        raise exception 'A new adjustment always waits for approval by a different admin.';
      end if;
      new.status := 'pending';
      new.reason := nullif(trim(coalesce(new.reason, '')), '');
      if new.reason is null then
        raise exception 'An adjustment needs a reason.';
      end if;
      if new.corrects_id is null then
        raise exception 'An adjustment must say which entry it corrects.';
      end if;
      select * into target from public.stock_movements m where m.id = new.corrects_id;
      if target.id is null or target.item_id <> new.item_id then
        raise exception 'An adjustment must correct an entry for the same item.';
      end if;
      if target.kind not in ('count', 'restock') then
        raise exception 'Only a count or a restock can be corrected. Correct the original entry instead.';
      end if;
      if new.quantity = private.effective_quantity(target.id) then
        raise exception 'That entry already says %. Enter the number it should have been.', new.quantity;
      end if;
    end if;
    return new;
  end if;

  -- UPDATE: only a decision on a pending adjustment.
  if old.kind <> 'adjustment' then
    raise exception 'Stock entries cannot be changed. If one is wrong, enter a correction.';
  end if;
  if old.status <> 'pending' then
    raise exception 'This adjustment has already been decided. A decision is final.';
  end if;
  if new.item_id is distinct from old.item_id or new.kind is distinct from old.kind
     or new.quantity is distinct from old.quantity or new.corrects_id is distinct from old.corrects_id
     or new.reason is distinct from old.reason then
    raise exception 'Only the decision on an adjustment can be filled in.';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'An adjustment can only be approved or rejected.';
  end if;
  if auth.uid() is null then
    raise exception 'An adjustment must be approved or rejected by a signed-in admin.';
  end if;
  if auth.uid() = old.created_by then
    raise exception 'A different admin must approve or reject this adjustment. Nobody can decide on their own entry.';
  end if;
  new.decision_note := nullif(trim(coalesce(new.decision_note, '')), '');
  if new.status = 'rejected' and new.decision_note is null then
    raise exception 'Rejecting an adjustment needs a reason.';
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;

-- Runs before the "stamp_record" trigger (triggers run in name order).
create trigger check_stock_movement before insert or update on public.stock_movements
  for each row execute function private.check_stock_movement();

-- ---------------------------------------------------------------------------
-- Row-level security: only super_admin and centre_admin. Finance, the library
-- operator and signed-out visitors cannot read or change stock (PLAN.md 5.1).
create policy stock_movements_read on public.stock_movements for select to authenticated
  using (private.has_role('super_admin', 'centre_admin'));
create policy stock_movements_add on public.stock_movements for insert to authenticated
  with check (private.has_role('super_admin', 'centre_admin'));
create policy stock_movements_decide on public.stock_movements for update to authenticated
  using (private.has_role('super_admin', 'centre_admin') and kind = 'adjustment' and status = 'pending')
  with check (private.has_role('super_admin', 'centre_admin'));

-- ---------------------------------------------------------------------------
-- Stock levels: one row per consumable, worked out from the entries.
-- "security_invoker" means the reader's own rules apply: finance and
-- signed-out visitors see no rows, because they cannot see items or entries.
create view public.stock_levels with (security_invoker = true) as
with eff as (
  select m.id, m.item_id, m.kind, m.created_at,
    coalesce(
      (select a.quantity from public.stock_movements a
       where a.corrects_id = m.id and a.kind = 'adjustment' and a.status = 'approved'
       order by a.decided_at desc, a.id desc limit 1),
      m.quantity) as qty
  from public.stock_movements m
  where m.kind in ('count', 'restock')
),
counts as (
  select e.item_id, e.id, e.qty, e.created_at,
    row_number() over (partition by e.item_id order by e.id desc) as rn
  from eff e where e.kind = 'count'
),
calc as (
  select i.id as item_id, i.name, i.label_serial, i.location_id, i.unit, i.minimum_level,
    lc.created_at as last_counted_at,
    pc.created_at as previous_counted_at,
    (lc.qty + coalesce((select sum(e.qty) from eff e
                        where e.item_id = i.id and e.kind = 'restock' and e.id > lc.id), 0))::integer as quantity,
    case when pc.id is not null then
      (pc.qty + coalesce((select sum(e.qty) from eff e
                          where e.item_id = i.id and e.kind = 'restock' and e.id > pc.id and e.id < lc.id), 0)
       - lc.qty)::integer
    end as usage_since_previous_count
  from public.items i
  left join counts lc on lc.item_id = i.id and lc.rn = 1
  left join counts pc on pc.item_id = i.id and pc.rn = 2
  where i.kind = 'consumable'
)
select c.*,
  case
    when c.quantity is null then 'not_counted'
    when c.quantity = 0 then 'out'
    when c.quantity <= c.minimum_level then 'low'
    else 'in_stock'
  end as status
from calc c;

revoke all on public.stock_levels from anon, public;
grant select on public.stock_levels to authenticated, service_role;
