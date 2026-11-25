-- 0047 (slice A3, owner approved 25 Nov 2026): three rules made exact.
--
--   * A stocktake shelf difference cannot be approved on top of a newer count.
--     Before, a shelf counted at 3 after the stocktake was sent (expected 10,
--     found 2) became 0 on approval: the shortfall was applied twice. Now the
--     approver is told the newer count stands and rejects the difference.
--     Restocks since are still kept, as before.
--   * A disposal that was rejected after the stocktake was sent no longer
--     makes an asset difference "out of date": the asset never changed.
--   * A library loan can be closed as lost only by marking the copy lost (so
--     the copy is never "available" while its loan says lost), and "returned
--     by mistake" re-checks the 3-book limit and that the borrower is on.
--
-- Only the two checking functions change; nothing is added, changed or
-- deleted in any table.

create or replace function private.check_stocktake_difference() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  st        public.stocktakes%rowtype;
  st_status text;
  st_xmin   xid;
  it        public.items%rowtype;
begin
  if tg_op = 'INSERT' then
    select s.status, s.xmin into st_status, st_xmin from public.stocktakes s where s.id = new.stocktake_id;
    if st_status is distinct from 'submitted' or not private.written_in_this_transaction(st_xmin) then
      raise exception 'Differences are worked out by the database when a stocktake is sent for approval.';
    end if;
    new.status := 'pending';
    new.decided_by := null;
    new.decided_at := null;
    new.decision_note := null;
    new.found_condition := null;
    return new;
  end if;

  -- UPDATE: only a decision on a pending difference.
  if old.status <> 'pending' then
    raise exception 'This difference has already been decided. A decision is final.';
  end if;
  if new.stocktake_id is distinct from old.stocktake_id or new.item_id is distinct from old.item_id
     or new.kind is distinct from old.kind or new.expected_location_id is distinct from old.expected_location_id
     or new.expected_quantity is distinct from old.expected_quantity or new.found_quantity is distinct from old.found_quantity then
    raise exception 'Only the decision on a stocktake difference can be filled in.';
  end if;
  if new.status not in ('approved', 'rejected') then
    raise exception 'A difference can only be approved or rejected.';
  end if;
  if auth.uid() is null then
    raise exception 'A difference must be approved or rejected by a signed-in admin.';
  end if;
  select * into st from public.stocktakes s where s.id = old.stocktake_id;
  if auth.uid() = st.created_by or auth.uid() = st.submitted_by or auth.uid() = old.created_by
     or exists (select 1 from public.stocktake_scans sc where sc.stocktake_id = st.id and sc.created_by = auth.uid()) then
    raise exception 'A different admin must approve or reject this difference. Nobody can decide on a stocktake they took part in.';
  end if;
  new.decision_note := nullif(trim(coalesce(new.decision_note, '')), '');

  if new.status = 'rejected' then
    if new.decision_note is null then
      raise exception 'Rejecting a difference needs a reason.';
    end if;
    new.found_condition := null;
  else
    if old.kind = 'found' then
      if new.found_condition is null or new.found_condition not in ('good', 'fair') then
        raise exception 'Say whether the asset is in good or fair condition now.';
      end if;
    elsif new.found_condition is not null then
      raise exception 'Only a "found" difference takes a condition.';
    end if;

    -- A3: a shelf difference must not be put on top of a newer count. If the
    -- shelf was counted again (or an entry corrected) after the stocktake was
    -- sent, that newer number stands; the old shortfall would be counted twice.
    if old.kind = 'quantity' then
      perform 1 from public.items i where i.id = old.item_id for update;
      if exists (select 1 from public.stock_movements m
                 where m.item_id = old.item_id
                   and ((m.kind = 'count' and m.created_at > st.submitted_at)
                        or (m.kind = 'adjustment' and m.status = 'approved' and m.decided_at > st.submitted_at))) then
        raise exception 'This shelf was counted again after the stocktake was sent, so that newer count stands. Reject this difference with a reason.';
      end if;
    end if;

    -- Fix 2: an asset difference must still match the asset as it is now.
    if old.kind <> 'quantity' then
      select * into it from public.items i where i.id = old.item_id for update;
      if exists (select 1 from public.asset_events e where e.item_id = it.id and e.status = 'pending') then
        raise exception 'A disposal of this asset is waiting for approval. Decide the disposal first, or reject this difference with a reason.';
      end if;
      if it.condition = 'disposed'
         or it.location_id is distinct from old.expected_location_id
         or ((old.kind = 'found') <> (it.condition = 'missing'))
         or exists (select 1 from public.asset_events e
                    where e.item_id = it.id and e.created_at > st.submitted_at
                      -- A3: a disposal rejected since did not change the asset.
                      and e.status <> 'rejected') then
        raise exception 'This asset has changed since the stocktake was sent (it was moved, reported or found). Reject this difference with a reason, then check the asset.';
      end if;
    end if;
  end if;
  new.decided_by := auth.uid();
  new.decided_at := now();
  return new;
