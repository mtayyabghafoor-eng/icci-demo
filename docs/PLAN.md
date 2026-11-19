# ICCI Control Dashboard: build specification

Version 2 (admin-only), 14 November 2026. This is the specification Claude Code
builds from. Anything marked "to confirm" is an assumption: ask before relying
on it.

## 1. What this is

One secure web app for the Islamic Cultural Centre of Ireland (ICCI), Clonskeagh,
Dublin 14. Two or three admins use it to see what the Centre owns, where it is,
who is on duty, which policies are signed and what has been spent. Every change
is recorded. Staff, imams and volunteers are records in the system, not users.

The campus has prayer halls, women's areas, sports and event halls, a car park,
a shop, a restaurant and apartments.

## 2. Out of scope

Do not build any of these. If a task seems to need one, stop and ask.

- Staff or volunteer logins, phone rota, shift swaps
- Offline mode or local sync
- Accounting ledgers, bank reconciliation, payroll
- Anything about the school or about children
- Hall bookings, complaints log, class registers, donations
- Storing vetting disclosures, medical details, identity documents, home
  addresses, bank or card numbers, PPS numbers

## 3. Roles

| Role | Can do | Cannot do |
| --- | --- | --- |
| super_admin | Everything a centre_admin can, plus manage accounts, view the audit log | Edit or delete audit entries |
| centre_admin | Use every module, approve adjustments, publish rota and policies, run reports | Manage accounts; approve own expense claims |
| finance | Approve or reject expenses, tag funds, export | Change stock, rota, policies, people |
| library_operator (Phase 4) | Add books, lend, return | See anything outside the library |

Rules for every account:

- Authenticator-app two-factor for super_admin, centre_admin and finance.
  library_operator signs in with an emailed one-time code.
- Sign-out after 15 minutes idle.
- Nobody approves an entry they made, or one where they are the person who paid.
- Accounts are deactivated, never deleted.
- Design the roles so more can be added later without restructuring.

## 4. Rules that apply to every module

- Row-level security on every table, with tests per role and for signed-out
  visitors.
- No hard deletes. Corrections are new linked entries.
- An append-only `audit_log` table written by database triggers on every insert
  and update: table, record, user, time, old values, new values.
- Every record has created_by, created_at, updated_by, updated_at.
- Status colours are the same everywhere: green (in stock, signed, approved),
  amber (low, due, pending), red (out, overdue, rejected). Always show a word
  beside the colour.
- All data stays in an EU region.

## 5. Modules

### 5.1 Inventory and assets (Phase 1)

Two kinds of item:

- **Fixed asset**: one record each. Fields: name, category, location, condition
  (good, fair, damaged, missing, disposed), value, purchase date, warranty end,
  photo, notes. One QR label each. Carpets are fixed assets recorded per room.
- **Consumable**: a quantity per item per store room, with a unit and a minimum
  level. One QR label on the shelf or bin.

Locations are a tree: building > room > store room > shelf.

QR labels:

- Pre-printed serial numbers, format `ICCI-000123`. The code holds only a link
  containing that number. No data in the code.
- A label can be printed before it is assigned. Scanning an unassigned label
  starts "register a new item". Scanning an assigned label opens the item.
- Scanning without being signed in shows only the sign-in page.
- Provide a screen that generates a printable sheet of the next N labels.

Admin actions (phone-friendly screens):

1. Register an item: scan label, enter name, kind, location, photo.
2. Weekly count: pick a store room, scan each shelf label, enter the quantity
   found. The system records a count and derives usage since the last count.
3. Restock: scan shelf label, enter quantity added.
4. Move an asset, or mark it damaged, missing or disposed, with a note, a photo
   and "reported by" picked from the people directory (free text until Phase 2).
5. Adjustment: a correction with a mandatory reason. The original entry stays.

Stock arithmetic: quantities are derived from `stock_movements` (restock,
count, adjustment). Never store a quantity that can be overwritten.

Stocktake: scan everything in one room; list what was expected but not found;
differences become adjustments that a different admin approves.

Screens: item list with search and filters, item detail with full history,
low-stock list, missing and damaged list, "not seen in 12 months" list, asset
register by location and value with CSV export.

Phase 1 acceptance checks:

- A weekly count of a 20-shelf store room can be entered in under ten minutes.
- A wrong entry can be corrected and the history shows both entries.
- Tests prove finance and signed-out visitors cannot read or change stock.
- The seed script creates at least 200 fictional items across 15 locations.

### 5.2 People, policies, vehicles, renewals (Phase 2)

- **People directory**: name, role, section, phone or email, start date, active
  flag, Garda vetting status and expiry date, training dates. Nothing else.
- **Policies**: PDF, title, owner, version, approval date, next review date,
  which roles of people must sign. A sign-off record is entered by an admin:
  person, policy version, date signed, optional scan of the signed sheet. A new
  version resets everyone to unsigned. Grid of people against policies.
- **Vehicles**: an asset with registration, tax, insurance and NCT dates, and a
  keeper from the people directory.
- **Renewals register**: title, category, owner, due date, documents needed,
  notes. Sources: manual entries plus vehicle dates, vetting expiry, policy
  review dates and warranties. Email reminders to all admins at 60, 30 and 7
  days. Overdue is red.

### 5.3 Rota and maintenance log (Phase 3)

