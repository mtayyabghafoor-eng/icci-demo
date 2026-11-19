# Phase 4: lending library, build plan

Written 19 November 2026, after Phase 3 was finished. This is a plan, not a
decision. Every item marked **to confirm** needs the owner's answer before
that slice starts (see "Questions for the owner" at the end). It follows
`docs/PLAN.md` section 5.4 and every rule in `CLAUDE.md`.

What PLAN.md asks for: one record and one QR label per copy; add a book by
scanning the label and the ISBN barcode, with the title and author looked up
from a public book database, or typed in by hand (Arabic titles included);
lend (scan book, pick or add a borrower, confirm the due date); return (scan
book); a borrower is a name and one contact detail only; lists of books on
loan, overdue and most borrowed. Plus a "Books overdue" card on Home
(PLAN.md 5.7) and the Library Operator role with an emailed sign-in code
(PLAN.md 3).

## 1. How the library connects to what exists

```
labels (ICCI-000123, printed by an admin)
   |
   +-- an item  (Phase 1, unchanged)
   +-- a book copy (new)  --> book (title, author, ISBN)
                 |
                 +-- loans --> borrower (name + one contact)
                 |     +-- loan entries (returned, due date moved, lost)
                 +-- copy entries (withdrawn, lost, found)
```

- **Labels** are reused: a printed, unused label becomes either an item or a
  book copy, never both (the database checks this). Scanning a label opens
  whichever it belongs to, so the one Scan button works everywhere
  (**to confirm**, question 2).
- **Locations, items, people, rota, tickets** are not touched. The library is
  one room; it does not need shelves in the locations tree.
- **Borrowers are not the People directory.** People are staff, imams and
  volunteers, with vetting and policies; borrowers are members of the
  public with a name and one contact detail. Keeping them apart means the
  Library Operator never sees the staff directory (**to confirm**, question 5).
- **Home** gains "Books overdue" (and "Books on loan" for admins).

## 2. Who can do what

| | Super Admin | Centre Admin | Library Operator | Finance | Signed out |
| --- | --- | --- | --- | --- | --- |
| See books, copies, loans, borrowers | yes | yes | yes | no | no |
| Add a book or copy, lend, return, move a due date | yes | yes | yes | no | no |
| Add a borrower, correct a borrower's details | yes | yes | yes | no | no |
| Mark a copy lost or withdrawn | yes | yes | yes (**to confirm**, q. 7) | no | no |
| Print labels | yes | yes | no | no | no |
| See anything outside the library | yes | yes | **no** | (as today) | no |

- The Library Operator sees the Library menu, Scan and their own Home with
  library cards only. Every other screen already shows "cannot see" for this
  role; the database rules already give it nothing, and the tests prove it.
- Finance sees nothing in the library (least access; the Board report in
  Phase 5 will get library counts through its own report, not the tables).
- There are no approvals in the library, so "nobody approves their own entry"
  has nothing to act on here. If question 7 is answered "a lost book needs a
  second person", that rule applies and is enforced in the database.

## 3. Rules every new table follows (same as Phases 1 to 3)

- Created with `private.add_standard_safeguards`: row-level security on, no
  access for signed-out visitors, deleting blocked (even for the master key),
  who/when filled in by the database, every change written to the audit log,
  record numbers locked, `security_problems()` left empty.
- Tests written first for: Super Admin, Centre Admin, Library Operator,
  Finance, a switched-off account, a half-finished sign-in, and a signed-out
  visitor.
- History is never changed: a loan is never edited. Returning it, moving its
  due date or marking it lost is a new entry linked to the loan. "On loan",
  "overdue" and "available" are worked out from those entries, the way stock
  is worked out from movements.