end $$;

create or replace function private.check_library_loan_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  today   date := private.today_in_dublin();
  ln      public.library_loans%rowtype;
  latest  public.library_loan_entries%rowtype;
begin
  select * into ln from public.library_loans l where l.id = new.loan_id;
  if ln.id is null then
    raise exception 'That loan could not be found.';
  end if;
  perform private.lock_library_copy(ln.copy_id);

  if auth.uid() is not null then
    new.happened_on := today;
  end if;
  if new.happened_on > today or new.happened_on < ln.lent_on then
    raise exception 'The date must be between the day the book was lent and today.';
  end if;

  if new.kind = 'returned' then
    if not private.library_loan_is_open(ln.id) then
      raise exception 'This book is not on loan, so it cannot be returned.';
    end if;

  elsif new.kind = 'lost' then
    if not private.library_loan_is_open(ln.id) then
      raise exception 'This book is not on loan, so it cannot be marked lost from the loan.';
    end if;
    -- A3: only marking the copy lost may close a loan as lost (that entry
    -- is added by the copy entry's own check, one level down), so the loan
    -- and the copy always agree.
    if pg_trigger_depth() < 2 then
      raise exception 'Mark the copy lost instead: that closes the loan too, so the book and the loan always agree.';
    end if;

  elsif new.kind = 'due_moved' then
    if not private.library_loan_is_open(ln.id) then
      raise exception 'This loan has been returned; its due date cannot be moved.';
    end if;
    if new.new_due_on < ln.lent_on or (auth.uid() is not null and new.new_due_on < today) then
      raise exception 'The new due date cannot be in the past.';
    end if;
    if new.new_due_on > today + 365 then
      raise exception 'The new due date cannot be more than a year away.';
    end if;

  elsif new.kind = 'return_undone' then
    select * into latest from public.library_loan_entries e
    where e.loan_id = ln.id and e.kind in ('returned', 'return_undone', 'lost')
    order by e.id desc limit 1;
    if latest.id is null or latest.kind <> 'returned' then
      raise exception 'This loan has not been returned, so there is no return to cancel.';
    end if;
    if new.undoes_entry_id is distinct from latest.id then
      raise exception 'A "returned by mistake" entry must point at this loan''s latest return.';
    end if;
    if private.library_copy_state(ln.copy_id) <> 'normal' then
      raise exception 'This copy has been marked lost or withdrawn since, so the return cannot be cancelled.';
    end if;
    if private.library_copy_open_loan(ln.copy_id) is not null then
      raise exception 'This book has been lent again since, so the return cannot be cancelled. Return it from the new loan first.';
    end if;
    -- A3: putting the book back on loan obeys the same limits as lending it.
    perform private.lock_library_borrower(ln.borrower_id);
    if not exists (select 1 from public.library_borrowers b where b.id = ln.borrower_id and b.active) then
      raise exception 'This borrower has been switched off since, so the return cannot be cancelled. Switch them back on first.';
    end if;
    if private.library_books_out(ln.borrower_id) >= 3 then
      raise exception 'This borrower already has 3 books out, the most allowed, so the return cannot be cancelled.';
    end if;
  end if;
  return new;
end $$;
