-- 0048 (slice A4, owner approved 25 Nov 2026): one "Report a problem".
--
-- The item page had two buttons, "Report damage" and "Report a problem".
-- The owner chose one: "Report a problem" with a tick "It is broken or
-- damaged". With the tick, two things are recorded together, or neither:
--   1. a damage entry on the asset (it is then marked damaged), with the
--      same words and the same reporter, and
--   2. the maintenance ticket, linked to that damage entry (the link that
--      already exists since 0033, so closing the ticket can mark it repaired).
-- Without the tick, only the ticket is recorded, exactly as before.
--
-- The function runs with the caller's own rights (security invoker): every
-- existing rule on asset entries and tickets still applies (who may report,
-- no consumables, no disposed assets, no switched-off places, an asset
-- already marked damaged cannot be marked damaged again). Nothing is
-- changed or deleted.

create function public.report_problem(
  p_item_id               uuid,
  p_location_id           uuid,
  p_description           text,
  p_priority              text,
  p_reported_by           text,
  p_reported_by_person_id uuid,
  p_photo_path            text,
  p_mark_damaged          boolean
) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare
  damage_id bigint;
  ticket_id bigint;
begin
  if p_mark_damaged then
    if p_item_id is null then
      raise exception 'Only an asset can be marked broken or damaged. Pick the asset, or leave the tick off.';
    end if;
    insert into public.asset_events (item_id, kind, note, reported_by, reported_by_person_id)
    values (p_item_id, 'damage', p_description, p_reported_by, p_reported_by_person_id)
    returning id into damage_id;
  end if;

  insert into public.maintenance_tickets
    (item_id, location_id, description, priority, reported_by, reported_by_person_id, photo_path, asset_event_id)
  values
    (p_item_id, p_location_id, p_description, coalesce(p_priority, 'normal'), p_reported_by, p_reported_by_person_id, p_photo_path, damage_id)
  returning id into ticket_id;

  return ticket_id;
end $$;

revoke all on function public.report_problem(uuid, uuid, text, text, text, uuid, text, boolean) from public, anon;
grant execute on function public.report_problem(uuid, uuid, text, text, text, uuid, text, boolean) to authenticated;
