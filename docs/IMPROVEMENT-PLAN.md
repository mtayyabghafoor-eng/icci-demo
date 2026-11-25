# Improvement plan: fewer bugs, calmer screens

Written 24 November 2026, after four outside reviews by Gemini (two on the
screens, two on the code and security) were checked line by line against the
code. Updated 25 November 2026 with what a fifth review (Gemini Carbon, one
screen and one code report) added. This is a plan, not a decision. Every question at the end needs the
owner's answer before the slice it belongs to starts. It follows `CLAUDE.md`
and `docs/PLAN.md`; nothing here adds a dependency without asking.

## 1. What the reviews got right, and what they got wrong

Everything below was checked in the code, not taken on trust.

**Confirmed, and worth fixing**

- Error and "not allowed" messages appear in a green box, like "Saved", and
  fade after 8 seconds. Staff will think it worked.
- On a phone, the "Save count", "Check and finish" and "Send for approval"
  bars slide behind the bottom menu bar while you scroll.
- On a phone, five lists (Tickets, Renewals, Training, Policy grid, Asset
  register) show an empty filter box with only a "Show" button.
- Stock arithmetic: if a shelf is counted again after a stocktake was sent,
  approving the stocktake's difference applies the old shortfall on top of
  the new count (counted 3, approval sets 0). The test for it hides the bug.
- A rejected disposal still blocks approving a stocktake difference, after
  the screen told the admin to decide the disposal first.
- The stocktake scan screen says "press Mark found" afterwards; approval
  already does that, and following the note would block the stocktake's own
  difference as out of date.
- A reminder email that fails to send is never tried again (the next stage's
  reminder and the Home counter still show it).
- Page titles use old-style numbers in the title font: "T-0001" reads like
  "T-oooI".
- The staff call sheet looks up phone numbers by name, so two contacts with
  the same name would show the same number.
- Library: a loan can be closed as "lost" without the copy being marked lost
  (only by someone calling the database directly, not through the screens).
- Home: "Low stock" is amber in the top box and red in the list below, and
  sits above Garda vetting and overdue renewals.
- Home numbers differ from the lists they open (renewals 30 days on Home,
  "due soon" means 60 days on the list; vetting list shows everyone).
- "Report damage" and "Report a problem" sit side by side unexplained.
  "Report a problem" leaves a broken item marked "Good". A damage report's
  note and photo are not carried into the ticket.
- "Report a problem" from the menu cannot pick an item.
- The Back button always goes to one fixed list and forgets your search.
- No "Are you sure?" before permanent actions (publish a policy, withdraw a
  book copy for good).
- The policy grid stops at 1,000 squares (about 100 people x 10 policies)
  without saying so, and its squares cannot be clicked.
- No ICCI page for "page not found" or "something went wrong". A list that
  fails to load says "Nothing matches" instead of "try again". A brief
  database hiccup signs the admin out.
- The "Open label" box rejects room codes (PL-0001) and is hidden from the
  Library Operator, whose books carry the same labels.
- Smaller: idle warning tells phone users to "move the mouse"; overdue
  borrowers' phone numbers cannot be tapped; the library copy page has no
  desk tabs; the room-register camera refuses the next room's door label;
  "Stock corrections waiting" is not in the menu; form borders are faint;
  the call sheet prints to the paper's edge; a test's title promises a check
  it never makes, and another test can pass without testing its main point.

**Overstated or wrong**

- "Two design systems": in the code, yes; on screen, the old and new status
  badges and form boxes are identical. It is tidying, not a visible fault.
- "Bare Loading… text on 105 pages": a shared grey placeholder page already
  shows while pages load; the text only flashes briefly.
- "Double arrow on the Back button": not true; the button removes it.
- The second screen review described the wrong fonts, colours and Home boxes
  and "7 identical white buttons" (the main ones are green). Its 8.6/10 is
  too generous; 7/10 is fairer today.
- "Critical: unsigned idle cookie": the 15-minute sign-out was built in the
  app on purpose, with the server-side setting to be switched on with the
  paid plans (Decisions, 14 Nov 2026). It only matters to someone who has
  already stolen a sign-in. It belongs in the pre-launch round.
- "22 server actions do not check the sign-in": the database refuses anyone
  not signed in with two-factor, whatever the screen does. Checking inputs
  more strictly is still good housekeeping.
- "One admin can set a shelf count to 0 without a second admin": by design
  (14 Nov 2026). Counts and restocks are recorded by one admin and every
  count stays in the history; only correcting an earlier entry needs a
  second admin.
