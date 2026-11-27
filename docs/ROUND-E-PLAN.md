# Round E: calmer screens, phone polish, speed and privacy (plan, 27 Nov 2026)

Status: **approved 27 Nov 2026.** The owner chose every recommended answer
in section 5 ("All recommended, go E1"). E1 is being built.

## 1. Where this plan comes from

Three reviews from 27 November 2026, merged into one list:

1. **Gemini's code audit** (speed, search engines, icons, Arabic). Most of its
   facts were checked against the code and hold up. Its score (79/100) and its
   "critical" labels were not used.
2. **The Impeccable design review** of the screenshots in `docs/screens/`. It
   scored 26 of 40. The owner chose: PC home first, backlogs in a quiet row,
   top three problems first.
3. **The "Round D9, phone polish" plan** from another review: phone Home
   order, folding filters, and a Save bar on phone forms.

What was checked before merging:

- **D9's correction is right.** Since D3, most phone lists fold their
  drop-downs. Garda vetting and the Policy grid stay open because of rule
  A2 ("no search box, never fold").
- **One design-review finding is current and was not fixed by D1.** On a
  PC, the Items filter boxes still cut off their words ("Location: E",
  "Condition: A..") and the last box runs past the card. The PC Search
  button is also still there. The screenshot
  (`slice-04-items-list-desktop.png`) was taken at 10:03 today, after D1
  (01:13).
- **The 41 user-guide pictures are out of date.** They are from 20 Nov, so
  they show the old Home and a menu without Expenses.
- **Many screenshots make a working page look broken.** On PC shots the
  green menu stops halfway down, and on phone shots the bottom bar floats
  mid-page. This is how the pictures are taken, not the app. The owner
  reviews from screenshots, so it is fixed first.

## 2. What changes from the D9 plan, and why

| D9 said | This plan | Why |
| --- | --- | --- |
| Phone Home: greeting, three totals, Needs attention, approvals, Quick actions. PC unchanged. | PC and phone Home are redesigned together in one slice (E1). The three totals move to the quiet "Everything else" row on both. | The owner chose to redesign the PC Home and to put backlogs in a quiet row. Changing the phone alone would mean building Home twice. |
| Quick actions last on the phone | Quick actions straight after the (short) Urgent list | Only about 3 urgent rows show now, so the actions stay near the top. Caretakers mostly come to Home to *do* something. Question 1. |
| Fold filters with two or more drop-downs | Kept, and the PC filter boxes are fixed in the same slice (E2) | It is the same list toolbar, so it is better changed once. |
| A Save bar on about 40 forms | Kept. Cancel joins Save on every form, and the stocktake bar stops covering the label box. | Same part, same slice. The review found the Dispose form has no Cancel. |
| Tests and screenshots | Kept, plus the screenshot fix, so pictures show the page as a person sees it | |

## 3. What is left out, and why

- **Public-website search features** (site map, rich search results,
  `llms.txt`, social-media cards). This is a private admin app, and adding
  them would only leak internal details.
- **Acting on several rows at once** (for example closing 5 tickets
  together). This is a new feature, so it needs its own plan and the
  owner's yes.
- **Lighter picture formats (AVIF), and the doubled table and phone-card
  lists.** The effect is too small at today's list sizes.
- **Hiding last week's number on the weekly count.** This is a question
  for later, after real volunteers try it (question 6).

## 4. The slices, in order

One slice per session. Each slice ends the usual way:

- tests first where permissions, stock or approvals are touched;
- the full test suite from a freshly reset test database;
- new screenshots in `docs/screens/slice-e<N>-*`;
- the progress log updated, and one commit.

Nothing goes online until the owner says so. No database change and no new
add-on, except where marked.

### E1. Calm Home (PC and phone), and honest screenshots

1. Screenshots: one picture of what the screen shows, plus the full page
   with the menu and bottom bar drawn in place, not floating.
2. Greeting band about half as tall. The "HOME" label goes, and the
   sentence becomes the message ("3 things are urgent today").
3. Urgent rows in full. The badge shows the number only, because the
   heading already says "Urgent".
4. The quiet "Everything else" row holds small number-and-word counters
   with no red or amber: low stock, missing, sign-offs, rota, library, the
   three totals, and the rest.
5. Approvals become a white card with a thin gold line instead of a
   gold-filled box. Quick actions become one row of four plain buttons, and
   only "Register an item" stays solid green.
6. Phone order: greeting, Urgent, Quick actions (2 by 2), approvals,
   Everything else (question 1). The search box gets a gap under the
   greeting.
7. Library Operator Home: "Lend a book" and "Return a book" as two big
   buttons under the greeting, then the overdue count. Finance Home gets
   the same calm style.
8. Tests: nothing is counted twice; on a phone, Urgent comes before Quick
   actions; backlogs never show red or amber.

### E2. Lists: filters that fit, fold and apply

1. PC: the drop-downs get their own wrapping row, wide enough for their
   words, and never run past the card.
2. PC: the Search or Show button goes wherever the list updates by itself
   (the D3 decision). The search box still runs on Enter.
3. Phone: lists with two or more drop-downs fold them behind "More
   filters", even without a search box. This changes rule A2 (question 2).
4. Places on Items show the last two parts ("Room A1 › Shelf A1-1-1") with
   the full path on hover. Rows stop growing to four lines.
5. Repeated badges go: "Active" on every person, "Waiting" on every waiting
   claim, and "Open" on every open ticket. "No items match" is said once.
