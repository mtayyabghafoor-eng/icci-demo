# Phase 2 and Phase 3: build plan

Written 15 November 2026, after an audit of slices 1 to 8. This is a plan, not
a decision: every item marked **to confirm** needs the owner's answer before
that slice starts (see "Questions for the owner" at the end). It follows
`docs/PLAN.md` sections 5.2 and 5.3 and every rule in `CLAUDE.md`.

Scope asked for: **Phase 2** people directory, Garda vetting, policy grid.
**Phase 3** weekly rotas, maintenance tickets. PLAN.md also puts vehicles and
the renewals register in Phase 2; they are outlined briefly at the end of
Phase 2 so nothing built now gets in their way.

## 1. How the new parts connect to what exists

```
locations (building > room > store room > shelf)      items (assets, consumables)
     |            |                                      |            |
     |            +---- maintenance ticket ("where") ----+            |
     |                        |  reported by / assigned to            |
 rota shift ("where")         v                                       |
     |                     PEOPLE  <--- "reported by" on asset entries+
     +---- who is on duty --> |
                              +--- vetting records (status, expiry)
                              +--- training records
                              +--- policy sign-offs --> policy versions --> policies
```

- **People** is the hub. Today "reported by" on an asset entry is typed text.
  After Phase 2 it is picked from the directory.
- **Locations** are reused as they are. A rota shift and a maintenance ticket
  each point at a building or room. No new kind of location is added.
- **Items** are reused as they are. A ticket can point at one fixed asset.
  "Report damage" can open a ticket; closing a ticket can offer "Mark repaired".
- **Home page counters** (slice 9) gain: vetting due or expired, unsigned
  policies, open tickets, today's rota.

## 2. Rules every new table follows (same as slices 1 to 8)

- Created with `private.add_standard_safeguards`: row-level security on, no
  access for signed-out visitors, deleting blocked (even for the master key),
  who/when filled in by the database, every change written to the audit log.
- Read and write for **Super Admin and Centre Admin only**. **Finance and the
  Library Operator see nothing** in Phase 2 or 3 (PLAN.md: finance cannot
  change people, policies or rota; least access means not reading them either,
  until expenses need a name list in Phase 5).
- Each table gets tests, written first, for: Super Admin, Centre Admin,
  Finance, Library Operator, a switched-off account, password-only sign-in,
  and a signed-out visitor.
- History tables (vetting, training, sign-offs, ticket entries, publications)
  are append-only: no update rule at all, or only one narrow "withdraw" or
  "decide" update checked by a trigger.
- "Current" values that could be overwritten are **derived**, the way stock
  is: vetting status, signed/unsigned, ticket status, "changed since
  publishing".
- Lists that grow (person roles, sections, training types, shift types) are
  tables with an `active` switch, like item categories.
- No free-text notes field on a person. PLAN.md says "nothing else", and a
  notes box is where medical or family details end up by accident.
- Migration numbers: `0012` is slice 9 (home counters) and `0013` to `0015`
  are the audit fixes. Phase 2 starts at `0016`. Numbers below are in order,
  not fixed.
- Every new table also gets the record-number lock (`add_standard_safeguards`
  does it) and must leave `security_problems()` empty.

## 3. Before Phase 2 starts

1. Finish slice 9 (home counters) and slice 10 (security review).
2. Do the audit fixes listed in section 7. Two matter directly to Phase 2:
   the stronger password rule (people's contact details will be in the
   system) and the automatic check that every new database function is closed
   to signed-out visitors (Phase 2 and 3 add about ten functions).

## 4. Phase 2

### 4.1 Database tables

**`person_roles`** (a list: what someone does at the Centre)
- name, `needs_vetting` (yes/no), active.
- Starting list (decided 15 Nov 2026): Imam, Staff, Security, Cleaner,
  Caretaker, Gardener, Reception, Volunteer, Board member, Contractor.
  All need vetting except Board member and Contractor.