- "Critical: 1,000-row limits": real in the code, but ICCI's lists are far
  below 1,000 today except the policy grid (fixed in A7). The rest is Round C.
- "The model page shows every unit as Good": only a label inside the code;
  the screen shows each unit's real condition.
- The "Are you sure?" step is not new: `docs/UI-PLAN.md` 5.5 already agreed
  a red outline button and a confirmation sheet for dangerous actions. It
  was never built. A1 builds it.

**Ideas that are new features, not fixes** are in section 5. Each needs the
owner's yes.

## 2. Recommended order

1. **Round A, "Fix and tidy" (7 slices, about 7 sessions), now.** These are
   bugs and shared parts. Expenses (Phase 5) will be built on the same
   messages, buttons, phone bars and Back button, so fixing them first means
   Phase 5 is right the first time.
2. **Phase 5, Expenses and Board report**, as PLAN.md 5.5, with its own plan
   document first (three of its answers are still "to confirm").
3. **Round C, "Finish and harden" (4 slices), before launch.** The
   look-alike sweep of every page (done once, so Phase 5 screens are
   included), bigger data, security tightening and test gaps. Then the
   before-launch list in `docs/AFTERCARE.md` section 12.

Phase 6 (service registers) stays where PLAN.md puts it: not before the
services have settled.

Each slice ends the usual way: tests first where permissions, stock
arithmetic or approvals are touched; the full suite passes; screenshots of
every changed screen in `docs/screens/`; one commit.

## 3. Round A: fix and tidy (before Phase 5)

### A1. Messages and "Are you sure?"

What staff notice:
- Errors and refusals are red with a warning sign and stay until closed.
  Warnings are amber. Only real successes are green and fade away.
