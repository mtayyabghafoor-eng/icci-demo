-- 0040: How items leave the Centre (slice P1.14, PLAN.md 5.1, owner's
-- answers of 19 Nov 2026).
--
-- Every NEW disposal picks one route:
--   charity            given to a charity: the charity's name is required
--   sold               sold: price, buyer's name, date of sale and who took
--                      the money are required (a sale record only; this is
--                      not accounting)
--   recycled, shredded, thrown_away, religious_texts (respectful disposal
--                      of religious texts): the usual note is enough
--   returned_to_owner  returned to its owner: the owner's name is required
-- A different admin still approves every disposal (migration 0008), and the
-- route and sale details can never change afterwards, not even while the
-- decision is being filled in. Disposals made before this change keep no
-- route ("route not recorded" on screen). Only disposals have a route.

alter table public.asset_events
  add column disposal_route text check (disposal_route in
    ('charity', 'sold', 'recycled', 'shredded', 'thrown_away', 'religious_texts', 'returned_to_owner')),
  -- The charity's name, or the owner's name.
  add column disposal_recipient text check (length(disposal_recipient) <= 200),
  add column sale_price_cents integer check (sale_price_cents >= 0 and sale_price_cents <= 100000000),
  add column sale_buyer text check (length(sale_buyer) <= 200),
  add column sale_date date,
  add column sale_money_taken_by text check (length(sale_money_taken_by) <= 200);

-- Runs after check_asset_event and before stamp_record (triggers run in
-- name order), on every new entry and every change.
create function private.check_disposal_route() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.disposal_route is distinct from old.disposal_route
       or new.disposal_recipient is distinct from old.disposal_recipient
       or new.sale_price_cents is distinct from old.sale_price_cents
       or new.sale_buyer is distinct from old.sale_buyer
       or new.sale_date is distinct from old.sale_date
       or new.sale_money_taken_by is distinct from old.sale_money_taken_by then
      raise exception 'How an item left cannot be changed. If it is wrong, reject the disposal and send a new one.';
    end if;
    return new;
  end if;

  new.disposal_recipient := nullif(trim(coalesce(new.disposal_recipient, '')), '');
  new.sale_buyer := nullif(trim(coalesce(new.sale_buyer, '')), '');
  new.sale_money_taken_by := nullif(trim(coalesce(new.sale_money_taken_by, '')), '');

  if new.kind <> 'disposal' then
    if new.disposal_route is not null or new.disposal_recipient is not null or new.sale_price_cents is not null
       or new.sale_buyer is not null or new.sale_date is not null or new.sale_money_taken_by is not null then
      raise exception 'Only a disposal says how the item left.';
    end if;
    return new;
  end if;

  if new.disposal_route is null then
    raise exception 'Choose how the item is leaving: charity, sold, recycled, shredded, thrown away, religious texts, or returned to owner.';
  end if;

  if new.disposal_route = 'sold' then
    if new.sale_price_cents is null then
      raise exception 'Enter the price it was sold for.';
    end if;
    if new.sale_buyer is null then
      raise exception 'Enter the buyer''s name.';
    end if;
    if new.sale_date is null then
      raise exception 'Enter the date of the sale.';
    end if;
    if new.sale_date > (now() at time zone 'Europe/Dublin')::date then
      raise exception 'The date of the sale cannot be in the future.';
    end if;
    if new.sale_money_taken_by is null then
      raise exception 'Say who took the money.';
    end if;
  elsif new.sale_price_cents is not null or new.sale_buyer is not null or new.sale_date is not null
        or new.sale_money_taken_by is not null then
    raise exception 'Sale details are only for an item that was sold.';
  end if;

  if new.disposal_route = 'charity' and new.disposal_recipient is null then
    raise exception 'Enter the name of the charity.';
  end if;
  if new.disposal_route = 'returned_to_owner' and new.disposal_recipient is null then
    raise exception 'Enter the owner''s name.';
  end if;
  if new.disposal_route not in ('charity', 'returned_to_owner') and new.disposal_recipient is not null then
    raise exception 'A name is only kept for a charity or an owner.';
  end if;
  return new;
end $$;
revoke all on function private.check_disposal_route() from public;

create trigger check_disposal_route before insert or update on public.asset_events
  for each row execute function private.check_disposal_route();