- Named `person_roles` so it is never confused with `roles`, which is about
  sign-in accounts.

**`sections`** (a list: which part of the Centre)
- name, active. Starting list (decided 15 Nov 2026): Administration, Prayer halls,
  Women's section, Security, Cleaning, Reception, Shop, Restaurant,
  Maintenance, Volunteers.

**`people`**
- full name, person role, section, phone, email (each optional), start date,
  active.
- `app_user_id` (optional, unique): set only when this person is also one of
  the admins. Only a Super Admin can set it. It lets the database stop an
  admin recording their own vetting, and in Phase 5 stops someone approving a
  claim where they are the person who paid.
- Rules: role and section must be switched on; a switched-off person cannot be
  picked for anything new but stays on old records; the same name twice gives
  a warning on screen, not a refusal (two people can share a name).
- Never stored: address, date of birth, PPS number, photo, identity
  documents, medical or family details.

**`vetting_records`** (append-only; one row each time something happens)
- person, kind (`applied`, `vetted`, `not_required`), date, `expires_on`
  (for `vetted` only), who entered it.
- A wrong entry is withdrawn (who, when, reason are filled in once and can
  never change) and a new one entered. Nothing is typed over.
- An admin cannot enter or withdraw their own vetting record (database rule,
  using `people.app_user_id`).
- No disclosure, no reference number, no file upload: PLAN.md section 2
  forbids storing vetting disclosures. Only the status and the date.
- Expiry: Garda vetting has no legal expiry date; organisations set their own
  re-vetting period. The screen suggests "vetted date + 3 years" and the admin
  can change it. The period is a setting (to confirm).

**`people_vetting`** (a view; worked out, never stored)
- One row per person: `not_required`, `none` (needed, nothing on record),
  `applied`, `valid`, `due` (expires within 60 days), `expired`.
- Colours: valid green; applied and due amber; none and expired red;
  not required grey. Always with the word.
- Because it is worked out from today's date, a record turns "expired" on the
  day with nobody touching it.

**`training_types`** and **`training_records`** (append-only)
- Type list (to confirm): Fire safety, First aid, Safeguarding awareness,
  Manual handling.
- Record: person, type, date completed, optional expiry date. Withdrawn the
  same way as vetting. No certificates stored.

**`policies`**
- title, owner (a person from the directory), active.

**`policy_required_roles`**
- policy, person role, active. "Everyone with this role must sign."

**`policy_versions`**
- policy, version label (for example "v2"), PDF file, approval date, next
  review date, status `draft` or `published`, published by and when.
- A draft can be edited. Publishing is one step, done by a database function,
  and a published version can never be changed. One published version per
  policy is "current": the newest.
- Decided 16 Nov 2026 (slice P2.5): publishing counts as an approval, so a
  different admin publishes. Nobody publishes a version they uploaded or
  last changed. The next review date is required (suggested: one year).

**`policy_signoffs`** (append-only)
- person, policy version, date signed, optional scan of the signed sheet, who
  entered it. One live sign-off per person per version.
- Withdrawn with a reason if entered by mistake; never deleted.
- Date signed cannot be in the future, or before the version's approval date.
- An admin can enter their own sign-off (it is a record of a paper signature,
  not an approval). To confirm.

**`policy_grid`** (a view; worked out)
- One row per active person per policy their role must sign, against the
  **current** version: `signed` (green), `unsigned` (amber), `overdue` (red:
  still unsigned 30 days after publishing; the 30 is a setting, to confirm).
- A new version resets everyone to unsigned automatically, because a sign-off
  belongs to one version. Nothing is reset by hand, so nothing can be missed.

**File stores** (private, same rules as item photos: add and view only, never
replace or delete)
- `policy-files`: PDF only, up to 10 MB.
- `signoff-scans`: PDF or picture, up to 6 MB. These show signatures, so they
  are personal data: admin-only, opened through short-lived links.