- The "Your account cannot see…" boxes are one calm grey note, not green.
- As agreed in `docs/UI-PLAN.md` 5.5: dangerous actions have a red outline
  button, and pressing it opens a small confirmation sheet that says in
  plain words what will happen ("Publish version 3? Everyone who must sign
  will be asked to sign it again.") with "Yes, publish" and "Cancel". Used
  for: publish a policy, withdraw a book copy for good, approve a disposal,
  remove a rota slot, unlink an admin account (question 4 asks about
  "Switch off").
- "Switch off" looks the same on every page: the red outline button.
- Form boxes get a slightly darker border, easier to see for older eyes.
- Numbers in page titles look like normal numbers ("T-0001", not "T-oooI").
- Refreshing a page no longer brings back an old "Saved" message.

### A2. Phone fixes

What staff notice:
- Save and Finish bars always sit just above the bottom menu bar.
- The five lists show their drop-downs directly when there is no search box
  (and Garda vetting no longer shows a lone tick box).
- Leaving a weekly count with numbers typed but not saved asks first
  ("You have counted 12 shelves. Leave without saving?").
- The idle warning says "Tap the screen to stay signed in" and sits above the
  bottom bar on iPhones.
- After scanning an item, Move and Report a problem come first; the details
  list follows.
- Registering a room: scanning the next room's door label with the in-app
  camera moves you to that room.
- Companies, Makes and models and the Stocktake list become cards on a phone
  instead of wide tables.

### A3. Stock, stocktake and library rules (database; tests first)

What changes:
- A stocktake shortfall cannot be approved on top of a newer shelf count. The
  approver is told: "This shelf was counted again after the stocktake. Reject
  this difference; the newer count stands." Stock added since is still kept,
  as today.
- A rejected disposal no longer blocks the stocktake difference.
- The stocktake scan note says approval puts a missing item back in use.
- Marking a loan "lost" always marks the copy lost in the same step.
  "Returned by mistake" re-checks the 3-book limit and that the borrower is
  still switched on.
- The weak test is rewritten so it would catch the counting bug.

One database change (migration 0047), applied to the demo database before
it reaches main.

### A4. Reporting and fixing a problem

What staff notice:
- One way to report on an item's page (question 2): "Report a problem", with
  a tick "It is broken or damaged" that also marks the item damaged.
- A ticket made from a damage report starts with that report's note and
  shows its photo; nothing is typed twice.
- "Report a problem" from the menu has a search box to pick the item by name
  or label (fixed assets only), or a place, as now.
- The ticket summary shows "Passed to" and the company's job number.
- Closing a ticket on a damaged item: "Also mark the item repaired" starts
  ticked.

### A5. Home and finding your way

What staff notice:
- Home's red list puts people and safety first: Garda vetting, overdue
  sign-offs and renewals, urgent tickets, then stock and assets
  (question 3). "Low stock" has one colour in both places.
- Each Home line opens its list showing the same items it counted
  (question 5).
- "For you to approve" opens the queue when there is one, lists the queues
  when there are several, and is not a link when there are none.
  "Stocktake differences for you to approve" opens the stocktake that is
  waiting (or the waiting ones first), not the whole stocktake list.
- Back returns to the list you came from, with your search and page kept,
  and names it ("Back to Garda vetting").
- The "Open label" box opens room labels too, and the Library Operator gets
  it.
- Menu: "Stock corrections waiting" next to "Disposals waiting", and
  "Reminders" (question 6). Nothing else, to keep the menu short.
- Tablet: thin lines between the menu groups so the icons are grouped.
- Library: desk tabs on the copy page; overdue phone numbers can be tapped;
  "See all" under "Due back in 3 days" keeps that filter.

### A6. When something goes wrong

What staff notice:
- An ICCI "Page not found" with a way home, and an ICCI "Something went
  wrong" with a "Try again" button.
- A list that cannot load says "This list could not be loaded. Try again."
  instead of "Nothing matches".
- A database hiccup at sign-in shows "Try again" instead of signing out.
- Empty lists show one calm card with "Clear filters" or "Add …".
- The staff call sheet prints with a proper margin, and shows the right
  phone number for each contact even when two share a name.

### A7. Policy grid and rota

What staff notice:
- The policy grid always shows everyone (no hidden cut-off at 1,000).
- Clicking an amber or red square opens the sign-off with that person ticked,
  and returns to the grid.
- Names and policy titles stay in view while scrolling the grid.
- Rota: a line explains why "Use a template" only shows on an empty week.
  "Print the published rota" warns when there are changes not yet published.
  "Today's rota" shows the same warnings as the week. "No prayer time
  entered" links to Prayer times.
- If the owner says yes (question 7): "Also put this person on: Tue Wed …"
  on the slot page, to fill a week in a few clicks.

## 4. Round C: finish and harden (after Phase 5, before launch)

### C1. One look everywhere

Every page uses the shared title with the gold rule, the shared form fields,
tables and badges, and one of three page widths. The old copies in
`items/ui.tsx` and the eight "cannot see" files are retired. Grey loading
bars replace the leftover "Loading…" text. Screenshots of every screen.

### C2. Ready for real amounts of data

Tickets, People, Garda vetting, Training, Renewals and the Asset register
fetch one page at a time from the database instead of everything. Long
lists of choices are never cut off at 1,000. The Home counters are worked
out in one pass. An item's history shows the newest entries first and is
never cut off. A test loads thousands of made-up records and the speed
check is re-run.

### C3. Security tightening

- With the paid plans: the server-side 15-minute idle sign-out and a shorter
  sign-in token life, as already decided.
- The activity cookie marked "secure"; sign-out only by pressing the button.
- Every server action checks its inputs strictly (the "switch off" action
  accepts only companies or makes and models; document uploads accept only
  the expected fields).
- Uploaded pictures are checked by their content, not only their name, and
  a document's file must sit in its own item's or model's folder.
- The idle check also covers addresses that end like a picture name.
- The Library sign-in page never sends a code to an admin's address.
- Database number counters are closed to signed-out visitors, like
  everything else.
- Printed label addresses come from a fixed setting, never from the request.
- A stricter browser rule on which scripts may run, if it does not slow the
  pages.
- The home-network address in the developer settings is removed.

### C4. Tidy code and honest tests

- The two weak tests are fixed; tests added for each CSV download per role,
  file checks, and server actions given bad input.
- The test clean-up script knows the newest tables (leftover test
  companies and makes and models are switched off).
- A reminder email that failed to send is tried again the next day.
- The demo walkthrough reports a failed step as a failure, not just a note.
- The guide's local log files (`docs/guide/capture.err`, `capture.log`)
  are never committed.
- If the owner agrees (question 8): the code is given an exact description
  of the database, so a misspelt column name is caught before it runs.

Then `docs/AFTERCARE.md` section 12, in its order.

## 5. New features suggested by the reviews (not planned unless approved)

| Idea | My view |
| --- | --- |
| Put one person on several days at once on the rota | Yes, small and saves many clicks (question 7) |
| Rota warning when someone has not signed a required policy | Maybe; PLAN.md asks only for double-booking and vetting (question 9) |
| In-app camera on iPhones (needs a new add-on) | Yes in Round C, mainly for book barcodes (question 10) |
| Camera on the Lend and Return pages | Comes with the iPhone add-on; Android could have it in A2 |
| "Approve all" for stocktake differences | Later; one by one is safer while staff learn |
| One search box that finds everything | No for now; it adds clutter. The label box gets room codes instead |
| Paste a month of prayer times | Later, if typing them proves slow |

## 6. Questions for the owner

**Owner's answers (25 November 2026): every recommended answer.** 1: (A)
Round A, then Phase 5, then Round C. 2: (A) one "Report a problem" with a
"broken or damaged" tick. 3: (A) people and safety first. 4: (A) Switch off
gets the red button, no sheet. 5: (A) Home lines open their list filtered.
6: (A) add only "Stock corrections waiting" and "Reminders". 7: (A) several
rota days at once, in A7. 8: (A) yes. 9: (A) no rota policy warning. 10:
(A) yes, the add-on is named and asked about before installing. A3 approved
all the way: local test database, then the ICCI Staging database, then push
to GitHub (A1, A2, A3 and A6 together).

1. **Order.** (A) Round A now, then Phase 5, then Round C *(recommended)*;
   (B) all of Rounds A and C now, then Phase 5; (C) Phase 5 first.
2. **Reporting.** (A) One "Report a problem" with a "broken or damaged" tick
   *(recommended)*; (B) keep both buttons, add a line explaining each, and
   copy the note and photo across; (C) leave as is.
3. **Home order.** (A) People and safety first, then stock and assets
   *(recommended)*; (B) keep today's order.
4. **"Switch off" and the confirmation sheet.** UI-PLAN 5.5 lists switch
   off with the dangerous actions. (A) Switch off gets the red outline
   button but no sheet, because it can always be switched back on; the
   sheet is kept for the five permanent actions *(recommended: fewer extra
   clicks)*; (B) the sheet on switch off too, exactly as UI-PLAN says.
5. **Home numbers.** (A) Each Home line opens its list filtered to the same
   items *(recommended)*; (B) Home switches to 60 days to match the list.
6. **Menu.** (A) Add only "Stock corrections waiting" and "Reminders"
   *(recommended)*; (B) also add "Makes and models" and "Call sheet".
7. **Rota several days at once** in A7. (A) Yes *(recommended)*; (B) later;
   (C) no.
8. **Exact database description in the code** (C4). (A) Yes, it is
   mechanical and catches typos *(recommended)*; (B) no.
9. **Rota warning for unsigned policies.** (A) No, keep to PLAN.md
   *(recommended for now)*; (B) yes, add it in A7.
10. **iPhone camera add-on** (C-round). (A) Yes, I name the add-on and ask
    before installing *(recommended)*; (B) no, keep the phone's Camera app.

## 7. Technical notes (for Claude; the owner can skip this)

- A1: `items/ui.tsx` `Notice` becomes the shared `Notice` with a tone; each
  page's `DONE` map splits into success and refusal. One shared
  `CannotSee` replaces the eight `cannot-see.tsx`. `toast.tsx` strips every
  message parameter, not only `done`. New `ConfirmDialog` in
  `src/components/ui/` on the browser's own `<dialog>` (as the bottom bar's
  menu sheet already does; no dependency). Border token replaces `#c9d3cf`
  (needs at least 3:1 on white). `.page-title` gets lining numbers.
