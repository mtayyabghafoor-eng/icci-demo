# Progress log

Claude: read this at the start of every session. At the end of every session,
add an entry at the top with the date, what was built, what was decided, and
what comes next. Keep each entry under ten lines.

## Current phase

Phase 0: prototype on made-up data. Slices 1 (project setup), 2 (database
foundation), 3 (sign-in, two-factor, idle sign-out), 4 (items and labels),
5 (stock), 6 (assets: move, damage, missing, disposal), 7 (label sheet
printing), 8 (stocktake), 9 (home page counters) and 10 (security review)
are done, and so is slice 11 (finishing Phase 1: "Not seen in 12 months"
and the asset register with CSV). The full test suite passes. Audit fixes
1, 2, 3 and 5 to 10 are done, with the two slice 10 findings. Fix 4
(two-factor straight away on a new account) is built with the accounts
screen, in Phase 2, before any real account is created. Phase 1 screens
are complete. Phase 2 has started: slices P2.1 (people directory),
P2.2 (people connected to asset entries and admin accounts), P2.3
(Garda vetting), P2.4 (training dates), P2.5 (policies and versions) and
P2.6 (sign-offs and the policy grid), P2.7 (vehicles), P2.8
(renewals register) and P2.9 (email reminders) are done, which completes
PLAN.md section 5.2. The owner answered the questions in docs/PHASE-2-AND-3.md on 15 Nov
2026. The new look (docs/UI-PLAN.md, slices UI-1 to UI-8) is finished.
Phase 3 has started: slices P3.1 (prayer times and rota slot types),
P3.2 (rota week: build and assign), P3.3 (publish and the one-page
PDF), P3.4 (templates and funeral on call), P3.5 (maintenance
tickets: report, list, ticket page) and P3.6 (tickets: assign,
progress, priority, close, reopen) are done, which completes Phase 3
(PLAN.md section 5.3). Phase 4 (lending library, PLAN.md 5.4) is planned in docs/PHASE-4.md
(19 Nov 2026); the owner approved all nine answers. P4.1 (Library
Operator sign-in with an emailed code) and P4.2 (books and copies) are
done, and so are P4.3 (ISBN look-up from Open Library), P4.4
(borrowers, lend and return) and P4.5 (lists, lost and withdrawn copies,
Home cards), which completes Phase 4 (PLAN.md 5.4). After the
Clonskeagh visit the owner chose a week of inventory work first:
P1.12 (places and place labels), P1.13 (register a room), P1.14
(disposal routes and sale record), P1.15 (property-tag asset label) and
P1.16 (Home and menu polish) are done (20 Nov 2026), and so is UI-9, the
presentation polish (calmer Home, folding menu, Back button, Library
overview and desk tabs, label emblem, demo names; 20 Nov 2026). On 21 Nov
2026 the owner approved slices P1.17 to P1.21 (categories in two levels,
"What we own", companies and makes and models, documents, "If this goes
wrong"); all five are done (22 Nov 2026), with category pictures, the
staff call sheet and the in-app camera on the stocktake screen. Next:
the owner tries them on the demo, then Phase 5 (expenses). Before real use: Resend as Supabase's mail sender, then switch
on the code email wording (supabase/config.toml).
Real reminder emails still need the owner to create the Resend account
(project mailbox) and put RESEND_API_KEY, REMINDER_FROM and
REMINDER_TEST_TO into .env.local; the daily timer starts once the site is
on Vercel (vercel.json, CRON_SECRET in Vercel's settings).

Not yet checked in real life (Phase 1): a real label printer, a real phone
camera scan of a printed label, and timing a 20-shelf weekly count.

## Decisions made

- Admin-only system: three roles (Super Admin, Centre Admin, Finance), plus a
  limited Library Operator added in the library phase.
- No offline mode. No staff or volunteer logins.
- Stack confirmed (14 Nov 2026): Next.js with TypeScript, Supabase (database,
  sign-in with authenticator-app two-factor, private file storage) in an EU
  region, hosted on Vercel in an EU region.
- Development database: a free Supabase cloud project, not Docker on the PC.
  Made-up data only. Tests and resets run against this project.
- Environments: development only for now. Staging is added when the prototype
  is first shown to others. Production comes later, in ICCI-owned accounts.
- Plans: free tiers for the prototype. Production needs paid plans (Supabase
  Pro about $25/month, Vercel Pro about $20/month), mainly for backups,
  organisational use and server-side idle sign-out.
- Idle sign-out after 15 minutes is built in the app now; the server-side
  setting is switched on when moving to paid plans.
- Ireland-only network rule: left out of the prototype, decide at production.
  It is an extra layer only; the real protection is two-factor and the
  database rules.
- Accounts (GitHub, Supabase, Vercel) are created with a new email used only
  for this project, so they can be handed to ICCI later.
- QR labels: prototype labels use the free temporary web address and are test
  labels only. Real labels are printed only once ICCI has a permanent address
  (e.g. under icci.ie).
- Label sheet: A4, 21 per sheet, 63.5 x 38.1 mm (Avery L7160 size).
- Look: page background warm white #FAF8F3. Titles in Playfair Display
  capitals, body text in Source Sans 3 (free fonts, built into Next.js, no
  extra dependency).
- Language: English screens. All text fields accept and display Arabic.
- Finance and the library operator cannot see locations (14 Nov 2026: least
  access; add read access later if expenses need it).
- The database starts insisting on two-factor sign-in in slice 3, when
  two-factor is built (14 Nov 2026).
- Nobody can change their own role or switch off their own account.
- Improvement plan (25 Nov 2026, docs/IMPROVEMENT-PLAN.md section 6): the
  owner chose every recommended answer: Round A, then Phase 5, then Round
  C; one "Report a problem" with a "broken or damaged" tick; Home puts
  people and safety first and each line opens its list filtered; menu adds
  only "Stock corrections waiting" and "Reminders"; several rota days at
  once (A7); no rota policy warning; Switch off red, no sheet; database
  types and an iPhone camera add-on (named and asked first) in Round C.
  A3's migration approved for local, then ICCI Staging, then main.
- New look (15 Nov 2026, docs/UI-PLAN.md): left sidebar on a PC, bottom bar
  with a Scan button on a phone; round logo allowed on dark green; Title
  Case titles; fonts Cormorant Garamond, Plus Jakarta Sans, JetBrains Mono
  (replacing Playfair Display and Source Sans 3); Lucide icons (new
  dependency, approved); faint eight-point-star pattern on green; owner's
  three Centre photos used, enhanced by us (no larger originals exist);
  "Recent activity" on Home waits until after Phase 2.
- Sign-in (14 Nov 2026, slice 3): the database refuses Super Admin, Centre
  Admin and Finance unless the authenticator code was entered. How each role
  signs in is stored on the role (roles.sign_in_method).
- Library operator: blocked completely until Phase 4 builds its emailed-code
  sign-in (owner chose option A).
- Forgotten password or lost phone: no self-service; a Super Admin resets it
  once the accounts screen exists. For now, re-run the seed (option B).
- Public sign-up is switched off on the Supabase project, recorded in
  supabase/config.toml and sent with `npx supabase config push` (option C).
- First-time set-up starts only when the admin presses "Show my QR code".
- Items (slice 4, 14 Nov 2026): categories are a list in the database that
  can grow; one consumable record per item per store room or shelf; editing
  covers name, category, notes, value, dates, unit, minimum and photo, while
  moving and condition changes wait for slice 6 (the database refuses them
  until then); the phone's own camera app reads labels (no scanner add-on).
- Condition colours: good green, fair amber, damaged and missing red,
  disposed grey. Consumables show "Not counted yet" (grey) until slice 5.
- Finance cannot see items (same as locations; revisit for the asset register).
- Locations are strict: building > room > store room > shelf; a location's
  kind can never change; names are unique within the same parent.
- Stock (slice 5, 14 Nov 2026, owner chose all recommended answers): an
  adjustment corrects ONE earlier count or restock with the right number and
  a reason, and counts only once a different admin approves it (rejecting
  needs a reason; a decision is final). Free plus-or-minus adjustments wait
  for stocktake (slice 8). Never-counted stock shows "Not counted yet" and is
  not on the low-stock list. Low = at or below the minimum; Out = zero.
- Assets (slice 6, 14 Nov 2026, owner chose all recommended answers):
  disposal waits until a DIFFERENT admin approves it (rejecting needs a
  reason); disposed is final. A damaged asset can be marked repaired and a
  missing one found (back to Good or Fair). Consumables are not moved: new
  stock in another store room is registered as a new record. Every move or
  report needs a note and "reported by" (free text until Phase 2); a photo
  is optional. The photo counts as the one-tap camera button, not a field.
- A new item cannot be registered as already disposed.
- Label printing (slice 7, 15 Nov 2026, owner chose all recommended
  answers): QR codes drawn by the `qrcode-generator` add-on (no add-ons of
  its own; nothing sent anywhere). Only the database hands out label numbers
  (next after the highest; 1 to 210 per sheet run); labels can no longer be
  added one by one. "Print again" reprints the same numbers and is recorded.
  Labels say "TEST LABEL" unless ICCI_ENVIRONMENT is "production". The QR
  link uses the address the app is open on. "Skip the first spaces" (0-20)
  for part-used sheets.

- Stocktake (slice 8, 15 Nov 2026, owner chose all recommended answers): one
  room at a time, including its store rooms and shelves. Can be paused; one
  unfinished stocktake per room. Differences (missing, found here but
  recorded elsewhere, counted a different number) are worked out by the
  database and approved or rejected one by one by an admin who did not start,
  scan in or send it. A label with no item is noted as "unknown label found".
  An approved count difference is applied to the stock as it is now (stock
  added meanwhile is kept), never below zero. Shelves not scanned do not
  change. Labels scanned with the phone camera go to the stocktake while
  "scanning" is on in that browser (a cookie that holds only the number).

- Home page (slice 9, 15 Nov 2026, owner chose all recommended answers):
  only counters whose lists exist today (low stock, missing or damaged);
  later phases add theirs. One "for you to approve" counter per queue, never
  counting your own entries or stocktakes you took part in. Finance sees a
  note ("Nothing for your role yet") instead of counters. Red when not zero,
  green "All clear" at zero.

- Audit fixes (15 Nov 2026, owner chose the recommended answers, passed on
  from the slice 10 chat): a missing asset scanned in a stocktake becomes
  "found"; the approver picks Good or Fair, and it is moved to the room if
  recorded elsewhere. A stocktake difference cannot be approved once any
  asset entry for that item was made after sending, or a disposal waits;
  rejecting always works. A place that still holds items (disposed assets
  and shelves counted to zero do not count), or overlaps a stocktake under
  way, can be neither switched off nor moved; places inside must be
  switched off first; nothing new goes inside a switched-off place. Built-in
  roles cannot be switched off or have their sign-in method changed, except
  by a numbered migration. Record numbers (ids, role codes) never change.
- Passwords (audit fix 3, owner agreed 15 Nov 2026): at least 12
  characters with letters and numbers. Set in supabase/config.toml and sent
  to the dev project with `npx supabase config push`; the same rule lives in
  scripts/password-rule.mjs for the test password.

- Phase 2 and 3 questions (15 Nov 2026): owner approved all recommended
  answers in docs/PHASE-2-AND-3.md section 8, adding Caretaker and Gardener
  to the person roles (both need vetting). Two-factor on new accounts: a
  one-time temporary password, valid 24 hours, that opens only the
  authenticator set-up; built with the accounts screen before real accounts.
- Not seen in 12 months (slice 11, 15 Nov 2026, owner chose all recommended
  answers): "seen" = registered, moved, reported damaged, marked repaired or
  found, or scanned in a stocktake. Not: opening the page, editing details,
  a missing report or a disposal request. Disposed assets and consumables
  are left out. Worked out by the database (view asset_last_seen).
- Asset register (slice 11): fixed assets the Centre still has (disposed
  left out), totals by place, one place in detail, CSV download. Super
  Admin and Centre Admin only; Finance not yet (revisit in Phase 5). The
  CSV opens correctly in Excel with Arabic, values are plain numbers, and
  a name can never run as a spreadsheet formula.

- People directory (P2.1, 15 Nov 2026, owner's approved answers): one main
  role per person; ten roles and ten sections to start (lists that can grow,
  each with an on/off switch). Only name, role, section, phone, email and
  start date are kept; no notes box. Phone and email optional but checked.
  The same name twice gives a warning the admin can pass, not a refusal.
  People are switched off, never deleted. Super Admin and Centre Admin
  only. Screens to manage the role and section lists are not built yet
  (the database already allows it).

- Connecting people (P2.2, 15 Nov 2026, owner chose all recommended
  answers): "Reported by" on a new asset entry is a person picked from the
  directory (switched-on people only) or "Someone else" with a typed name,
  never both; old entries keep their typed names. The form starts with you
  if your account is linked. A stocktake approval names the admin who sent
  it: their person record if linked, else their name. A person links to at
  most one admin account and back; only a Super Admin links, changes or
  removes a link, never on their own account. "Your own entry" still means
  the account that made it. Screenshot helper retries a Windows file lock
  up to 3 times, half a second apart.

- Garda vetting (P2.3, 15 Nov 2026, owner chose all recommended
  answers): one entry per event (applied, vetted, not required), never
  changed; a wrong one is withdrawn with a reason (any admin, including
  the one who entered it). Expiry filled in as vetted date + 3 years,
  changeable per person (at most 10 years; the expiry date is the last
  valid day). Status worked out from today in Dublin: Valid, Due soon
  (60 days or fewer), Applied, Not vetted, Expired, Not required. Re-vetting
  applied while still vetted keeps Valid/Due with the applied date. One
  admin is enough, never for their own vetting (database rule). No new
  entries for switched-off people; they are left out of the list and the
  home counter. No future dates. Status and dates only.

- Training dates (P2.4, 16 Nov 2026, owner chose all recommended
  answers): one entry per course done (type, date done, optional
  expiry), never changed; a wrong one is withdrawn with a reason. Each
  training type has an optional usual length (1 to 10 years) that fills
  in the expiry; the admin can change it or empty it (no expiry). Starting
  lengths are a guess to check: Fire safety 1, First aid 2, Safeguarding
  awareness 3, Manual handling 3. Status from today in Dublin: Valid, Due
  soon (60 days or fewer), Expired, No expiry; the newest course of each
  type counts. Only recorded training is shown: no "required training"
  rules and no home counter yet. Never for your own record (database rule).

- Policies and versions (P2.5, 16 Nov 2026, owner chose both recommended
  answers): publishing counts as an approval, so a different admin must
  publish; nobody publishes a version they uploaded or last changed
  (database rule). The next review date is required, suggested as one year
  after approval, at most five years. A version starts as a draft (can be
  changed, one at a time per policy); once published it never changes. The
  newest published version is the current one. PDFs only, 10 MB at most,
  in a private store: added and viewed, never replaced or deleted. Review
  status: overdue (red), due within 60 days (amber), up to date (green).
  Policies are switched off, never deleted. Website upload limit raised
  from 7 MB to 11 MB so a 10 MB PDF fits.

- Policy sign-offs (P2.6, 16 Nov 2026, owner chose the recommended
  answer): nobody records or withdraws their own sign-off; another admin
  does (database rule, same as vetting and training). One live sign-off
  per person per version; only published versions; never in the future or
  before approval; withdrawn with a reason, never deleted. One signed sheet
  can be entered for several people at once, with an optional scan (PDF or
  picture, 6 MB, private, never replaced). The grid is worked out against
  each policy's current version: Signed, Unsigned, or Overdue (unsigned
  more than 30 days after publishing). A new version resets everyone.

- Vehicles (P2.7, 16 Nov 2026, owner chose all recommended answers): a
  vehicle is an ordinary fixed asset (category "Vehicles", with a label)
  plus registration (unique, capitals), make and model, and a keeper (any
  switched-on person, or nobody). Motor tax, insurance and NCT are dated
  entries ("renewed on, valid until"), never typed over; the latest "valid
  until" counts; a wrong entry is withdrawn with a reason. "NCT not needed
  yet" is allowed for newer cars. Valid, Due soon (60 days), Expired, Not
  recorded. A vehicle record is switched off, never deleted. No home
  counter yet: the renewals register (P2.8) gathers all dates.

- Renewals register (P2.8, 16 Nov 2026, owner chose all recommended
  answers): a typed-in renewal has title, category (Insurance, Licence or
  permit, Safety inspection, Service contract, Certificate, Subscription,
  Other), owner (a switched-on person, or nobody), documents needed and
  notes; switched off, never deleted. Due dates are dated entries ("Mark
  renewed" adds one; the latest counts; a wrong one is withdrawn with a
  reason), at most 10 years ahead. The register also reads vehicle tax,
  insurance and NCT, Garda vetting expiry, policy reviews and asset
  warranties (never copied). Overdue red, Due soon (60 days) amber, Up to
  date green; an ended warranty is grey "Ended", not overdue. Training
  dates left out. Finance sees nothing. Home counter: overdue, or due in
  30 days. The category list is a first guess, easy to change.
- Email reminders (P2.9, 17 Nov 2026, owner chose all recommended
  answers): Resend as the email service (free tier; no new package, the
  site calls it directly); Vercel's daily timer at 07:00 UTC (vercel.json);
  reminders at 60, 30 and 7 days, none after the due date; each once per
  due date, a missed day catches up with the latest stage only; one
  summary email a day to switched-on Super Admins and Centre Admins only;
  no people's names in emails ("Garda vetting for 1 person"). Nothing is
  ever emailed from the development database, without the email service,
  or to a .test address: those are "recorded only". Records of runs,
  reminders and emails are append-only. Super Admin has "Run today's
  reminders" and "Send a test email" (project mailbox only, not recorded).
- Timer access (P2.9, owner's decision 17 Nov 2026): the one narrow
  exception to "signed-out visitors can run nothing": run_reminders and
  record_reminder_deliveries, which do nothing without the timer's key
  (CRON_SECRET, 64 random characters). The database keeps only its
  SHA-256 fingerprint (npm run setup:reminder-key; the dev seed restores
  it after a reset). The security report allows exactly these two by name.
  The website still never uses the master key.

- Prayer times and slot types (slice P3.1, 18 Nov 2026, owner chose all
  recommended answers): Super Admin and Centre Admin only. Slot types are a
  list that can grow (add, rename, reorder, vetting tick, switch off; never
  deleted); a slot's group and the prayer time it takes are fixed once
  added. To start, Security, Volunteers and Funeral on call need vetting.
  Prayer times are typed in a month at a time, never calculated; any day,
  past ones too, can be corrected (audit log keeps the old time). Isha may
  fall after midnight; Jumu'ah times on Fridays only. Test months use
  2000-2019 so they never mix with the made-up sample times.

- Rota weeks (slice P3.2, 18 Nov 2026, owner chose all recommended
  answers): a new week starts with empty prayer slots every day and the
  Jumu'ah slots on Friday; shifts and on call are added by hand until
  templates (P3.4). One person per slot (two on a duty = the slot twice).
  Nothing is typed over: putting on, swapping or taking off adds an entry
  replacing the old one. Double-booking counts a prayer duty as 30
  minutes, Jumu'ah 60. A week is locked once its Sunday has passed (the
  master key, used only by the seed and tests, can still record past
  weeks). A night shift across midnight is two slots. Warnings never block.

- Publishing the rota (slice P3.3, 18 Nov 2026, owner chose all
  recommended answers): publishing a rota is routine work, not an
  approval, so the admin who built the week may publish it. A week can be
  published again after changes; it stays "published" and every
  publication is kept for good with a frozen copy (names and roles only, no
  phone numbers). Warnings showing: the admin must tick "I have seen the
  warnings". Home card "Today's rota" counts today's slots not filled
  (amber; also amber when today has no rota).

- Rota templates and funeral on call (slice P3.4, 18 Nov 2026, owner
  chose all recommended answers): a template holds only the extra slots
  (shifts, on call, extra people on a prayer); prayers and Jumu'ah still
  come by themselves. Exactly four templates; admins add and switch off
  their slots, never delete. The two Eid templates are one-day templates
  (Eid's date moves each year): "use" asks which day is Eid, on top of the
  week's template. One week template per week. "Use a template" refuses
  once anyone is on the week. New slot type "Eid prayer" (a timed duty).
  Funeral on call: whole day, every day, needs vetting; Today's rota shows
  who is on call with their phone number (admins only, never printed).
  Starting contents are made-up examples for the Centre to edit.

- Maintenance tickets (slice P3.5, 18 Nov 2026, owner chose the
  recommended answers): priority Low / Normal / Urgent on the report
  screen, starting on Normal. No location page for now; the tickets list's
  place filter (which includes what is inside a place) does that job. A
  ticket's details never change once reported (anything new is a note);
  status, assignee, closing note, cost and closed date change only from
  history entries, never typed over. The whole database side (assign,
  status, note, close, reopen) is built in P3.5; their screens come in
  P3.6. Closing needs no second admin (question 9).

- Ticket actions (slice P3.6, 19 Nov 2026, owner chose the recommended
  answers): priority can change after reporting, as a history entry;
  anyone switched on in the people directory can be assigned. Closing can
  also mark a damaged asset repaired (Good or Fair) in one step; both
  records are saved together or not at all, and point at each other.
  "Report damage" offers "Open a ticket for this" (once per report).
  Approving a disposal warns when the asset has tickets not closed. Home:
  "Open maintenance tickets", red when any, urgent ones named.

- Library (Phase 4, 19 Nov 2026, owner approved all nine answers in
  docs/PHASE-4.md): Open Library look-up (only the ISBN is sent); books use
  the same ICCI-000123 labels, printed by an admin; ISBN typed, camera on
  Android only for now (ZXing for iPhones decided after a real try); loans
  21 days, up to 3 books, no fines; borrowers separate from People; emailed
  codes through Supabase's own email for the prototype, Resend before real
  use; the operator may mark a book lost alone; adult borrowers only; no
  reminder emails to borrowers in Phase 4.
- Places and room registration (19 Nov 2026, after the Clonskeagh visit,
  owner chose all recommended answers; PLAN.md 5.1): place labels are
  shelf-edge style, 99.1 x 38.1 mm, 14 per A4 (Avery L7163 size); place
  numbers PL-0001, given by the database, never changed or reused, apart
  from item labels; Super Admins and Centre Admins add, rename and switch
  off places. Two slices: P1.12 (places) and P1.13 (register a room).
- Staging demo (19 Nov 2026): made-up data may be seeded on staging, never
  production; the site runs in Frankfurt (fra1) next to its database.
- Disposal routes (P1.14, 20 Nov 2026, owner's answers of 19 Nov): seven
  routes; a sale is a record only, not accounting; a different admin still
  approves; the route and sale details can never change.
- UI-9 presentation polish (20 Nov 2026, owner's prompt and four mockups;
  plan approved): Home follows mockup 4 (four headline numbers, slim Needs
  attention rows, green all-clear chips, four action tiles plus "More
  actions"); menu groups fold, Overview always open; "Back" in the top bar
  goes one level up, never browser history; saved messages float for 8 s;
  admins get "Library overview" and "Library desk" (tab bar), the Library
  Operator keeps all nine links; labels get a hand-drawn black dome emblem
  (not the logo) and "DEMO" instead of "TEST LABEL" on staging only.
  Left out: bell, recent activity with photos, trend arrows. The code
  freeze for the demo video was lifted; the owner agreed to one more wipe
  of the demo, refilled with realistic demo-only admin names and fleet numbers.
- Finding, counting and fixing assets (21 Nov 2026, owner approved the
  plan; PLAN.md 5.1, slices P1.17 to P1.21): two-level categories (about
  nine main ones, each with an "Other" sub-category; items in a
  sub-category only); "working" means Good or Fair; shared manuals and
  contacts live on a make-and-model list; who to call is the item's
  service company, else the model's, else the sub-category's; Claude
  drafted the category list for the owner to edit.
- P1.18 to P1.21 (21 Nov 2026, owner): pictures on main categories with
  tiles that open into sub-categories; staff cannot log in, so each
  category has a contact person and there is a printed call sheet (option
  chosen over phone numbers on labels or a signed-out report form); the
  stocktake screen gets the in-app camera (it had none).
- Tests run on a local Supabase in Docker (20 Nov 2026, owner's choice);
  the demo database may be wiped once and refilled with demo-only names
  (owner agreed 20 Nov 2026).

## Open questions


- Permanent web address for real QR labels (needs ICCI).
- Ireland-only rule: decide at production.
- Library: how long to keep a borrower's details, decided with ICCI
  before real borrowers (docs/PHASE-4.md section 10).
- Later phases still marked "to confirm" in PLAN.md: restricted fund list, second-approver threshold, bookkeeper CSV format.

## Session log

- 25 Nov 2026, session 45 (slice A4, one "Report a problem"; owner said go,
  demo included): migration 0048 report_problem() (tests first) records the
  ticket and, if "It is broken or damaged" is ticked, the damage entry in
  one step, linked. Item page: green "Report a problem" first, no "Report
  damage" button (the damage form still opens from older links,
  mayReportDamage). Report a problem from the menu finds the item by name or
  label. Ticket summary shows "Passed to" and the job number; closing a
  ticket on a damaged item starts with "mark repaired" ticked. Full suite
  green (1795 + 321, build). 0048 to ICCI Staging, then pushed. Next: A5.

- 25 Nov 2026, session 45 (slices A6 and A3; owner chose every recommended
  answer and approved A3 for local, staging and main). A6: ICCI not-found
  and "Try again" pages (app/ and (app)/), must() makes six lists and the
  policy grid stop on a failed read instead of saying "nothing", a
  database hiccup at sign-in retries then shows "Try again" (no sign-out),
  empty-list cards with Clear filters, call sheet 15 mm print margin and
  phones by record. A3: migration 0047 (tests first: 4 failed before, pass
  after): stale shelf shortfall refused after a newer count, rejected
  disposal no longer blocks, loan "lost" only via the copy, undone return
  re-checks 3 books and borrower on; scan note corrected. Full suite all
  green (1785 + 319, build). Next: 0047 to ICCI Staging, push, then A4.

- 25 Nov 2026, session 45 (slice A2, phone fixes; owner away, said to do as
  much as possible): Save/Finish bars sit above the bottom bar
  (.sticky-actions); drop-down-only lists show their filters on phones and
  hide "More filters"; idle warning says "Tap the screen" and clears the
  iPhone home bar; item page shows buttons before details on phones; room
  camera opens the next room's door label (then "Register a room");
  leaving a weekly count with unsaved numbers asks first; DataTable and the
  stocktake list are cards on phones. Full suite: 1778 unit/db passed;
  browser 314 passed, 1 failed (test clicked the now-hidden button), fixed
  and re-run green. Not pushed. Next: A3 needs the owner's OK for the
  staging database (migration 0047).

- 25 Nov 2026, session 45 (slice A1, messages and "Are you sure?"; owner
  said go as recommended: Switch off gets the red button, no sheet): refusals
  red and staying (one list, src/lib/ui/messages.ts); "cannot see" notes
  grey; ConfirmSubmit sheet (UI-PLAN 5.5) on publish policy, withdraw copy,
  approve disposal, remove rota slot, unlink account; every Switch off the
  red outline button; form borders #87948f (3:1); lining numbers; message
  settings tidied from the address. Full suite: 1778 unit/db passed; browser
  302 passed, 5 failed (test expectations, Windows file locks), fixed and
  re-run green. Screenshot retry now 8 tries. Next: A2 (phone fixes).

- 25 Nov 2026, session 45 (continued, no code changed): checked Gemini
  Carbon's two reports. Added to docs/IMPROVEMENT-PLAN.md: lining numbers in
  titles, unsaved-count warning (A2), stocktake approve link (A5), call sheet
  same-name phones (A6), failed reminder emails retried and smaller security
  items (Round C). Found UI-PLAN 5.5 already agreed a confirmation sheet for
  dangerous actions that was never built; A1 builds it. Question 4 reworded
  (sheet on "Switch off" or not). Next: owner says go on A1.

- 24 Nov 2026, session 45 (continued, no code changed): checked three more
  Gemini reviews (code, security, screens). New confirmed bugs: a stocktake
  shortfall applied on top of a newer shelf count, a rejected disposal still
  blocking a stocktake difference, a library loan closed as lost without the
  copy, the policy grid cut off at 1,000 squares, sign-out on a database
  hiccup. Wrote docs/IMPROVEMENT-PLAN.md: Round A (7 fix slices) before
  Phase 5, Round C (4 slices) before launch, 10 questions for the owner.
  Next: owner answers the questions; then slice A1.

- 23 Nov 2026, session 45 (review only, no code changed): checked Gemini's
  UI audit against the code. Confirmed: refusals shown in green and fading
  after 8 s, phone save bars hidden behind the bottom bar, empty phone
  filter boxes on 5 lists, stale "Mark found" note on the stocktake scan,
  Low stock amber/red mismatch on Home, damage note not copied into the
  ticket, no "are you sure?" on permanent actions. Overstated: "two design
  systems" (looks the same), "Loading…" (a shared placeholder exists). Some
  ideas go beyond PLAN.md (rota policy warnings, iPhone scanner add-on).
  Next: owner picks which batch of fixes to plan first.

- 22 Nov 2026, session 44 (continued): online demo made realistic (owner's
  decisions): real Dublin firms and the real FAAC 391 and Mitsubishi MSZ-AP
  manuals (git-ignored demo-files/; the Honda manual is 16 MB, over the
  10 MB limit, so it is not stored), male Arabic admin names, people's
  phones in the unused 01 000 range, no emails, about 80 items, no Demo
  banner, label tag or "made up" note. Demo wiped (third time, owner's yes)
  and refilled with migrations 0041-0046. The first push failed on Vercel:
  categories/icon.tsx is a special Next.js file name; renamed, and npm test
  now ends with the production build. New npm run test:speed: all 33 main
  pages under 0.5 s on PC and phone, no browser errors. Full run: 1,778
  unit and database tests, 303 browser tests, build: all passed.

- 22 Nov 2026, session 44 (P1.18 to P1.21, migrations 0042 to 0046; owner
  asked for all of it in one go): category pictures and tiles; "What we
  own" (Total, Working, Not working, Missing, open tickets, per place;
  category_counts); search also finds categories, makes, models, serial
  numbers and companies; companies and makes and models; item fields
  (model, maker's serial, supplier, service company); category service
  company and contact person; documents (asset-documents store, hide with
  a reason); "If this goes wrong" card on item, ticket and report pages;
  "Passed to a company" ticket step; staff call sheet; stocktake camera
  fix. Clean-up: one shared form reader and ID check instead of 14 and 52
  copies; one page frame (PageShell). Tests first throughout.

- 21 Nov 2026, session 43 (plan for finding, counting and fixing assets;
  slice P1.17, migration 0041): owner raised that the item list is
  overwhelming, nothing counts "how many air conditioners, how many work",
  and nobody knows who to call when something breaks (the main gate).
  Plan approved: P1.17 to P1.21 (PLAN.md 5.1). Built P1.17: ten main
  categories with sub-categories and an "Other ..." each; today's 11 keep
  their numbers as sub-categories; items only in a sub-category (database
  rule); new Categories screen (add, rename, move, switch off); grouped
  pickers; the Items filter takes a whole main category; 36 demo items for
  the new sub-categories. Tests first. Next: P1.18 "What we own".

- 20 Nov 2026, session 42 (UI-9 presentation polish, no migrations): the
  owner's review prompt and four ChatGPT mockups compared; mockup 4 chosen
  for Home. Built: folding menu, top-bar Back (52 pages), floating saved
  messages (18 pages), loading shapes, thin scrollbars, calmer Home, new
  /library/overview and the Library desk tab bar, label dome emblem and
  DEMO tag, 48 px phone buttons, staging-only prayer note, demo names
  (Tariq A. Demo, ICCI-VAN-01...), "Initial import" instead of "Seed
  script". Tests first; new tests/e2e/ui-polish.spec.ts. After this
  commit: push to main, wipe and refill the demo (owner agreed); the owner
  then pairs the demo phone sign-in again.

- 20 Nov 2026, session 41 (overnight, P1.13-P1.16, owner asleep, asked for
  no prompts): P1.13 register a room: "Register items in this room" on a
  place page; each label needs only a name (kind and category copied from
  the last item there); phone-camera scans come back while it is on (12-hour
  cookie with only the place's number). P1.14 migration 0040: every new
  disposal picks one of seven routes; sold needs price, buyer, date, who took
  the money; charity/owner need a name; never changeable; old disposals say
  "Route not recorded". P1.15 item labels are property tags. P1.16 menu:
  Places next to Register an item, new "Disposals waiting" link; Home quick
  actions "Register a room" and "Report a problem". Tests first throughout.
  The demo refill waits for .env.staging (still empty).

- 20 Nov 2026, session 41 (P1.12 finished; tests moved to Docker; demo
  tools): the demo database got migrations 0026-0038 (owner agreed). Cloud
  icci-dev resets kept timing out (over its free log allowance), so the
  owner installed Docker: tests, `db:reset` and `db:seed` now use a local
  Supabase (`npm run setup:local-db`, `.env.localdb`); cloud versions are
  `db:reset:cloud` / `db:seed:cloud`. Found and fixed: the Places screens
  lost places past 1,000 rows (now read page by page). Added
  `npm run db:seed:staging` (only ever ICCI Staging), demo-only realistic
  names (scripts/demo-names.mts) and a "Demo: all names and records are
  made up" banner on the demo only. Owner agreed a one-off wipe of the demo.
  PLAN.md gained P1.14-P1.16. Next: P1.13, register a room.

- 19 Nov 2026, session 40 (slice P1.12, places and place labels): merged
  the staging demo setup into main. Migration 0039 gives every place a
  number (PL-0001). New Places screens: the tree, add (building, or the
  next kind down inside a place), rename, switch off or on, a page per
  place showing what is inside and what is there, and place label sheets
  (14 per A4). Scanning /p/PL-0001 (camera or phone camera) opens the
  place; Finance and the Library Operator get "label not recognised".
  "Register an item here" fills in the place. Next: P1.13, register a room.

- 19 Nov 2026, session 39 (slice P4.5, library lists and lost books):
  migration 0038 (library_copy_entries: lost, withdrawn, found; never
  changed or deleted; the Library Operator may mark lost alone). Lost: the
  copy cannot be lent, and a loan it was on ends with a "lost" entry;
  found puts it back. Withdrawn: for good, and not while on loan. Read-only
  views: library_copy_list (each copy's status), library_most_borrowed,
  library_counters. Screens: On loan, Overdue (with the contact to phone),
  Most borrowed (period), Lost and withdrawn, lost/withdrawn/found buttons
  on the copy page, "Library books overdue" Home card (also the Library
  Operator's whole Home). CSV for admins only (Library Operator gets 403).
  Seed: 8 lost/withdrawn entries. Tests first.

- 19 Nov 2026, session 38 (slice P4.4, borrowers, lend and return):
  migration 0037 (library_borrowers: name and ONE phone or email;
  library_loans and library_loan_entries, never changed or deleted;
  returned, due date moved, "returned by mistake" are entries; the
  library_loan_status view works out on loan, due date, overdue and days
  late). The database refuses a second loan of a copy (locked, so two
  phones cannot both lend it), a 4th book, a switched-off borrower or
  book, past due dates, and switching off a borrower with books out.
  Screens: Lend and Return (scan or type the label), copy page with one big
  Lend or Return button, move the due date, returned by mistake, Borrowers
  list and page, correct details, switch off; book page shows who has each
  copy. Seed: 25 made-up borrowers, 31 loans in every state. Tests first.

- 19 Nov 2026, session 37 (slice P4.3, ISBN look-up): migration 0036
  (add_book_and_copy records "typed" or "looked up"). Add a book now asks
  for the ISBN first (typed, or "Scan the barcode" on phones whose browser
  reads barcodes, Chrome on Android), asks Open Library from the server
  (only the ISBN sent; gives up after 5 s), fills in the details to check;
  "not found" or "no answer" opens the form with the ISBN; an ISBN already
  held offers "Add another copy". "No ISBN? Type the details" for the rest.
  One real Open Library check (owner agreed) confirmed the answer shape.
  Browser tests use a pretend Open Library on this computer (made-up books;
  close any running dev server before a test run). Tests written first.
  Not yet checked: a real barcode scan on an Android phone.

- 19 Nov 2026, session 37 (slice P4.2, books and copies): migration 0035
  (library_books, library_copies; ISBN checked and kept as 13 digits, one
  book per ISBN; a label is on an item OR one copy, never both, locked so
  two phones cannot clash; label_use tells the Scan button what a label is
  for; add_book_and_copy saves both or neither). Screens: Library list
  (search), Add a book (new, or another copy of one we have), book page,
  Correct the details, Add a copy, copy page (what a scanned book opens);
  Library menu and phone bar for the operator; "Add a book instead" on an
  unused label for admins. Typed values now survive a refused form. Seed:
  60 made-up books, 90 copies on labels 301-390. Tests written first.

- 19 Nov 2026, session 37 (slice P4.1, library sign-in): migration 0034
  (Library Operator gets in ONLY with an emailed code; admins need password
  AND authenticator: closes a gap where emailed code + authenticator, no
  password, was accepted). Sign-in settings sent to icci-dev: 6-digit codes,
  10 minutes; email wording refused on the free plan (waits for Resend).
  Screens: "Sign in with an emailed code" link, Library Sign In, Check Your
  Email (address kept in a cookie, never the address bar; every address
  sees the same page), operator's Home. Seed: switched-off operator added.
  Tests written first. Next: P4.2 (books and copies).

- 19 Nov 2026, session 37 (Phase 4 plan, no code): wrote docs/PHASE-4.md:
  how the library fits what exists, who can do what, six tables (books,
  copies, copy entries, borrowers, loans, loan entries; nothing changed or
  deleted, status worked out from entries), ISBN look-up, screens, the
  emailed-code sign-in, five slices P4.1 to P4.5, checks, privacy points
  (borrower retention vs the audit log; adults only) and nine questions.
  Found: iPhones cannot pass an ISBN barcode to a website without a new
  library (question 3). Tests not run (no code changed). Owner approved
  all nine recommended answers (see Decisions). Next: P4.1.

- 19 Nov 2026, session 36 (slice P3.6, ticket actions): migration 0033
  ("priority" entries; close_maintenance_ticket saves the close and the
  "mark repaired" asset entry together; home_counters gains open and
  urgent tickets). Screens: ticket page buttons (Close, Mark in progress /
  waiting / Back to open, Assign, Change priority, Add a note with photo,
  Reopen), Close a ticket page, "Open a ticket for this" after Report
  damage, disposal warning, Home card. Tests written first. Phase 3 done.

- 18 Nov 2026, session 36 (slice P3.5, maintenance tickets): migration
  0032 (maintenance_tickets; maintenance_ticket_events kept for good;
  private ticket-photos store). Screens: Report a problem (phone-first,
  from the menu or an asset's page), Tickets list (not closed first,
  urgent on top; status, priority, place, assigned filters; CSV), ticket
  page with full history; item page lists its tickets. Menu group
  "Maintenance". Seed: eight made-up tickets in every status. Tests
  written first. Next: P3.6.

- 18 Nov 2026, session 35 (slice P3.4, templates and funeral on call):
  migration 0031 (rota_templates, rota_template_slots, rota_template_uses
  kept for good; use_rota_template; slot type "Eid prayer"; the four
  templates with made-up contents). Screens: Templates, one template (add
  for several days at once, switch off), Use a template (from the Rota
  week, only while nobody is on it), funeral on call with phone on Today's
  rota. Seed: the week after next filled from Normal week; funeral on call
  given to people with a made-up phone. Tests written first.
  Next: P3.5 (maintenance tickets: report, list, ticket page).

- 18 Nov 2026, session 34 (slice P3.3, publish and one-page rota):
  migration 0030 (rota_publications, never changed or deleted; publish_rota_week;
  view rota_changes; home counter rota_today). Screens: Publish (warnings
  in words, tick), one-page rota (A4 landscape, Save as PDF; "Changed" in
  amber; slots taken off listed), Today's rota, Home card; Rota week shows
  "Published ... by", "Publish again" and amber "Changed". Seed: this week
  published once, then one Fajr name changed. Tests written first. Sample
  PDF: docs/screens/slice-p3-3-rota-sample.pdf (one page checked by test).
  Known: a prayer time corrected after publishing is not marked Changed.
  Next: P3.4 (templates and funeral on call).

- 18 Nov 2026, session 33 (slice P3.2, rota week): migration 0029
  (rota_weeks, rota_assignments, assign_rota_person, views rota_entries
  and rota_warnings). Owner agreed to apply 0029. Screens: Rota week (PC
  grid, phone list by day, warnings in words), Add a slot, slot page with
  person picker (vetting on that day, "already on"), take off, remove;
  "Rota week" in the menu. Seed: this week and next, about half filled,
  one double-booking and one vetting warning each. Tests first: 23 rule,
  2 seed, 22 database, 8 browser.
  First full run: 1 failure in a P3.1 test (a random month whose first
  Friday was the 1st or 2nd sent one day twice); test fixed. Second full
  run on a freshly reset database: typecheck and lint clean, 1,203 of
  1,203 database and logic tests, 169 browser tests passed, 5 skipped by
  design, 0 failed. Next: P3.3 (publish and the one-page PDF).

- 18 Nov 2026, session 33 (slice P3.1, prayer times and slot types):
  migration 0028 (rota_slot_types with the 12 starting slots,
  move_rota_slot_type, prayer_times, save_prayer_month: a month saved all
  or nothing, only changed days touched). Owner agreed to apply 0028.
  Screens: Prayer times (month grid, sample-times note on the dev copy)
  and Slot types (four groups, arrows, vetting tick); new "Rota" menu
  group. Seed: made-up times for this month and next. Tests first: 37
  rule, 2 seed, 25+ database, 8 browser. Tidy-up switches off test slots.
  Full run on a freshly reset database: typecheck and lint clean, 1,152
  of 1,152 database and logic tests, 161 browser tests passed, 5 skipped
  by design, 0 failed. Next: P3.2 (rota week: build and assign).

- 17 Nov 2026, session 32 (slice P2.9, email reminders): migration 0027
  (reminder_runs, reminders_sent, reminder_deliveries, reminder_stage,
  run_reminders, record_reminder_deliveries, the timer key fingerprint,
  security report exception). Timer address /api/reminders/daily (the
  sign-in gate lets exactly that address through). Screen: Email
  reminders (set-up panel, two Super Admin buttons, last 20 runs with
  each email's outcome), linked from Renewals. Owner agreed to apply 0027
  and create the timer key. Tests first: 21 database, 20 unit, 7 browser.
  Each full run on a freshly reset database. Run 1: 1 phone failure in a
  P2.8 test (the filter fold was clicked before the page was ready);
  showFilters now waits and checks the filters really opened. Run 2:
  typecheck and lint clean, 1,080 of 1,080 database and logic tests,
  153 browser tests passed, 5 skipped by design, 0 failed.

- 17 Nov 2026, session 32 (P2.8 finished): the owner asked that icci-dev be
  reset (npm run db:reset) around every full test run, without asking. Four
  runs, each on a freshly reset database. Two causes of random browser
  failures were fixed in the tests only: (1) the idle sign-out test could
  have its backdated "last active" note overwritten by the Home page's own
  note written as it opened; the test now leaves the page first (the app's
  sign-out rule was not at fault); (2) asset pages late in the run sometimes
  still showed "Loading…" after 10 seconds, so each check now waits up to
  20 seconds (playwright.config.ts). Final run: typecheck and lint clean,
  1,039 of 1,039 database and logic tests, 146 browser tests passed, 4
  skipped by design (PC-only or phone-only checks), 0 failed. Committed P2.8.

- 16 Nov 2026, session 31 (slice P2.8, renewals register): migration 0026
  (renewals, renewal_dates, add_renewal, register_status, the read-only
  renewals_register view, two new home counters). Screens: Renewals list
  (worst first; Show and From filters; each row opens where its date
  lives), Add a renewal, renewal page (history, Mark renewed, withdraw,
  switch off), Change renewal, Mark renewed; Renewals in the menu and as a
  Home card and quick action. Seed: 8 made-up renewals. Tidy-up also
  switches off test renewals and clears test assets' warranty dates.
  Tests first. Owner agreed to apply 0026 and seed. Two full runs: all 1,039 database
  and logic tests passed both times; browser tests 145 + 1 timeout, then
  142 + 4 (slow page or Windows screenshot lock), each time in older
  tests, which then passed on their own (15 and 22 passes). All renewals
  tests passed every time. icci-dev holds 504 leftover test places.

- 16 Nov 2026, session 31 (aftercare plan, no code): the owner asked how a
  non-developer will know about, find and fix problems after launch. Wrote
  docs/AFTERCARE.md: watchers (uptime, Sentry, nightly tests, Report a
  problem button), a Red/Amber/Yellow/Grey severity scale, the nine-step
  fixing routine with rollback first, backups and a restore drill, a routine
  calendar, the handover pack, a backup developer, the ICCI agreement and
  costs. Added PLAN.md section 9 and Prompts 10 to 12. Open: the five
  decisions in AFTERCARE.md section 14. Nothing installed. Next: P2.8.

- 16 Nov 2026, session 30 (slice P2.7, vehicles): migration 0025 (Vehicles
  category, vehicles, vehicle_renewals, vehicle_status view, renewal_status
  rule). Screens: Vehicles list (worst first), Register a vehicle (picks a
  labelled asset), vehicle page (three dates, history, withdraw, switch
  off), Change details, Record a renewal (valid until filled in a year
  later); the asset page links to its vehicle page. Seed: three made-up
  vehicles on labels 297 to 299. People pickers and lists now ask only for
  switched-on people or the names they need (the directory holds thousands
  of switched-off test people). Tidy-up also switches off test vehicles.
  Policies and vehicles lists now load switched-on records in full and
  only 50 switched-off ones (400+ test policies had made one request too
  long). Last full run: 994 + 137 pass, 1 timeout (asset page still
  loading after 10 s on the first page of the run); that test passed on
  its own and in the three runs before. Owner chose to commit.

- 16 Nov 2026, session 29 (slice P2.6, sign-offs and the grid): migration
  0024 (policy_signoffs, scan store, policy_grid view, signoff_status rule,
  two new home counters). Screens: Record sign-off (several people, one
  date, optional scan), Sign-offs section with withdraw on the policy page,
  "X of Y" on the policies list, Policies on the person page, Policy grid
  (filters) and its A4 landscape print view, home card. Seed: 41 made-up
  sign-offs; seed now looks up only its 42 named people (thousands of
  switched-off test people had made one request too long). Red "Overdue"
  squares only appear 30 days after publishing, so the seed shows none yet.

- 16 Nov 2026, session 28 (slice P2.5, policies and versions): migrations
  0022 (policies, who must sign, versions, PDF store, policies_overview)
  and 0023 (lets the "is the PDF really there" check run for admins).
  Screens: Policies list (worst first), Add a policy, policy page
  (versions with Open PDF, Publish or a "different admin" note, who must
  sign), Change title or owner, Upload a new version, Change draft.
  Seed: four made-up policies with placeholder PDFs marked SAMPLE. Tidy-up
  also switches off "Test run" policies. Next: P2.6 (sign-offs and grid).

- 16 Nov 2026, session 27 (stage 1 review pack for the Centre's admins):
  dev database reset (owner's go-ahead), then `npm run walkthrough` takes
  clean one-screen screenshots of every inventory workflow from the made-up
  seed data into docs/screens/walkthrough/ (not part of `npm test`). Forms are
  filled in but not saved, except a stocktake of Test Room A1, which is left
  under way with a few scans. Review pack: docs/review/stage-1-inventory.html
  and its PDF. People, vetting and training are held back for a stage 2
  pack. The pack names no prices; a proposal follows the owner's review.

- 16 Nov 2026, session 26 (slice P2.4, training dates): migration 0021
  (training types with a usual length, training entries, status worked out
  daily); Training section on the person page with history and withdraw;
  Record training form (expiry filled in, changeable or empty); Training
  list (worst first, filters, 50 per page, CSV); Training types screen
  (add, rename, change length, switch off). Seed: 80 made-up entries.
  Tidy-up also switches off "Test run" training types. Full suite: 862 +
  116 pass. Next: P2.5 (policies and versions).

- 16 Nov 2026, session 25 (test leftovers, owner chose option A): the
  tidy-up after test runs now empties test places first, with ordinary
  entries: made-up chairs moved to "Test storage room" (made on first use
  inside Test Building A), made-up stock counted to zero. Then the places
  are switched off. Places with a stocktake open or waiting, or a disposal
  waiting, stay on (about 50 per full run; a stocktake cannot be cancelled
  and only a signed-in admin can send one). Before: about 180 per run.
  Full suite: 795 + 104 pass. No screens changed. Next: P2.4.

- 16 Nov 2026, session 24 (paging slice, owner chose option B): People,
  Vetting and Missing and Damaged show 50 at a time ("1 to 50 of 239",
  Previous and Next); counts and the vetting CSV still cover everyone.
  Missing and Damaged no longer stops at 500. After the database and
  browser tests, a tidy-up switches off the "Test run" people and places
  they made (never deletes). Owner reset the database. Development server
  now 1 to 2 s per page (People 13 s before, 1.1 s now). Full suite: 794 +
  104 pass. Open: about 370 test places stay on because they still hold
  test items (the database refuses). Next: P2.4 (training dates).

- 16 Nov 2026, session 23 (why some pages are slow; measured, no fix yet):
  the database answers in 0.3 to 1.2 s per page. The rest is page size: the
  People page is 6 MB (928 people drawn twice, PC table and phone cards),
  and the place drop-down has about 2,830 choices. 99% of places and 95% of
  people are "Test run" leftovers from test runs since the 15 Nov reset. The
  development server builds big pages slowly (People 12 s); the finished
  site shows every page in about 1 s. The sign-in check makes no extra
  network call. Waiting for the owner: paging (50 per page) on People,
  Vetting and Missing and damaged as UI-PLAN 5.3 says, tests switching off
  what they create, then a database reset. No code changed.

- 16 Nov 2026, session 22 (slice UI-8, final checks; UI finished): colour
  contrast test for every text and outline colour (25 checks); the gold
  focus outline was too faint (2.6 to 1), now deep gold on light
  backgrounds and light gold on dark green; "Skip to the page" link first
  on every signed-in page; keyboard test; PLAN.md design section and
  UI-PLAN.md status updated; before-and-after sheet in docs/screens/.
  Browser checks wait up to 10 seconds: a heavy page on the development
  server now and then takes 5 to 10 seconds even on a quiet computer.
  Follow-up: find why some pages are slow on the development server.
  Not yet checked by the owner on a real phone: scanner, plus/minus,
  bottom bar. Next: Phase 2 continues at P2.4 (training dates).

- 16 Nov 2026, session 21 (slice UI-7, phone-first actions): big minus
  and plus buttons beside every count (count a shelf, add stock, correct,
  weekly count, stocktake shelf); the number can still be typed. Scan page:
  a camera scanner inside the app where the phone's browser has a QR
  reader (Chrome on Android); no new add-on (owner asleep, rule says ask).
  Only an ICCI label number is ever taken from a code; other addresses are
  refused. iPhones keep the Camera-app steps. Stocktake: the last scan is
  a green tick card. Not checked on a real phone yet (needs the owner).
  Next: UI-8 (final checks).

- 16 Nov 2026, session 20 (slice UI-6, detail pages and forms): panels,
  fields, buttons, messages, warnings, photos and choice boxes across all
  detail and form screens moved to the new look (shared patterns swept,
  74 places); selected choices are highlighted; one title size everywhere;
  fixed titles in Title Case ("Move This Asset"), names typed by admins
  left as entered; one "back link" style on 15 screens; facts boxes with
  quieter grey labels. Next: UI-7 (phone-first action screens).

- 15 Nov 2026, session 19 (slice UI-5, lists): development database
  reset and re-seeded (owner agreed). Every list (items, people, vetting,
  low stock, missing and damaged, not seen, asset register, stocktake,
  both approval lists) uses shared list styles: white filter card, table in
  a card with a light header, one card per row on a phone. Titles in Title
  Case. Items has the shared header and "1 to 50 of 223" paging. On a phone
  the drop-down filters fold behind "More filters (n in use)". Status
  labels and common buttons across the app now use the new look.
  Slow test runs this evening (8 rising to 34 minutes, timeouts) were
  the computer being busy with a game (memory nearly full), not the app:
  on a quiet computer the full suite takes about 13 minutes with the
  normal time limits. Phone screenshots are now saved at screen-point
  size (smaller, faster). The sign-in code step may wait 30 seconds.
  Next: UI-6 (detail pages and forms).

- 15 Nov 2026, session 18 (slice UI-4, home page): greeting band over
  the Centre photo ("Good evening, name", Dublin date, "6 things need
  attention."); "Needs attention" cards first (red, then amber); quick
  actions for admins; all-clear cards in a quieter row, or one green "All
  clear" box. Counter cards are compact rows on a phone. Loading
  placeholders carry a hidden "Loading..." word. Not seen on screen: the
  all-clear state (the development data always has something open); it is
  covered by unit tests. Next: UI-5 (lists).

- 15 Nov 2026, session 17 (slice UI-3, sign-in screens): one card with
  the Centre photograph under a dark green wash and the round logo on the
  left, the form on white on the right; on a phone the photo is a band at
  the top. The 6-digit code is one field drawn as six boxes (paste works).
  Set-up steps as numbered cards. Titles in Title Case. Left out the motto
  from the concept image (not known to be ICCI's). Also fixed the /scan
  page (role check outside a loading boundary). Next: UI-4 (home page).

- 15 Nov 2026, session 16 (slice UI-2, app shell): dark green sidebar on
  a PC (icon rail on a tablet), slim top bar (where you are, open a label
  by number), phone bottom bar (Home, Items, raised Scan, People, Menu) and
  menu sheet. One menu list in src/lib/ui/menu.ts says which roles see each
  link: Finance and Library Operator see Home only for now. Sign out on
  the phone top bar. Two-minute warning before idle sign-out. New /scan
  page explains scanning with the phone camera (in-app scanner: UI-7).
  Fixes after review: list tables scroll inside their own box instead of
  widening the page (guarded by a test at PC and tablet width); top bar no
  longer says "People > People". Noticed, not fixed: list pages take 6-20
  seconds to load from the cloud development database; look at this before
  real use. Next: UI-3 (sign-in screens with the Centre photo).

- 15 Nov 2026, session 15 (slice UI-1, look foundation): owner answered
  the 8 UI questions (see Decisions). New fonts and colour shades, gold
  focus ring, star pattern, titles no longer in capitals. Logo cut out and
  photos enhanced by scripts/make-brand-assets.mjs into public/brand/.
  Lucide icons 1.65.0 added. Shared parts in src/components/ui/; style
  sample page /style (signed-in, not in the menu). UI-0 folded in. Fixed
  titles become Title Case per screen as each moves to PageHeader.
  Next: UI-2 (sidebar, top bar, phone bottom bar).

- 15 Nov 2026, session 14 (UI plan, no code): the owner found the look
  dull and shared two concept images, a 2,000 px logo and three photos of
  the Centre. Wrote docs/UI-PLAN.md: sidebar shell, sign-in with photo,
  home with "needs attention" and quick actions, six screen patterns,
  shared building blocks, nine UI slices (UI-0 style sample first), and
  eight questions (logo on green, Title Case titles, lucide icons, photo
  rights, fonts, sidebar, recent activity, pattern). Source images kept in
  docs/brand/. Nothing built; tests not run. Next: owner answers, then UI-0.

- 15 Nov 2026, session 13 (P2.3, Garda vetting): migration 0020 adds
  vetting_records (withdraw only, with a reason), the people_vetting view
  (status from today's date) and three vetting numbers on home_counters.
  Owner agreed to apply it to icci-dev; the seed added 46 made-up entries
  showing every status. Screens: Record vetting (phone, expiry fills in),
  vetting box and history with Withdraw on the person page, Garda vetting
  list (worst first, filters, CSV) in the menu, vetting chip and filter on
  People, home counter. Tests first. First three full runs: all 717
  database and logic tests passed, but 2-5 different older browser tests
  timed out each run (icci-dev held 2,412 leftover test places); vetting
  view checked fast (0.1-0.2 s). Two slow waits raised to 15 s. Owner
  agreed to `npm run db:reset`; all 20 migrations replayed cleanly. Full
  suite then 717 + 76 passes. Next: P2.4 (training dates).

- 15 Nov 2026, session 12 (P2.2, connecting people): migration 0019 links
  people to admin accounts (Super Admin only, never your own) and adds
  "reported by person" to asset entries (either a person or a typed name);
  stocktake approvals name the sender's person record when linked. Owner
  agreed to apply it and seed (2 people linked to the Centre Admin test
  accounts). Screens: "Reported by" picker with "Someone else"; history,
  approvals and missing list link to the person; person page shows entries
  they reported and the Admin account box. Screenshot helper retries a
  Windows file lock 3 times. Tests first. Full suite 654 + 66 passes on the
  first run. Next: P2.3 (Garda vetting).

- 15 Nov 2026, session 12 (P2.1, people directory): dev database reset and
  re-seeded (owner agreed). Migration 0017 adds person_roles, sections and
  people; 0018 closes its rule-checker to signed-out visitors (found by the
  automatic security report; owner agreed to both). Screens: People list
  (search; role, section, active filters), Add a person (same-name
  warning), person page (Switch off / back on), Edit person; People in the
  menu; Finance sees a note. Seed: 40 made-up people, 3 switched off.
  Tests written first. Full suite 625 + 62 passes (two test locators fixed;
  the old asset browser test twice failed only while Windows refused to
  save a screenshot file, then passed). Next: P2.2.

- 15 Nov 2026, session 12 (slice 11, finishing Phase 1): owner approved all
  Phase 2-3 answers. Slice 10 marked finished. Migration 0016 adds the
  read-only view asset_last_seen (owner agreed to apply it to icci-dev).
  Screens: "Not seen in 12 months" (oldest first, search, location) and
  "Asset register" (totals by place, pick a place for its assets, CSV
  download); both in the menu; Finance sees a note, the CSV gives Finance
  403. Tests written first. Full suite 575 + 56 passes. Known: leftover
  "Test run" places make the register long on icci-dev (`npm run db:reset`
  clears them). Next: P2.1 people directory.

- 15 Nov 2026, session 11 (audit fixes 1, 2, 5-10, plus two slice 10
  findings): migrations 0013 (built-in roles; also switched back on the two
  roles the first test run turned off), 0014 (found, out-of-date approvals,
  no setting flags, places, second security report security_problems,
  role checked once per search) and 0015 (record numbers locked, places
  that hold items cannot move). Website: safety headers, a "next" address
  with hidden characters can no longer lead off the site, bad label links
  show "not recognised". Item search 0.55 s → 0.07 s with 1,179 items.
  Then fix 3: password rule 12+ characters with letters and numbers, pushed
  to the dev sign-in settings (owner agreed). Fix 4 waits for accounts.
  Found: past 1,000 places the drop-downs lost the newest ones (one request
  returns at most 1,000 rows); places and admin names now load page by
  page. Test runs had filled icci-dev (2,394 places, 2,434 items; phone
  screenshots of 9-12 MB made browser tests fail at random). Owner agreed
  to `npm run db:reset`: all 15 migrations replayed cleanly and the seed
  ran under the new password rule. Long lists may need pages later.

- 15 Nov 2026, session 10 (slice 9, home page counters): migration 0012 adds
  home_counters (read-only; reader's own access rules apply; only Super
  Admin and Centre Admin may ask). Home screen: five counter cards, each
  opening its list. Tests written first. Owner agreed to apply 0012 and to
  reset icci-dev (950 leftover test locations slowed searches). Full suite
  489 + 44 passes. Known: searches can still pass 5 s late in a long browser
  run (not caused by slice 9; check in slice 10). Next: slice 10.

- 15 Nov 2026, session 10 (audit and planning, no code): audited migrations
  0001-0011 and the sign-in code. No way found for the wrong role, or a
  signed-out visitor, to read or change data, or to approve their own entry.
  Ten fixes listed (three medium: a found "missing" asset is ignored by
  stocktake; late stocktake approvals can act on out-of-date facts; 6-letter
  passwords). Wrote `docs/PHASE-2-AND-3.md`: tables, rules, screens, slice
  order and 11 questions for the owner. Nothing decided yet; tests not run
  (no code changed). Next: finish slice 9, then the audit fixes.

- 15 Nov 2026, session 9 (slice 8, stocktake): migrations 0010 (stocktakes,
  scans, differences; never changed or deleted; approval makes an ordinary
  asset entry or stock count linked back) and 0011 (preview before sending,
  same rule). Screens: Stocktake (menu; Finance sees "cannot"), stocktake
  under way, scan, Check and finish, sent (approve/reject each difference).
  Seed: Room A2 stocktake decided, Room B1 waiting. Full suite 470 + 38
  passes. Not yet checked: a real
  phone camera scan during a stocktake. Next: slice 9.

- 15 Nov 2026, session 8 (slice 7, label sheets): migration 0009 adds
  label_print_runs (never changed or deleted) and print_new_labels /
  reprint_labels. Screens: Print labels (menu; Finance sees "cannot print"),
  Label sheet (preview, skip spaces, Print; on paper only the labels, A4,
  Avery L7160 positions). Seed records labels 1-300 as two sheets. Dev
  database reset (owner agreed) to clear old random test label numbers.
  Full suite 418 + 32 passes. Not yet checked: a real printer and a phone
  scan of a printed label. Next: slice 8.

- 14 Nov 2026, session 7 (slice 6, assets): migration 0008 adds
  asset_events (move, damage, missing, back in use, disposal; never changed
  or deleted). Only these entries change an asset's location or condition.
  Screens: Move, Report damage, Mark missing, Mark repaired, Mark found,
  Dispose (phone-first), Missing and damaged list (menu), Disposals waiting.
  Seed: 24 made-up entries, 2 disposals waiting. Older seeded damaged/missing
  assets show "No report recorded" until `npm run db:reset`. Next: slice 7.

- 14 Nov 2026, session 6 (slice 5, stock): migration 0007 adds
  stock_movements (count, restock, adjustment; never changed or deleted) and
  the stock_levels view (latest count + restocks since; usage between counts).
  Screens: Count this shelf, Add stock, Correct this entry, weekly count of a
  store room, low-stock list, waiting for approval; Stock in the menu. Seed:
  made-up stock for 62 consumables, 2 pending corrections. Full suite 307 +
  22 passes. Open: screens do not hide menus by role yet (finance sees empty
  lists). Next: slice 6.

- 14 Nov 2026, session 5 (slice 4, items and labels): migration 0006 adds
  categories, labels (ICCI-000123, printed before use, never changed) and
  items (fixed asset or consumable), private photo store (no replace/delete),
  and item_history (Centre Admins see one item's history, not the audit log).
  Screens: scan /l/<label>, register (2-3 phone steps), list with search and
  filters, detail with history, edit details. Seed: 300 labels, 220 items.
  Owner chose all recommended answers (see Decisions). Full suite 244 + 16
  passes. Next: slice 5 (stock).

- 14 Nov 2026, session 4 (slice 3, sign-in): sign-in, code, first-time set-up
  and signed-in header with Sign out. Gatekeeper (src/proxy.ts) shows signed-out
  visitors only the sign-in page and remembers where they were going. Idle
  sign-out after 15 min, shared across tabs, rechecked on the server when a
  page is reopened. Migration 0005: database insists on the code. Seed gives
  test accounts authenticators (keys in git-ignored .test-authenticators.json).
  Learned: finishing a sign-in ends that admin's other half-finished sign-ins,
  so browser tests run one at a time. Full suite 154 + 14 passes. Next: slice 4.

- 14 Nov 2026, session 3 (slice 2, database foundation): migrations 0001-0004
  add roles, accounts (app_users), locations tree and an append-only audit log
  written by triggers. Every table: row-level security, deleting blocked (even
  for the master key), who/when filled in by the database. A security report
  lets tests check every future table automatically. Seed adds roles, 2 new
  test accounts (library operator, deactivated admin) and 15 locations. 81
  permission tests; full suite 95 + 2 passes. No screens changed. Test runs
  leave "Test run ..." locations in the dev database (no deletes);
  `npm run db:reset` clears them. Next: slice 3.

- 14 Nov 2026, session 2 (slice 1, setup): Next.js 16 site with ICCI colours,
  fonts and logo; Supabase connection helpers; `.env.example`; tests (unit,
  database, browser with screenshots); seed script creating 4 fictional admin
  accounts (`@icci-prototype.test`). Database permission tests replace pgTAP
  because pgTAP needs Docker. Owner approved: Next.js, Tailwind, Supabase
  libraries and CLI, Vitest, Playwright. Known: 7 moderate warnings in the
  code-checker (ESLint) only, not in the website; no fix released yet.
  Supabase dev project linked and seeded; full suite passes (22 + 2 tests).

- 14 Nov 2026, session 1 (planning, no code): read CLAUDE.md, PLAN.md and
  PROGRESS.md. Reviewed section 6: kept the stack, with four changes (cloud
  dev database instead of Docker, Ireland rule deferred, staging deferred,
  free plans for the prototype). Answered 8 setup questions (see Decisions).
  Next: the owner creates accounts and installs tools; then slice 1.