**Change to an existing table: `asset_events`**
- Add `reported_by_person_id` (optional link to `people`).
- New entries must have exactly one of: a person from the directory, or typed
  text (kept for "a visitor told reception"). Old entries keep their text.
- Stocktake approvals keep working: they fill in the admin's person record if
  linked, otherwise the admin's name as text. A test proves this.

### 4.2 Screens

PC-first unless marked phone.

| Screen | What it does |
| --- | --- |
| People list | Search; filter by role, section, active, vetting status. Vetting chip on each row. |
| Add / edit person | Name, role, section, phone, email, start date. "Switch off" instead of delete. |
| Person page | Details, vetting history, training, policies signed and outstanding, entries they reported. |
| Record vetting (phone-friendly) | Three fields: what happened, date, expiry. |
| Vetting list | Everyone who needs vetting, worst first (expired, none, due, applied, valid). CSV export. |
| Record training | Type, date, optional expiry. |
| Policies list | Title, owner, current version, next review date, how many signed out of how many. |
| Policy page | Versions, required roles, upload a new version, Publish, who has signed. |
| Record sign-off | Pick person(s), date, optional scan. Several people at once for one signed sheet. |
| Policy grid | People down the side, policies across the top, coloured word in each square. Filter by section and role. Print view. |
| Lists (Super Admin and Centre Admin) | Person roles, sections, training types: add, rename, switch off. |
| Existing asset screens | "Reported by" becomes a picker from the directory, with "someone else" for typed text. |
| Home page | New counters: vetting due or expired; unsigned policies. |

Finance sees the same short "you do not have access" note it gets for items.

### 4.3 Slice order

Each slice: plan and "go", tests first, migration, screens, seed data (made-up
names only, obviously fictional), full test suite, screenshots, commit.

| Slice | What | Notes |
| --- | --- | --- |
| P2.1 | People directory | `person_roles`, `sections`, `people`; list, add, edit, switch off. Seed about 40 fictional people. |
| P2.2 | Connect people to what exists | "Reported by" picker on asset entries; link an admin account to a person. |
| P2.3 | Garda vetting | `vetting_records`, `people_vetting`; record, withdraw, vetting list, home counter. |
| P2.4 | Training dates | Small slice; same pattern as vetting. |
| P2.5 | Policies and versions | Upload PDF, required roles, publish. |
| P2.6 | Sign-offs and the grid | Record, withdraw, grid, print view, home counter. |
| P2.7 | Vehicles | A fixed asset plus registration, tax, insurance and NCT dates, and a keeper from the directory. |
| P2.8 | Renewals register | Manual entries, plus dates read from vehicles, vetting, policy reviews and warranties. Overdue is red. |
| P2.9 | Email reminders at 60, 30 and 7 days | Needs an email-sending service and a daily timer. Both are new and need the owner's approval first. |

P2.1 to P2.6 are what was asked for. P2.7 to P2.9 complete PLAN.md section 5.2.

### 4.4 Phase 2 acceptance checks (proposed)

- Tests prove Finance, the Library Operator, a switched-off account and a
  signed-out visitor cannot read one person's name, phone or vetting status.
- A vetting record entered wrongly can be withdrawn and re-entered, and the
  person page shows both.
- Publishing a new policy version turns every square for that policy amber
  without any other action.
- An admin linked to a person cannot record their own vetting.
- No screen and no table has a place to put a disclosure, a document number,
  an address or a date of birth.

## 5. Phase 3

### 5.1 Rota: database tables

**`rota_slot_types`** (a list)
- name, group (`prayer`, `jumuah`, `shift`, `on_call`), `needs_vetting`,
  display order, active.
- Starting list: Fajr, Dhuhr, Asr, Maghrib, Isha, Jumu'ah 1, Jumu'ah 2,
  Security, Cleaning, Reception, Volunteers, Funeral on call.

**`prayer_times`** (reference only, never calculated)
- one row per date: the five prayer times and the two Jumu'ah times.
- Entered a month at a time. Can be corrected (every change is in the audit
  log); it is reference information, not a record of an event.