- A2: `sticky bottom-0` in `stock/forms.tsx`, `stocktake/forms.tsx`,
  `stocktake/[id]/page.tsx` offset by the bottom bar's height plus the safe
  area below `md`. The folded-filter rule in `globals.css` applies only when
  the form has a text box. `room-form.tsx` accepts `codeFromScan`.
  `DataTable` gains a phone card layout.
- A3: migration 0047 redefines `private.check_stocktake_difference` (ignore
  rejected asset events; refuse a `quantity` difference when a `count` or
  approved adjustment exists after `submitted_at`) and
  `private.check_library_loan_entry` (`lost` needs a copy entry `lost`
  written in the same transaction; `return_undone` re-checks the cap and
  `active`). Push to the staging project before main.
- A4: may need one database function that writes the damage entry and the
  ticket together. The damage photo is shown from its own store, not copied.
- A5: `counters.ts` ranks within red by a fixed list; Home links carry list
  filters (`/renewals` needs a 30-day filter). Back keeps a `from` address
  checked against the app's own pages. `/l` route also parses place codes;
  layout uses `mayScan`. `whereAmI` takes the role and knows `/reminders`.
- A6: `app/(app)/not-found.tsx`, `app/(app)/error.tsx`,
  `app/global-error.tsx`; list pages check `error`; `requireAdmin` retries
  once, then shows a retry page instead of signing out.
- A7: `policy_grid` read with `allRows` (also `policies/page.tsx`
  `limit(100000)`); sign-off page accepts `?person=` and `?back=grid`.