- **Rota**: weekly calendar. Slots for the five daily prayers, two Friday
  Jumu'ah prayers, and shifts for security, cleaning, reception and volunteers.
  People come from the directory. Warn on double-booking and on expired
  vetting. Templates for Ramadan and the two Eids. An on-call funeral slot.
  "Publish" produces a one-page PDF. Changes after publishing are marked amber
  on the next PDF. Prayer times are entered as reference, not calculated.
- **Maintenance log**: ticket against an asset or a location: description,
  photo, priority, reported by, assigned to, status, closing note, cost.

### 5.4 Lending library (Phase 4)

- One record per copy, one QR label per copy.
- Add a book: scan label, scan the ISBN barcode, look up title and author from
  a public book database (to confirm which; Open Library is a candidate).
  Manual entry when there is no ISBN, including Arabic titles.
- Lend: scan book, pick or add borrower, confirm due date. Return: scan book.
- Borrower: name and one contact detail only.
- Lists: on loan, overdue, most borrowed.

### 5.5 Expenses and Board report (Phase 5)

- Claim: receipt photo, amount, date, category, who paid, and whether it was
  paid by the Centre or paid personally and awaiting repayment.
- A different admin or finance approves or rejects with a reason.
- Fund tag on approval: unrestricted, or a restricted fund (Zakat, Fitra; list
  to confirm).
- Second approver above a threshold stored in settings (value to confirm).
- Approved claims are immutable. Corrections are new linked entries.
- Monthly CSV export in a format to agree with the bookkeeper.
- **Board report**: one-click PDF for a chosen month: asset and stock position,
  tickets opened and closed, compliance and renewals status, library activity,
  spend by category and fund.

### 5.6 Service registers (Phase 6, not before the services have settled)

- Funeral register: family contact, date, services provided (ghusl, kafan,
  janazah prayer, family room), who was on duty.
- Shahada register: name, date, authenticating imam, certificate number.
- Nikah register: names of the couple, date, officiant, witnesses, certificate
  number.
- Visible to super_admin only. No cause of death, medical details, immigration
  details or identity documents.
- Certificate generation is a later task. Do not build it until asked.

### 5.7 Home page (grows with each phase)

One screen of counters, each opening its list: low stock, missing or damaged
assets, open tickets, renewals due in 30 days, unsigned policies, pending
expenses, today's rota, books overdue.

## 6. Technical recommendation

Challenge this in the first session if you see a better fit for a non-developer
owner and a two-user system. Explain any alternative in plain English.

- Next.js with TypeScript, responsive web app.
- Managed PostgreSQL with row-level security (Supabase), EU region.
- Supabase authentication with TOTP two-factor.
- Private file storage in the same project.
- Hosting on Vercel, EU region.
- An Ireland-only network rule at the host, with an emergency bypass for one
  super_admin (to confirm on the chosen plan).
- Automated tests: unit tests for stock arithmetic and approvals, database
  tests for row-level security, and browser tests that also save screenshots
  to `docs/screens/`.
- Three environments: development and staging with made-up data only;
  production is created later in ICCI-owned accounts and is not part of the
  prototype.

## 7. Design

| Use | Value |
| --- | --- |
| Headers, navigation, primary buttons | #004236 |
| Links, active states, secondary buttons | #006B54 |
| Accents, dividers, large headings only | #B8985A |
| Card and panel backgrounds | #EAF2EF |
| Page background | warm white #FAF8F3 |
| Body text | #1F2A27 |
| Errors and overdue | #B3261E |

- Page titles in Title Case in Cormorant Garamond (serif); everything else
  in Plus Jakarta Sans; label numbers and codes in JetBrains Mono (owner
  decision, 15 Nov 2026; see docs/UI-PLAN.md).
- Icons from the free Lucide set, always with a word beside them or a hidden
  label.
- The round logo may sit on dark green. Photographs of the Centre appear on
  the sign-in screens and the home greeting only.
- Gold is never used for small text: the contrast is too low.
- Focus outline (keyboard use): 3 px, deep gold #8A6A2B on light
  backgrounds, light gold #D9C9A3 on dark green. Every colour pair is
  checked automatically (tests/unit/contrast.test.ts): 4.5 to 1 for text,
  3 to 1 for large titles and outlines.
- Layout: dark green sidebar on a PC (icons only on a tablet); on a phone
  a bottom bar (Home, Items, Scan, People, Menu). "Skip to the page" is
  the first thing the Tab key reaches. Full detail: docs/UI-PLAN.md.
- Scanning, counting and registering screens are phone-first: buttons at least
  44 pixels tall, three fields or fewer, camera in one tap.
- Every other screen is designed for a PC first.
- Labels in plain words: "Count this shelf", "Add stock", "Report damage".

## 8. Build order

Phase 0 is the prototype: Phase 1 scope, on made-up data.

1. Project setup, test tooling, seed script
2. Database foundation: users, roles, locations, audit log, row-level security
3. Sign-in, two-factor, idle sign-out
4. Items and labels: register, list, detail, history
5. Stock: restock, weekly count, adjustment, low-stock list
6. Assets: move, damage, missing, disposal
7. Label sheet printing
8. Stocktake
9. Home page counters
10. Fresh-eyes security review of the whole codebase

Later phases follow section 5 in order, one slice at a time.

## 9. After launch

Running the live system (watchers, severity scale, the fixing routine,
backups, the routine calendar, the backup developer, the agreement with ICCI
and the costs) is specified in `docs/AFTERCARE.md`. Section 12 of that
document lists what is set up before launch; Prompts 10 to 12 in
`docs/PROMPTS.md` run it.