**`rota_weeks`**
- week starting date (always a Monday, one row per week), status `draft` or
  `published`. The status changes only through the publish function.

**`rota_assignments`**
- week, date, slot type, location (a building or room from `locations`,
  optional), person (empty = "not filled yet", shown amber), start and end
  time (shifts and on-call; prayers take their time from `prayer_times`),
  short note.
- Never deleted: an assignment is "removed" (who and when), which keeps the
  history and lets the next PDF show the change.
- The database refuses: a switched-off person, a switched-off location, a date
  outside the week, an end time before the start time.

**`rota_warnings`** (a view; worked out)
- Double-booking: the same person in two assignments that overlap on one day.
- Vetting: the slot type or the person's role needs vetting, and on that date
  the person's vetting is expired or missing.
- These are **warnings, not refusals** (PLAN.md says "warn"): an admin may
  have a good reason, and the system must not block Friday prayers.

**`rota_publications`** (append-only)
- week, who published, when, how many warnings were showing, and a frozen copy
  of the rota as published.
- Publishing is a database function: Super Admin or Centre Admin only; the
  admin must tick "I have seen the warnings" if there are any.
- "Changed since publishing" is worked out: any assignment added, removed or
  replaced after the latest publication is amber on the next PDF.

**`rota_templates`** and **`rota_template_slots`**
- Templates: Normal week, Ramadan, Eid al-Fitr, Eid al-Adha.
- A template slot: day of the week, slot type, location, times, how many
  people. "Use this template" fills a draft week with empty slots to assign.
  It never overwrites a week that already has assignments.

Not built (out of scope in PLAN.md): staff seeing the rota by logging in,
phone rota, shift swaps. The published PDF is how the rota reaches people.

### 5.2 Rota: screens

| Screen | What it does |
| --- | --- |
| Rota week | Seven columns, rows grouped as Prayers, Jumu'ah, Shifts, On call. Click a slot to pick a person. Warnings shown beside the slot in amber or red with words. |
| Pick a person | Search the directory; each name shows their vetting chip and whether they are already on that day. |
| Publish | Lists the warnings, asks for the tick, then opens the one-page print view. |
| One-page rota (print) | A4 landscape. "Save as PDF" from the browser's print box, the same way label sheets work, so no new add-on. Changes since the last publish in amber with the word "Changed". Names and roles only, no phone numbers (to confirm). |
| Prayer times | A month grid to type times into. |
| Templates | Edit the four templates; "Use this template" on an empty week. |
| Home page | "Today's rota" counter and list. |

### 5.3 Maintenance tickets: database tables

**`maintenance_tickets`**
- description, priority (`low`, `normal`, `urgent`), item (optional; fixed
  assets only), location (always filled: taken from the item when the ticket
  is about an asset), reported by (person from the directory, or typed text,
  same rule as asset entries), opened date.
- Current status, who it is assigned to, closing note, cost and closed date
  sit on the ticket for fast lists, but **only the database changes them**,
  from the entries below. Typing over them is refused. This is the same
  design as items and asset entries.
- Refused: a ticket on a consumable, on a disposed asset, or at a switched-off
  location.

**`maintenance_ticket_events`** (append-only)
- ticket, kind (`opened`, `assigned`, `status`, `note`, `closed`, `reopened`),
  note, optional photo, new status (`open`, `in_progress`, `waiting`,
  `closed`), new assignee (a person; outside firms are people with the role
  Contractor), cost.
- Closing needs a closing note; cost is optional, in euro and cent, and is
  information only. It is not an expense claim and not a ledger (out of
  scope). In Phase 5 an expense claim can point at a ticket.
- A closed ticket can be reopened with a reason; the history shows both.
- No second-admin approval on closing: PLAN.md does not ask for one. To
  confirm.

