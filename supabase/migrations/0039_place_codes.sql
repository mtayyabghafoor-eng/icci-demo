-- 0039: Place numbers (PLAN.md 5.1, "Places and room registration", slice
-- P1.12). Owner's choices, 19 Nov 2026 (all recommended answers):
--   * Every place (building, room, store room, shelf) gets a number, shown
--     as PL-0001, for its place label. The database gives it out: it can
--     never be typed in, changed or reused, and is kept apart from item
--     label numbers (ICCI-000123) so the two can never be confused.
--   * Super Admins and Centre Admins add, rename and switch off places, as
--     before (0003). Places are never deleted; switching off is refused
--     while anything is still in them (0014, audit fix 7).
-- Places that already exist get their numbers now.

alter table public.locations
  add column code integer generated always as identity (start with 1) unique;

comment on column public.locations.code is
  'Place number, shown as PL-0001 on place labels. Given by the database; never changed or reused.';
