# Security review of Phase 5 (expenses and Board report), 26 Nov 2026

Slice P5.7, following Prompt 6 in `docs/PROMPTS.md`. Done in a fresh
session, as a reviewer who did not write the code. **Nothing was fixed**:
this file lists what was found, so the owner can choose what to fix.

## What was reviewed

- Database rules: migrations `0049` (lists and settings), `0050` (claims,
  receipts, decisions, repayments, corrections) and `0051` (Board report).
- Website code: the expense pages and their server actions, the receipt
  upload checks (`src/lib/files.ts`), the monthly CSV and receipts pack, and
  the Board report.
- Every finding below was **tried for real** on the local test database
  (Docker), inside a step that was then cancelled, so nothing was saved.

## The short answer

The main promises hold. With the test accounts, the database refused, or
the rules show it would refuse:

- a signed-out visitor or a Library Operator reading anything about expenses;
- anyone approving a claim they entered, or money they paid themselves;
- the same person giving both approvals;
- changing or deleting a claim, a decision, a receipt file or a final
  Board report copy (even with the master key);
- recording or withdrawing a repayment to yourself (through your own,
  linked People record);
- a fake receipt (a file that only claims to be a PDF or picture).

Five weaknesses were found. None lets an outsider in; all need a signed-in
admin. Two are worth fixing before real money is used.

| # | Severity | In one line |
| --- | --- | --- |
| 1 | Medium | One Super Admin can switch off the second approval, approve alone, and switch it back (**fixed**, 0052) |
| 2 | Medium | Renaming a fund or category quietly changes past months' files (**fixed**, 0052) |
| 3 | Low to medium | An admin can be paid back through a second People record they made themselves (**fixed**, 0053) |
| 4 | Low | Lowering a claim after it was repaid hides the overpayment (**fixed**, 0053) |
| 5 | Low | Files can be put in the receipt store without any claim |

Plus two notes that need no fix now (section "Notes").

---

## 1. One Super Admin can switch off the second approval (Medium)

**Fixed 26 Nov 2026** (migration 0052): a Super Admin now *asks* for a new
amount; it takes effect only when a different Super Admin confirms it. Nobody
signed in can change an amount directly.

**What happens.** The "second approver above €500" amount is a setting that
any one Super Admin can change. They can raise it to €1,000,000, approve a
large claim on their own, and put it back a minute later. The claim then
shows as fully approved with no second approver. The change is in the
audit log, but nobody is told and the Board report does not mention it.

**How it was reproduced.** A Centre Admin entered a €900 claim. The second
Super Admin raised the amount to €1,000,000, approved the claim, and set
the amount back to €500. Result: "approved", no second approval needed.

**Fix (recommended).** A change to either amount takes effect only once a
**second** Super Admin confirms it (the same "nobody approves their own
entry" rule, in the database). Simpler alternative: changes take effect
from the next day, and the Board report lists any change made in its month.

## 2. Renaming a fund or category changes past months (Medium)

**Fixed 26 Nov 2026** (migration 0052): a fund or category used on any claim
keeps its name; the screen marks it "In use" and offers no Rename.

**What happens.** Finance or a Super Admin can rename a fund or a spend
category at any time. The monthly CSV and the Board report draft use
today's names, so a month that is already closed would print differently
if exported again. For example, renaming "Zakat" (a restricted fund) to
"General" makes past Zakat spending look like ordinary spending in every
re-exported file. This breaks the Phase 5 promise that "a month's CSV never
changes after the month ends". (Final Board report copies are safe: they
froze the names when they were made.)

**How it was reproduced.** Signed in as Finance, "Zakat" was renamed to
"General (was Zakat)" and "Funeral services" to "Office". Both were
accepted.

**Fix (recommended).** Once a fund or category has been used on any claim,
its name cannot change: switch it off and add a new one instead (the same
rule the database already uses for "restricted"). Correcting a typo the
same day, before any claim uses it, stays allowed.

## 3. Paying yourself back through a second People record (Low to medium)

**Fixed 26 Nov 2026** (migration 0053): whoever entered a claim, or an
approved correction of it, cannot record or withdraw its repayment. The
owner also chose the extra rule: a new person with the same name as
someone already in People needs "Yes, this is a different person", now
checked by the database and kept on the record.

**What happens.** The rule "never record a repayment to yourself" checks
only the People record linked to your own account. A Centre Admin can add
a second People record with their own name (Centre Admins may add people),
enter a claim as paid personally by that record, and, once another admin
approves it, record the repayment to it themself. The approver sees only a
name.

**How it was reproduced.** The test Centre Admin added a second "Test
Centre Admin", entered a €40 claim paid by that record, the second admin
approved it, and the first Centre Admin recorded the repayment. Accepted.

**Fix (recommended).** Two small rules in the database: whoever **entered**
a claim cannot also record its repayment; and a new People record with
the same name as someone already there needs a "yes, this is a different
person" tick. The real protection stays the bank: the Treasurer pays the
bank details they hold, not a name in the app.

## 4. A lower correction after repayment hides an overpayment (Low)

**Fixed 26 Nov 2026** (migration 0053): the claim shows "Paid too much:
€X to get back", Awaiting repayment lists such claims under their own
heading, and the Board report shows "Paid too much, to get back". The
owner also chose the optional rule: whoever entered a claim cannot
approve or reject a correction of it.

**What happens.** If a claim is repaid and then corrected to a lower
amount, the app works out "owed" as a minus figure (the person was paid
too much) but every list and counter only shows amounts above zero, so
the overpayment disappears from view. Also, the person who entered the
original claim may approve the correction of it (allowed by the plan, but
worth knowing).

**How it was reproduced.** A €40 claim was repaid, then corrected to €10
and approved: "owed" became −€30 and nothing on screen showed it.

**Fix (recommended).** Show "Paid too much: €30 to get back" on the claim
and in "Awaiting repayment", and include it in the Board report's money
owed section. Optionally, the person who entered a claim cannot approve
its corrections.

## 5. Files in the receipt store with no claim (Low)

**What happens.** The receipt store accepts any file name from any of the
three admin roles, outside the website's checks, even when no claim is
entered. Such files can never be read by anyone else without a claim
pointing at them, and nothing can be changed or deleted, so this is not
a leak. It only means the store could fill with unchecked files.

**How it was reproduced.** As a Centre Admin, a file called
`anything/at-all.bin` was added to the store directly. Accepted.

**Fix (recommended).** Limit the store to the names the website uses
(`claims/<year-month>/<random>-receipt-<n>.<pdf|jpg|png|webp>`), and add
a monthly check that lists files not on any claim.

---

## Notes (no fix needed now)

- **Receipt links.** Receipts are shown through temporary links that work
  for 10 minutes (30 for the printable pack) for anyone who has the link.
  If someone forwarded a link it would open without signing in until it
  runs out. This matches the rest of the app; keep the times short.
- **Spreadsheet safety.** The monthly CSV already stops text such as
  `=SUM(...)` from running as a formula in Excel. Checked; no problem.
- **Not checked by this review:** the live ICCI Staging database
  (migrations 0050 and 0051 are not on it yet), and real Supabase settings
  outside the migrations.

## Suggested order

Fix 1 and 2 first (one small migration, with tests written first): **done
26 Nov 2026, migration 0052**. Then 3 and 4 together: **done 26 Nov 2026,
migration 0053**. Then 5. Each fix follows the usual rules: a numbered
migration, tests for every role and a signed-out visitor, full test suite.
