# Phase 5: expenses and Board report, build plan

Written 25 November 2026, after Round A was finished. Revised the same day
after three outside reviews (Gemini Neon, Argon and Carbon), each point
checked against the code and the other documents (section 2). This is a
plan, not a decision. Every item marked **to confirm** needs the owner's
answer before that slice starts (section 13). It follows `docs/PLAN.md`
section 5.5 and every rule in `CLAUDE.md`.

What PLAN.md asks for: a claim with a receipt photo, amount, date, category,
who paid, and whether the Centre paid or a person paid and is waiting to be
paid back; a different admin or Finance approves or rejects it with a reason;
a fund is chosen on approval (unrestricted, or a restricted fund such as
Zakat or Fitra); claims above an amount kept in settings need a second
approver; approved claims never change, and corrections are new linked
entries; a monthly CSV file for the bookkeeper; and a one-click Board report
PDF for a chosen month. Plus a "pending expenses" counter on Home (PLAN.md
5.7). Three things are still "to confirm" in PLAN.md: the fund list, the
second-approver amount and the bookkeeper's file format.

## 1. What my review found

1. **"Not the person who paid" has a gap.** The database can only tell
   that an admin paid if their account is linked to their record in People.
   Only a Super Admin can make that link, never on their own account. An
   unlinked admin could approve a claim for money they spent themselves
   (question 2).
2. **"Who paid" must be picked from People, not typed.** A typed name
   cannot be checked, so an admin could type their own name.
3. **Which month a claim belongs to.** Counting by the month it was approved
   means a month's file and report never change once the month is over, and
   nothing is missed or sent twice (question 7).
4. **Corrections after the file was sent** must reach the bookkeeper in the
   month the correction is approved (question 8).
5. **With three admin accounts, some claims can never be approved.** The
   second approver must not have entered the claim, paid, or given the first
   approval. Example: the Super Admin pays €600, the Centre Admin enters it.
   Finance gives the first approval and nobody is left. It is not "waiting",
   it is stuck for good (question 6). (Corrected after the reviews; my first
   draft said it would only wait.)
6. **VAT.** Irish charities can claim back part of the VAT they pay through
   a Revenue scheme, which needs the VAT amount from each invoice.
7. **Receipts can hold personal data.** See section 9 for what may and may
   not be photographed. **I am not certain** this is enough for ICCI's
   privacy notice; ICCI should confirm.
8. **Repair costs could be counted twice.** Tickets already have a "cost"
   (information only). The Board report adds up approved claims only.
9. **Finance sees almost nothing today.** Phase 5 gives Finance only what a
   claim needs, through narrow look-ups (names of switched-on people,
   company names, ticket titles), never the full lists.
10. **The Board report would show position "now"** when reprinted later. A
    frozen "final copy", like the published rota, fixes this.
11. **Demo receipts must be plainly fake**, never with a real firm's name.
12. **ICCI may already have written finance rules** (who signs, above what
    amount). The app should follow them rather than invent new ones.

## 2. What the three outside reviews added (checked)

**Confirmed, and now in this plan**

- The three-account deadlock (finding 5), also for lost receipts that always
  need two approvers. AFTERCARE.md already says **"Two Super Admins at all
  times. Never one."**, which gives ICCI at least four accounts and removes
  most deadlocks (question 6).
- **Repayments were in the wrong month.** The plan put "paid back on" in the
  approval month's file, which then changes after the month ends, while the
  month the money really left the bank never shows it. Repayments now go in
  the month they are made, in their own part of the file (section 7).
- **A correction that only changes the fund or category is a €0
  difference**, so the bookkeeper would never move the money from
  Unrestricted to Zakat. Corrections are now sent as "take out the old line,
  put in the new line" (section 7). A correction also checks the
  second-approval amount against the **new total**, not the difference.
- **A wrong repayment could never be undone.** It can now be withdrawn with
  a reason, like a Garda vetting entry.
- **Receipts arrive by WhatsApp and email**, not only from the camera.
  Today's photo button (`items/photo-input.tsx`) opens the camera, accepts
  pictures only, shrinks them to 1,600 pixels (too small for a long
  till receipt) and names every file "photo.jpg". Receipts get their own
  button: take a photo **or** choose photos or PDFs already on the device,
  kept sharp, named `EXP-0041-receipt-1.jpg`.