**Links to assets**
- `maintenance_tickets.asset_event_id` (optional): "Report damage" offers
  "Open a ticket for this", and the ticket remembers which report it came from.
- Closing a ticket on a damaged asset offers "Mark repaired", which makes the
  ordinary asset entry. The two stay separate records, linked.
- The item page lists its open and past tickets. Approving a disposal warns if
  the asset still has open tickets.

**File store**: `ticket-photos`, private, pictures only, up to 6 MB, add and
view only.

### 5.4 Maintenance tickets: screens

| Screen | What it does |
| --- | --- |
| Report a problem (phone) | Scan the label or pick a place; description; photo in one tap. Three fields. |
| Tickets list | Open first, urgent at the top. Filter by status, priority, place, assigned person. CSV export. |
| Ticket page | Full history, photos, Assign, Add a note, Waiting, Close, Reopen. |
| Close a ticket | Closing note, optional cost, "Mark repaired" tick when the asset is marked damaged. |
| Item page and location page | Tickets for this asset or place. |
| Home page | "Open tickets" counter, with urgent ones counted separately. |

Status colours: closed green; in progress and waiting amber; open and urgent
red. Always with the word.

### 5.5 Slice order

| Slice | What | Notes |
| --- | --- | --- |
| P3.1 | Prayer times and slot types | Reference data and its two screens. |
| P3.2 | Rota week: build and assign | Draft weeks, assignments, warnings view, person picker. |
| P3.3 | Publish and the one-page PDF | Publications, amber "Changed" marks, today's rota counter. |
| P3.4 | Templates and funeral on call | Normal week, Ramadan, two Eids. |
| P3.5 | Tickets: report, list, ticket page | Tables, phone screen, links from item and location pages. |
| P3.6 | Tickets: assign, progress, close, reopen | Cost, "Mark repaired" link, "Open a ticket" from Report damage, home counter. |

Phase 3 needs Phase 2 slices P2.1 to P2.3 (people and vetting) and nothing
else from Phase 2.

### 5.6 Phase 3 acceptance checks (proposed)

- A normal week can be filled from a template and published in under fifteen
  minutes.
- Putting one person in two overlapping shifts shows a warning; so does a
  person whose vetting ran out before the shift date.
- Changing one name after publishing shows exactly that slot in amber on the
  next PDF.
- A ticket can be reported from a phone in under one minute.
- A ticket's status, assignee and cost cannot be typed over, even with the
  master key; the history shows every step.
- Tests prove Finance, the Library Operator and a signed-out visitor cannot
  read a rota or a ticket.

## 6. Privacy points to settle with ICCI before real data

- **Leavers.** The system never deletes, and the audit log keeps old copies of
  every changed record for ever. Once real people are in it, ICCI needs a
  written answer to "how long do we keep a former volunteer's phone number?"
  and a way to carry it out. This is a question for whoever handles data
  protection at ICCI; the prototype uses made-up people only, so it does not
  block building.
- **Vetting.** Status and dates only. The disclosure itself stays on paper
  or wherever ICCI keeps it now.
- **Signed sheets.** A scan shows signatures. It is optional; recording the
  date alone is enough for the grid.
- **The published rota** leaves the system as a PDF. Keep phone numbers off it.

## 7. Audit fixes (from the slices 1 to 8 audit, 15 Nov 2026)

Status, 15 Nov 2026: fixes 1, 2, 3, 5, 6, 7, 8, 9 and 10 are done
(migrations 0013 to 0015, the website and the sign-in settings). Fix 4
belongs to the accounts screen. Two more findings, an unsafe "next" address
after sign-in and record numbers that could be changed, are also fixed.

No way was found for Finance, the Library Operator, a password-only sign-in or
a signed-out visitor to read or change anything they should not, and no way to
approve your own correction, disposal or stocktake difference.