6. The Items Status column says which kind it is ("Stock: Low", "Condition:
   Damaged").
7. Tests: Garda vetting folds on a phone; no filter box is cut off on a PC
   (box width ≥ text width).

### E3. Rota week without the wall of warnings

1. Missing prayer times are said once, at the top: "Prayer times missing for
   5 days" with an "Enter prayer times" button.
2. Empty slots become a dashed outline with "+ Fill". Amber and red are
   kept for problems with a person (no vetting, double-booked).
3. The header counts only those person problems.
4. The duplicate breadcrumb on the slot picker goes.
5. Tests: a week with no prayer times shows one notice, not 35, and a
   vetting problem still shows red.

### E4. Save always in reach on a phone

1. A shared "Save bar" part. On a phone it is fixed just above the bottom
   bar, with Save full width and Cancel; the Scan circle never covers it.
   On a PC it looks as it does now.
2. Used on every form that records or edits something, about 40 screens
   (question 3). Search and filter boxes are left out.
3. Cancel added where it is missing (Dispose, and the first Lend step's
   Back).
4. Stocktake: the "Check and finish" bar no longer covers "Or type a label
   number".
5. The "Saved" message sits under the top bar, never over the page title
   or its badge.
6. Tests: on Record vetting, Save is visible without scrolling; on a phone
   nothing sits under the bottom bar.

### E5. Faster pages (behind the scenes)

1. The sign-in check is done once per page instead of twice. The
   permission tests must still all pass.
2. The item page loads its information in two waits instead of four.
3. Logos: the retired setting is replaced, and only the Centre photo loads
   early. Phones stop loading menu logos they cannot see.
4. Photos on item, ticket, claim and approval pages keep their space while
   loading, so buttons stop jumping. Lower photos load only when scrolled
   to.
5. Unused font weights and seven unused pictures (about 0.9 MB) go. The
   brand script stops making those pictures.
6. Proof: `npm run test:speed` before and after, with medians in the
   progress log.

### E6. Keep search engines out; icons on tabs and phones

1. A "keep out" notice (`robots.txt`) for every search engine and the
   named AI scrapers. The gatekeeper lets it through instead of sending it
   to sign-in.
2. Every reply from the site (pages, pictures, downloads) carries a "do not
   list, do not keep a copy" label.
3. The round ICCI coin as the browser-tab icon and the phone home-screen
   icon, with a dark green bar on phones. No offline mode.
4. The `/style` sample page answers "not found" on the live site and stays
   available for tests.
5. Tests first: the notice answers directly, not via sign-in; the label is
   on sign-in and on a logo picture; the icons load when signed out.

### E7. One look for detail pages

1. One page header and one fixed left edge on every detail and form page
   (today it jumps between 280 and 500 pixels).
2. One way to show facts (label over value). Codes such as ICCI-001203,
   T-0086 and EXP-0150 always use the code font, with the name in the
   title font.
3. Item page: the two documents sections become one. Empty sections fold
   into one line ("Nothing yet: moves, tickets").
4. Expense claim: the amount and the payee sit beside Approve ("Approve
   €43.21").
5. Ticket page (phone): one main button for the next step, and the rest
   behind "More".
6. Tab titles show the code (question 4).

### E8. Library desk and small phone fixes

1. Lend a book: +7 and +14 day buttons beside the due date, and Back on
   the first step.
2. The library desk tabs show the open tab, without sideways scrolling.
3. Weekly count: plural units beside the box ("12 rolls").
4. Cut-off placeholders fixed (tablet search, Scan page).
5. Small uppercase labels on tables and Home become sentence case at a
   readable size (UI-PLAN 3.2 allows this).

### E9. Arabic text direction everywhere

1. The shared text box and note box detect Arabic or English by themselves
   (`dir="auto"`). Email, password, number and date boxes stay
   left-to-right.
2. Names of items, places, categories and companies do the same on lists
   and detail pages. That covers the 15 older forms the later screens
   already handle.
3. Test: type an Arabic item name and an Arabic place name, save, and check
   both read right-to-left on the form and on the page.

### E10. Help and the user guide

1. The 41 user-guide pictures are retaken from the current screens, and the
   guide PDFs are made again.
2. The feature sheet's gold step numbers become dark green. Gold on small
   text breaks the colour rule and is too faint.
3. A "Help" link at the foot of the menu opens the user guide (question 5).
4. Then a fresh design review and speed check, to compare with 26/40.

## 5. Questions for the owner

Replying "all recommended" is enough.

1. **Phone Home order.** (A) Greeting, Urgent, Quick actions, approvals,
   Everything else *(recommended: the urgent list is short now, and phone
   users come to do something)*; (B) D9's order, with Quick actions last;
   (C) as now (approvals and actions first, the D1 decision).
2. **Fold filters on phones.** (A) Fold whenever a list has two or more
   drop-downs, replacing rule A2 *(recommended)*; (B) keep A2.
3. **Save bar.** (A) Every form that records or edits *(recommended: one
   habit everywhere)*; (B) the phone-first screens only (count, report,
   register, lend).
4. **Tab titles on detail pages.** (A) Codes only, such as "ICCI-000042 ·
   Projector", "T-0086" and "EXP-0150". People pages stay "Person", so no
   names show in browser history on a shared PC *(recommended)*; (B) names
   too; (C) leave as is.
5. **Help link in the menu.** (A) Yes, opening the user guide PDF
   *(recommended)*; (B) no.
6. **Weekly count shows last week's number.** (A) Keep it for now and ask
   real volunteers after the first month *(recommended)*; (B) hide it until
   the count is saved.

Suggested order: E1 to E4 first (what everyone sees, including the owner's
top three), then E5 and E6 (quick, invisible, and needed before a
permanent ICCI web address), then E7 to E10.