- **Month-end receipts**: opening 45 claims to download each receipt is too
  slow. A printable monthly receipts pack comes with the CSV in P5.5.
- **Fixing a typo**: "Enter again" now works after withdrawing as well as
  after rejection, and carries the receipt across.
- **Paid directly by the Centre** (direct debit, bank transfer) is a
  first-class choice on the form, not a footnote.
- **One repayment for several claims**: the "Awaiting repayment" list is
  grouped by person with a total, and several claims for one person can be
  marked repaid in one step with one reference.
- Smaller, all agreed: a suggested fund when entering; a duplicate warning
  (same amount and receipt date, never a block); the warning on entry when
  another admin paid; a claim from a ticket fills in the company, category,
  description and cost; the receipt shown beside the Approve buttons;
  "Save and enter another" on a PC; the "Are you sure?" sheet (from A1) on
  approve, reject, withdraw and "Make the final copy"; "New claim" on Home;
  "Awaiting repayment" on Home; Finance gets proper phone shortcuts (today
  only Home and Menu); the Board report under Overview; "During October"
  kept apart from "As at 3 November"; a warning when finalising a month that
  still has claims waiting; Board lines for claims without receipts and
  claims over the amount.
- **Gaps in the wider plan** (confirmed): Finance's access to the Asset
  register was "revisit in Phase 5" (15 Nov 2026) and I had left it out
  (question 15). The **accounts screen** (needed before any real account)
  and the **audit log screen** (PLAN.md 3) are in no plan (question 16).
  The "Current phase" note in PROGRESS.md did not mention Round A (fixed).
  Who may tag Zakat and Fitra is worth asking (question 5).

**Overstated, or I disagree**

- "One-click download of all receipts" needs a zip add-on. The printable
  pack does the same job without one, but it can only show pictures: a PDF
  receipt is listed in the pack with its claim number and downloaded on its
  own.
- "Approve all recommended answers safely" (Argon) while also listing
  changes: the changes matter, so the questions below now include them.
- Linking an expense to an item it bought (Carbon): a new feature. The
  item's own documents can already hold its invoice. Suggest later.
- iPhone HEIC photos: Safari usually hands web pages a JPEG, and the receipt
  button saves JPEG anyway. To be checked on a real iPhone, not a blocker.
- An outside bookkeeper on the Finance account "should be read-only"
  (Neon): agreed in principle, but that is a new role. Recommended: Finance
  is held by an ICCI treasurer; an outside bookkeeper gets the files, not a
  login (question 1).

## 3. What Phase 5 does not build

Out of scope in PLAN.md section 2: no fund balances or "money left in
Zakat" (that is a ledger), no donations or income, no bank reconciliation,
no budgets, no petty-cash balance, no payroll, no VAT returns, no bank or
card numbers typed in, no email to the bookkeeper. A claim records what was
spent; the bookkeeper keeps the accounts.

## 4. How expenses connect to what exists

```
claim EXP-0001 (one receipt: up to 3 files, photos or PDFs)
   |-- how paid: the Centre directly, or a person's own money
   |-- who paid: a person in People (not needed for a direct debit)
   |-- paid to: a company from Companies, or a typed name
   |-- optional: the maintenance ticket it was for (T-0042)
   |-- decisions: approved (with fund) / second approval / rejected / withdrawn
   |-- repayments (own money only; one repayment can cover several claims)
   +-- corrections (new entries that point at it, approved the same way)
```

- **Tickets**: a ticket page lists its claims and "Add an expense claim for
  this ticket" (filled in from the ticket). A closed ticket with a cost and
  no claim shows a quiet note: "The cost on a ticket is not an expense
  claim." The ticket's cost stays as information.
- **Home**: "Expenses for you to approve" joins "For you to approve";
  "Awaiting repayment" (amber) joins Needs attention; "New claim" joins the
  action tiles. Finance's Home gets its own counters instead of "Nothing for
  your role yet".
- **Menu**: Overview gains "Board report". A new "Expenses" group: Expenses
  (with tabs Waiting, Awaiting repayment, All), New claim, Monthly export.
  Super Admin and Finance also see "Expense settings".