| No. | Importance | Fix |
| --- | --- | --- |
| 1 | Medium | Stocktake: an asset recorded as missing that is then scanned in a stocktake is silently ignored. It should become a "found" difference for approval. |
| 2 | Medium | Stocktake: a difference approved late can act on out-of-date facts (the asset was moved, reported or put up for disposal in between), giving a wrong "missing" or a confusing error. Check at approval that nothing has changed; if it has, say so and ask for a rejection. |
| 3 | Medium | Passwords: the minimum is 6 characters with no other rule. Raise to at least 12 and switch on the leaked-password check before any real account exists. |
| 4 | Medium (before production) | A brand-new account is protected by its password alone until its owner sets up the authenticator. Design the accounts screen so set-up happens straight away with a one-time password. |
| 5 | Low | A Super Admin could switch off the Super Admin or Centre Admin role itself and lock everyone out. Protect the built-in roles. |
| 6 | Low | Three internal "the database is doing this itself" flags are ordinary settings. The website cannot set them, but anyone with direct database access could. Replace with a check that a matching entry really exists, and add a test. |
| 7 | Low | A location can be switched off while it still holds items or has a stocktake under way. Refuse, with a clear message. |
| 8 | Low | Extend the automatic security report to check every view uses the reader's own permissions and every database function is closed to signed-out visitors. |
| 9 | Low | The website sends no security headers (for example the one that stops it being shown inside another site). Add them in slice 10. |
| 10 | Trivial | A badly formed label link shows an error page instead of "label not recognised". |

Known limits, by design, to be aware of rather than fix:

- A new **count** needs no approval (PLAN.md), so the two-admin rule protects
  corrections and stocktake differences, not the stock number itself. A loss
  shows up as unusual usage.
- A Super Admin who creates a second account for themselves could approve
  their own entries. It is visible in the audit log. Worth a line in ICCI's
  own rules.
- With only two or three admins, if all of them scan in one stocktake nobody
  is left to approve it.
- Anything done with the master key is logged without a name. The website
  never uses the master key; keep it off the web host in production.

## 8. Questions for the owner

**Decided 15 November 2026: the owner approved every recommended answer
below**, with one addition to question 2 (Caretaker and Gardener added to the
person roles, both needing vetting). Question 10 is decided when P2.9 is
reached. Question 11 is now the two-factor question from audit fix 4.

Recommended answer first. Each is asked again at the start of its slice.

1. **One role per person, or several?** Recommend **one main role** (matches
   PLAN.md, keeps the policy grid simple). Alternative: several roles each.
2. **Starting lists** for person roles, sections and training types: are the
   lists in 4.1 right?
3. **Re-vetting period.** Recommend **3 years, changeable per person**.
   Alternatives: 5 years; no expiry at all.
4. **Does recording vetting need a second admin?** Recommend **no** (PLAN.md
   does not ask for it), but an admin can never record their own.
5. **"Overdue" for an unsigned policy.** Recommend **30 days after
   publishing**. Alternatives: 14 days; never red, only amber.
6. **Keep scans of signed sheets?** Recommend **optional, as in PLAN.md**.
   Alternative: dates only, no scans (less personal data).
7. **Rota: should expired vetting block an assignment or only warn?**
   Recommend **warn** (PLAN.md), with the admin ticking that they saw it.
8. **Rota PDF: names and roles only?** Recommend **yes, no phone numbers**.
9. **Tickets: does closing with a cost need a second admin?** Recommend
   **no**; costs become expense claims with approval in Phase 5.
10. **Email reminders (P2.9)** need an email-sending service and a daily
    timer. Options to be set out with costs when that slice is reached.
11. **Two-factor set-up on a new account (audit fix 4).** Decided: the
    Super Admin creates the account and the screen shows a one-time
    temporary password once. It works for 24 hours and opens only the
    "scan this QR code" page; the new admin sets their own password and
    links their authenticator in that first visit, before seeing anything
    else. Built with the accounts screen, in Phase 2, before any real
    account is created.
    (Earlier question, audit fix 1, already decided: the approver chooses
    Good or Fair for a found asset.)