- Mistakes are corrected with a new linked entry (for example "returned by
  mistake, still on loan").
- Migration numbers: Phase 3 ended at `0033`. Phase 4 starts at `0034`.

## 4. Database tables

**library_books**: one per title and edition.
- title (any language, Arabic included), author, ISBN (optional, 10 or 13
  digits, checked; unique when present), publisher and year (optional),
  language (English, Arabic, other), how it was entered (looked up or typed),
  active switch.
- Details can be corrected (the audit log keeps the old values). The ISBN
  cannot be changed once a copy is lent; a wrong ISBN means a new book record.

**library_copies**: one per physical book, one label each.
- book, label number (unique; must not be on an item), optional short
  "copy note" (for example "donated, spine torn"), date added.
- Never changed except the copy note. Status is worked out: Available
  (green), On loan (amber), Overdue (red), Lost (red), Withdrawn (grey).

**library_copy_entries**: withdrawn, lost, found. Never changed or deleted.

**library_borrowers**: name, one contact detail (phone **or** email, the
kind stored beside it), active switch. Nothing else: no address, no age, no
notes box (a notes box is where personal details end up by accident).
- A name and contact can be corrected (shown in the borrower's history).
- Switching a borrower off is allowed only when they have nothing on loan.

**library_loans**: copy, borrower, date lent, first due date, lent by.
Never changed or deleted.
- The database refuses a second open loan for the same copy, a loan of a
  lost or withdrawn copy, a loan to a switched-off borrower, and (if
  question 4 says so) more than the loan limit.

**library_loan_entries**: returned, due date moved (with the new date),
lost while on loan, "returned by mistake" (links back to the wrong return).
Never changed or deleted. The current due date is the latest "moved" entry,
or the first due date.

**Database functions** (each checks the role and refuses signed-out
visitors): `lend_copy`, `return_copy`, `move_due_date`, `mark_copy`
(lost/withdrawn/found), `add_book_and_copy`, and a read-only
`library_counters` for Home. Lending and returning lock the copy so two
people scanning at once cannot both succeed.

## 5. Looking up a book from its ISBN

- The website's server (not the phone) asks the public book database for the
  ISBN and fills in title, author, publisher and year for the operator to
  check before saving. Only the ISBN number is sent: no names, no borrower
  details, nothing about the Centre.
- Recommended service: **Open Library** (run by the Internet Archive, free,
  no account, no key). It is weaker on Arabic books; when it finds nothing,
  the screen says so and opens the typed form with the ISBN filled in.
  (**to confirm**, question 1.)
- If the service is slow (more than 5 seconds) or down, the operator types
  the details; adding a book never depends on it.
- Cover pictures are not fetched (they would load from another website on
  every visit). Can be added later.

**Reading the ISBN barcode.** The QR label opens in the phone's own camera
app, as today. The ISBN is a different kind of barcode (the striped one on
the back cover) that the phone camera app does not hand to a website.
Options (**to confirm**, question 3):
- A. Type the 13 digits (works on every phone, no new dependency), plus the
  camera button on phones whose browser can read barcodes itself (Chrome on
  Android). iPhones type the number.
- B. Add a small, free, widely used barcode-reading library (ZXing) so the
  camera button works on iPhones too. This is a new dependency.

## 6. Screens

All library screens are phone-first (buttons at least 44 pixels, three fields
or fewer, camera in one tap), except the lists, which are PC-first.

1. **Library** (menu): search by title, author or ISBN; filters Available,
   On loan, Overdue, Lost; buttons "Add a book", "Lend", "Return".
2. **Scanning a label** opens the copy page with the right big button:
   "Lend this book" if available, "Return this book" if on loan. An unused
   label offers "Register an item" (admins) and "Add a book" (both).
3. **Add a book**: step 1 label (from the scan), step 2 ISBN (camera or
   type), step 3 check the looked-up details or type them (title, author,
   language). "Another copy of a book we have" skips step 3.
4. **Lend**: scan book, then pick a borrower (search by name) or "New
   borrower" (name, phone or email), then confirm the due date (filled in,
   can be changed). Shows the borrower's books already out.
5. **Return**: scan book, one button. Overdue returns show how many days late
   (for information only: no fines).
6. **Book page**: details, its copies and their status, loan history.
7. **Borrower page**: name, contact, books out now, past loans; Correct
   details; Switch off.
8. **Lists**: On loan (due date order), Overdue (most overdue first, with
   the borrower's contact to call), Most borrowed (last 12 months, or a
   chosen period). CSV download for admins only.
9. **Home**: "Books overdue" card (red when above zero, amber when books are
   due in the next three days). The Library Operator's Home shows only
   library cards.

## 7. Library Operator sign-in (emailed code)

- The operator types their email address and receives a six-digit code; no
  password, no authenticator app (PLAN.md 3). Idle sign-out after 15 minutes
  as for everyone.
- The database rule that today blocks this role completely
  (`private.current_app_role`, migration 0005) learns to accept an emailed
  code sign-in, but only for roles marked "email_code". An admin cannot use
  an emailed code to skip their authenticator: the database checks how the
  person signed in, not just who they are.
- **Sending the email**: Supabase's built-in email works for the prototype
  but only delivers to the project's own team addresses and a few emails an
  hour. Real use needs the Resend account already planned for reminders,
  connected to Supabase as its mail sender (**to confirm**, question 6).
- **Built in P4.1 (19 Nov 2026)**: codes are 6 digits and last 10 minutes
  (sent to icci-dev). The email wording that shows the code
  (`supabase/templates/library-sign-in-code.html`) could NOT be sent:
  Supabase refuses email wording changes on the free plan with its
  built-in email. It is switched on together with Resend, before real use;
  until then Supabase's standard email would contain a link, not a code.
  The database now also requires the password for admins: before P4.1, an
  emailed code plus the authenticator app (no password) was accepted.
- **Tests do not need email**: the test script asks Supabase directly for a
  code for the made-up operator account (`@icci-prototype.test`), the way
  authenticator codes are made today.
- **Creating the operator's account**: there is no accounts screen yet (audit
  fix 4 waits for it). For the prototype the seed creates the made-up
  operator account, as it already does. The real accounts screen is needed
  before any real person gets an account, for every role.