- **Phone bottom bar for Finance**: Home, Expenses, New claim (raised),
  Waiting, Menu.

## 5. Who can do what (recommended; question 1)

| | Super Admin | Centre Admin | Finance | Library Operator | Signed out |
| --- | --- | --- | --- | --- | --- |
| Enter a claim | yes | yes | yes | no | no |
| See every claim and its receipt | yes | yes | yes | no | no |
| Approve or reject (never their own entry, never money they paid) | yes | yes | yes | no | no |
| Choose the fund, including Zakat and Fitra (question 5) | yes | yes | yes | no | no |
| Record or withdraw a repayment (never to themselves) | yes | yes | yes | no | no |
| Monthly CSV, receipts pack, Board report | yes | yes | yes | no | no |
| Asset register, read only (question 15) | yes | yes | yes | no | no |
| Change spend categories and funds | yes | no | yes | no | no |
| Change the amounts in Expense settings | yes | no | no | no | no |

Finance still cannot see or change stock, items, rota, policies or people
(PLAN.md 3). The Board report gives Finance counts only.

## 6. How a claim works (recommended)

1. **Enter.** On a phone, three short steps; on a PC, one form with "Save
   and enter another".
   - **Receipt**: take a photo or choose photos or a PDF from the device (up
     to 3 files), or tick "Receipt lost" with an explanation.
   - **What**: amount, date on the receipt, category, what it was for,
     optional VAT, optional paid to, optional ticket, optional suggested
     fund.
   - **How it was paid**, asked first in this step: *the Centre directly*
     (direct debit or bank transfer: nobody else to name; Centre card: who
     used it, from People) or *a person's own money* (who, from People,
     starting with you if your account is linked).
   - Warnings that never block: the same amount and receipt date as another
     claim ("EXP-0014 is already recorded for €45.00 on 12 Nov. Save
     anyway?"); another admin paid and the claim needs two approvals ("You
     entered it and Omar paid, so neither of you can approve it. It is
     quicker if Omar enters it.").
   - The database gives it the next number, EXP-0001, never reused.
2. **Waiting** (amber). Nothing on it changes (question 14). The person who
   entered it can withdraw it with a reason (grey); "Enter again" copies
   everything, receipt included, into a new claim to correct.
3. **Approve or reject.** The receipt is shown beside the buttons. Anyone
   allowed, except whoever entered it or paid. Approving means confirming or
   changing the suggested fund; the "Are you sure?" sheet repeats the amount
   and fund. Rejecting needs a reason (red) and is final; "Enter again" is
   offered.
4. **Second approval** above the amount in settings, and for lost receipts
   above a smaller amount (question 3): someone who did not enter it, did not
   pay and did not give the first approval. They approve or reject.
5. **Approved** (green). It never changes again.
6. **Paid back** (own money only): "Awaiting repayment" (amber), grouped by
   person with a total ("Tariq Hamid, 5 claims, €68.00"). Tick several,
   record one repayment: date, how (bank transfer, cash, cheque), optional
   reference. Nobody records a repayment to themselves. A wrong repayment is
   withdrawn with a reason, and the claims are awaiting repayment again.
7. **Correction**: a new entry pointing at the approved claim with the right
   amount, date, category or fund and a reason, approved by the same rules,
   with the second-approval amount checked against the new total. The claim
   then shows the corrected values with "Corrected", and both entries stay
   in its history. A correction to a repaid claim shows what is still owed,
   or what was overpaid.

Every rule above is enforced by the database, not only the screen, and has
tests for every role and for a signed-out visitor.

## 7. The monthly file for the bookkeeper (to confirm, question 11)

One CSV per month, in three parts (or three files, as the bookkeeper
prefers). It opens in Excel with Arabic text and can never run as a formula.

1. **Claims approved this month**: claim number, date on receipt, date
   approved, paid to, what it was for, category, fund, amount, VAT, Centre
   paid or person paid, who paid, approved by, second approver, receipt
   (number of files, or "lost").
2. **Corrections approved this month**, each as two lines: the old values
   as a minus amount, the new values as a plus amount, both naming the claim
   corrected. A fund-only change therefore moves the money between funds.
3. **Repayments made this month**: date, person, total, how, reference, and
   the claims it covered, so it can be matched to the bank statement.
   Withdrawn repayments appear in the month they are withdrawn, as a minus.

A month's file never changes once the month is over: everything new goes in
the month it happens.

**Receipts pack** (P5.5): a print page for the month, one claim per page
with its number, amount and receipt pictures, "Save as PDF" as for the rota.
PDF receipts are listed with "Download" beside them, since a PDF cannot be
printed inside a page reliably.

## 8. The Board report (to confirm, question 12)

A print page for a chosen month with "Save as PDF" (no new add-on), aimed at
two A4 pages at most (the demo video promises a one-page report). Counts and
totals only, no people's names. Two clearly labelled parts:

- **During October**: spend approved, by category and by fund; claims
  without a receipt (count and total); claims over the second-approval
  amount (count and total); repayments made; tickets opened and closed;
  items registered, disposed (by route) and sold (total price); stocktakes
  finished; loans and returns; book copies added and lost.
- **As at 3 November, 10:15** (when the copy was made): claims waiting;
  money awaiting repayment; fixed assets by condition and total recorded
  value; stock lines low and out; tickets open and urgent; Garda vetting
  (valid, due soon, expired); training expired; policy sign-offs unsigned or
  overdue; renewals overdue or due within 30 days; books overdue.

While the month is open the report says "Draft". After the month ends,
"Make the final copy" freezes the numbers (with the "Are you sure?" sheet).
If claims dated in that month are still waiting, it warns first: "2 October
claims are still waiting; if approved later they count in November."
Making it again keeps both copies, like rota publications.

## 9. Rules every new table follows (same as Phases 1 to 4)

- The standard safeguards: row-level security on, no access for signed-out
  visitors, deleting blocked (even for the master key), who and when filled
  in by the database, every change in the audit log, record numbers locked.
- Tests written first for approvals, money totals and every permission:
  Super Admin, Centre Admin, Finance, Library Operator, a switched-off
  account, a half-finished sign-in and a signed-out visitor.
- Amounts in whole cents, at most €1,000,000 per claim; dates never in the
  future.
- Receipts in a private store: PDF or picture, 10 MB each, checked by their
  content and not only their name (Round C3's rule, applied from day one),
  added and viewed, never replaced or deleted.
- **What a receipt may show**: a supplier's own business bank details on an
  invoice are normal and allowed. Card receipts show only the last four
  digits, which is allowed. Never photograph a bank statement, a card, or
  anyone's personal bank details; the receipt screen says so.
- Shared parts from `src/components/ui/` only, and lists that fetch one page
  at a time, so Round C has nothing to redo here.
- Migration numbers: Round A ended at `0048`. Phase 5 starts at `0049`.

## 10. Slice order (one per session)

1. **P5.1 Lists and settings**: spend categories, funds, the two amounts,
   menu, Finance's Home and phone bar, admin-account links (question 2),
   Finance's read-only Asset register if approved. Tests first.
   **Built 25 Nov 2026** (migration 0049). Also decided while building: a
   fund or category name already taken is refused in plain words; Centre
   Admins read Expense settings but have no menu link to it; a menu folds
   only when it has more than two groups and more than ten links, so
   Finance's short menu stays open; "Is my account linked?" shows on
   Finance's Home and Expense settings. Moved to later slices: Finance's
   phone shortcuts (P5.2, when the claim pages exist) and linking the test
   Super Admin and Finance accounts to People (P5.3; a browser test today
   links Finance by hand).
2. **P5.2 Enter a claim**: the receipt button, receipt store, phone steps
   and PC form, warnings, claim page with the receipt shown, list with tabs,
   withdraw and "Enter again", claim from a ticket. Seed: about 60 made-up
   claims with generated "SAMPLE RECEIPT" pictures.
3. **P5.3 Approve and reject**: suggested and chosen fund, second approval,
   lost-receipt rule, "Are you sure?" sheets, Waiting queue, Home counters.
   Tests first for every refusal.
4. **P5.4 Repayments and corrections**: grouped Awaiting repayment, one
   repayment for several claims, withdrawing a repayment, corrections,
   claims on the ticket page.
5. **P5.5 Monthly file and receipts pack.**
6. **P5.6 Board report**: draft, final copy, warnings, print page.
7. **P5.7 Security review** of Phase 5 in a fresh session (Prompt 6).

## 11. Phase 5 acceptance checks (proposed)

- A claim with a receipt photo, or a receipt saved from WhatsApp, can be
  entered on a phone in under two minutes; ten on a PC in under ten minutes.
- The database refuses, with a test for each: approving your own entry,
  approving money you paid, the same person giving both approvals, changing
  an approved claim, deleting anything, recording a repayment to yourself,
  a correction above the amount with one approval, and a Library Operator
  or signed-out visitor seeing anything.
- Every month's file adds up: claims plus corrections equal the approved
  total by fund and category; repayments equal what was owed and repaid (a
  test over many made-up months).
- A month's CSV and final Board report never change after the month ends.
- The full test suite passes, with screenshots of each new screen in
  `docs/screens/`.

## 12. Before real use (ICCI to provide)

The real fund list; the second-approval amount; who holds the Finance
account; the bookkeeper's program and columns; ICCI's existing finance
rules, if any; confirmation that the privacy notice covers receipts; and at
least two Super Admins, as AFTERCARE.md already requires.

## 13. Questions for the owner

**Decided 25 November 2026: the owner approved every recommended answer
below** (1A, 2A, 3A with €50, the category draft, 5A, €500, 7A, 8A, 9 as
recommended, 10 as recommended, 11 build section 7, 12 as recommended, 13 as
recommended, 14A, 15A, 16: accounts and audit log screens become Round C
slice C5). Question 11's bookkeeper details and section 12's items come back
before real use.

Each has a recommendation; "all recommended" is a fine answer. The lists and
amounts (questions 3 to 6) can be changed on screen later.

1. **Who does what.** Recommend **the table in section 5**, with Finance
   held by an ICCI treasurer who approves; an outside bookkeeper receives
   the monthly file and receipts pack, not a login. Alternative: a new
   read-and-export "Bookkeeper" role (a later slice).
2. **Linking admins to their People record.** Since AFTERCARE.md requires
   two Super Admins, each can link the other, so the rule from P2.2 can
   stay. (A) **An account must be linked before it can approve expenses;
   links stay as today (another Super Admin)**; an unlinked admin sees a
   note saying why and who can fix it; Finance's person record is added by
   a Super Admin *(recommended; the test seed gets a second Super Admin)*.
   (B) As A, but a Super Admin may link their own account once.
   (C) No link needed; a warning only.
3. **Lost receipts.** (A) Allowed with a written explanation and an amber
   "No receipt" badge; one approver up to **€50**, two above that; counted
   on the Board report *(recommended)*. (B) Always two approvers. (C) A
   receipt is always required.
4. **Spend categories** (a list that can grow). Starting draft for the
   bookkeeper to edit: Repairs and maintenance; Cleaning and hygiene;
   Utilities; Kitchen and catering; Office, printing and post; Phones,
   internet and IT; Equipment and furniture; Vehicles and fuel; Events and
   programmes; Funeral services; Books and learning materials; Insurance,
   licences and fees; Professional services; Other.
5. **Funds.** Recommend **Unrestricted, Zakat and Fitra** to start (more
   added on screen); one fund per claim; the person entering may suggest a
   fund; the first approver confirms or changes it; the second approver may
   also change it, and the claim shows who chose what. Who may choose Zakat
   or Fitra: (A) **any approver** *(recommended: PLAN.md lets a different
   admin or Finance approve)*; (B) only Finance and Super Admin. Which
   spending each fund may pay for is ICCI's decision, not a rule in the app.
6. **Second-approval amount.** Recommend **€500 to start**, changed by a
   Super Admin on screen (recorded), with the entry warning in section 6.
   The second approver is anyone allowed who has not entered, paid or
   approved it. Note: with two Super Admins, a Centre Admin and a Finance
   treasurer, every claim can be approved; with three accounts some cannot.
7. **Which month.** (A) **Claims in the month approved, repayments in the
   month made** *(recommended)*. (B) Claims in the month on the receipt.
8. **Corrections.** (A) **One "Correct this claim" screen; the file shows
   the old line out and the new line in, in the month approved; the amount
   rule uses the new total** *(recommended)*. (B) Cancel the whole claim
   and enter a new one.
9. **Extra fields** beyond PLAN.md. Recommend **what it was for (required),
   paid to, ticket, VAT and suggested fund (all optional), up to 3 receipt
   files**. Linking to an item bought: later.
10. **Repayments.** Recommend **grouped by person, several claims in one
    repayment with a reference, withdrawn with a reason if wrong**, no bank
    details. Alternative: one repayment per claim.
11. **The bookkeeper.** Please find out which program they use, which
    columns they want and whether they want the VAT column. Until then,
    **build section 7** *(recommended)*.
12. **Board report.** Recommend **section 8: print page, frozen final copy,
    under Overview, for Super Admin, Centre Admin and Finance.**
    Alternatives: no final copy; or a PDF add-on for a direct download (a
    new dependency, asked first).
13. **Demo data.** Recommend **made-up shop names and plainly fake receipt
    pictures**, never a real firm's name on a receipt.
14. **Fixing a waiting claim.** (A) **Withdraw and "Enter again" (one tap,
    receipt carried across)**; a waiting claim never changes, so an approver
    never approves something that changed under them *(recommended)*.
    (B) Edit it while nobody has decided (the audit log keeps old values).
15. **Finance and the Asset register** (left as "revisit in Phase 5" on
    15 Nov 2026). (A) **Yes, the register and its CSV, read only**, for
    insurance and year-end; no item pages *(recommended)*. (B) No; the
    Board report's totals are enough.
16. **Accounts and audit log screens.** Needed before any real person gets
    an account, but in no plan. Recommend **adding them to Round C as slice
    C5**, after Phase 5 and before launch. Alternative: build them first.

## 14. Technical notes (for Claude; the owner can skip this)

- Tables (0049 onwards): `expense_categories`, `expense_funds` (name,
  restricted, active), `app_settings` (`second_approval_cents`,
  `lost_receipt_second_cents`; super_admin writes), `expense_claims`
  (sequence shown as EXP-0001; kind `claim`/`correction`; `corrects_id`,
  `copied_from_id`; amount_cents, vat_cents, receipt_date, category,
  description, paid_to_company_id or paid_to_text, ticket_id, payment
  `centre_direct`/`centre_card`/`personal`, paid_by_person_id (required
  unless centre_direct), suggested_fund_id, receipt_lost_reason),
  `expense_files` (claim, position 1-3, path; a copied claim points at the
  same stored files), `expense_decisions` (append-only: approved,
  second_approved, rejected, withdrawn; fund_id; note), `expense_repayments`
  and `expense_repayment_claims` (one repayment, many claims),
  `expense_repayment_withdrawals`, `board_report_copies` (month, frozen
  jsonb, made_by).
- Status, current values, fund and "awaiting repayment" worked out in a
  view from the entries, like `stock_levels`; nothing typed over.
- Decision trigger refuses: decider = created_by, = payer's
  `people.app_user_id`, = first approver (for the second), decider has no
  linked person (2A); a correction's threshold uses its own amount. Lock the
  claim row so two approvals at once cannot both pass. Repayment refuses a
  claim not approved, not personal, already repaid, other payer in the same
  repayment, or the recorder being the payer.
- Receipt button: new component (not `PhotoInput`): `accept` images and
  PDF, `multiple`, no `capture` attribute on the "choose" button; pictures
  shrunk only above 3,000 pixels on the long side; content checked on the
  server by the file's first bytes.
- Narrow look-ups for Finance: `expense_people()`, company names, ticket
  number and title; security definer, role checked inside.
- `board_report(month)` security definer returning counts only; role
  checked inside; `security_problems()` allows it by name.
- `bottomBarFor` learns Expenses for Finance; `MENU` adds the group and the
  Overview link.
- Seed: a second Super Admin test account; Super Admin and Finance accounts
  linked to person records; a second Finance test account. Receipt pictures
  generated with tools already installed (Playwright, or Node's own zlib for
  a plain PNG); no new add-on.
- Ticket costs stay out of every money total.