## 8. Slice order

1. **P4.1 Library Operator sign-in**: emailed-code sign-in screen; database
   accepts it for that role only; operator's menu and Home; tests that the
   operator still sees nothing outside the library, and that an admin
   cannot sign in with an emailed code.
2. **P4.2 Books and copies**: tables, Add a book typed by hand (Arabic
   included), Library list, Book page, scanning a label opens a copy.
   Seed: about 60 made-up books (English and Arabic, obviously fictional
   titles and authors), about 90 copies.
3. **P4.3 ISBN look-up**: Open Library from the server, ISBN typing and the
   camera button (option A or B from question 3).
4. **P4.4 Borrowers, lend and return**: borrower tables and pages, Lend,
   Return, move the due date, "returned by mistake". Seed: about 25 made-up
   borrowers with fake contact details (phone numbers with area code 00,
   which does not exist in Ireland, as the People seed already does;
   emails at `@icci-prototype.test`), loans in every state.
   **Built 19 Nov 2026** (migration 0037). Also decided while building:
   a copy of a switched-off book cannot be lent; "returned by mistake"
   is refused once the copy has been lent to someone else; the
   operator always lends "today" (only the seed can record past loans).
5. **P4.5 Lists and Home**: On loan, Overdue, Most borrowed, CSV, lost and
   withdrawn copies, the Home cards.
   **Built 19 Nov 2026** (migration 0038). Also decided while building:
   a lost book that was on loan ends its loan (the borrower no longer has
   it out) and "found" does not reopen it; a withdrawn copy cannot be on
   loan, found, or lent again; a lost copy can be withdrawn (written off);
   the Library Operator gets a clear "no" (403) on CSV addresses, not
   "please sign in"; the Home card is red when overdue, amber when due
   within 3 days, else green.

## 9. Phase 4 acceptance checks (proposed)

- A new copy can be added in under a minute on a phone, with a looked-up
  ISBN or typed by hand in Arabic.
- Lend takes three taps after the scan for an existing borrower; Return
  takes one.
- A copy can never be on loan twice, even with two phones scanning at once.
- The Library Operator cannot read or change anything outside the library,
  proved by tests for every table; Finance and signed-out visitors cannot
  read the library.
- Nothing in the library can be deleted; every change is in the audit log.
- The full test suite passes, with screenshots of each new screen in
  `docs/screens/`.

## 10. Privacy points to settle with ICCI before real data

- Borrowers are members of the public: ICCI's privacy notice must mention
  the library (what is kept, why, for how long).
- **How long to keep a borrower** after their last loan (suggest 2 years).
  Because nothing is ever deleted and the audit log keeps old values,
  clearing a contact later still leaves it in the audit log. ICCI should
  decide the retention rule before real borrowers are added, so it can be
  designed in (for example, the audit log stores no borrower contact
  details at all).
- **Children** are out of scope (PLAN.md 2). Recommend: borrowers are
  adults; a child's book is lent to their parent (**to confirm**,
  question 8).

## 11. Questions for the owner

**Decided 19 November 2026: the owner approved every recommended answer
below.** Question 3 (option A now, option B decided after trying it in the
library) and question 6 (Resend before real use) come back later.

1. **Book look-up service.** Recommend **Open Library** (free, no account,
   only the ISBN is sent). Alternatives: Google Books (needs a Google key);
   no look-up, type everything.
2. **Labels for books.** Recommend **the same ICCI-000123 labels as items**,
   printed by an admin (one series, one Scan button). Alternative: a
   separate book series (for example ICCI-B00123) on its own label sheets.
3. **Reading the ISBN barcode.** Recommend **A: type the number, camera on
   Android only** (no new dependency) for the prototype, then decide on B
   after trying it in the library. Alternative: B now (ZXing library, works
   on iPhones too).
4. **Loans.** Recommend **21 days** by default, **up to 3 books** per
   borrower, **no fines**. Alternatives: 14 days; no limit.
5. **Borrowers separate from the People directory.** Recommend **yes,
   separate** (the operator never sees staff records). Alternative: staff
   who borrow are picked from People (the operator would then see names
   from the directory).
6. **Emailed codes.** Recommend **Supabase's built-in email for the
   prototype**, then Resend before real use (same account as reminders).
7. **Lost books.** Recommend **the operator can mark a copy lost on their
   own** (books are low value; it is in the audit log). Alternative: a
   different admin must confirm, like disposals.
8. **Children.** Recommend **adult borrowers only**; children borrow
   through a parent.
9. **Overdue reminders to borrowers.** Recommend **none in Phase 4**: the
   Overdue list shows the contact to phone. Emailing borrowers would need a
   privacy decision and the Resend account.
