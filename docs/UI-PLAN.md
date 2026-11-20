# ICCI Control Dashboard: UI plan

Version 1, 15 November 2026. Written after reviewing the owner's two concept
images, the Cartsy and Mercury examples, the new high-resolution logo and
three photographs of the Centre. This plan says what the app should look like
and how it should behave, screen type by screen type, and then how to build it
in slices. Nothing here changes what the app does; it changes how it looks and
how easy it is to use.

Where this plan departs from `docs/PLAN.md` section 7 or `CLAUDE.md`, it is
marked **(rule change, to confirm)**. Nothing marked that way is built until
the owner says yes.

**Status, 16 Nov 2026:** all slices UI-1 to UI-8 are built and committed
(UI-0 was folded into UI-1). What changed from this plan while building:
the focus outline is a deeper gold (#8A6A2B) on light backgrounds so it
meets 3 to 1; the in-app camera scanner uses the QR reader built into the
browser (no new add-on), so iPhones keep the Camera-app steps; "Recent
activity" on Home waits until after Phase 2, as agreed.

**UI-9, 20 Nov 2026 (presentation polish):** Home now follows the owner's
mockup 4: four headline numbers, Needs attention as slim rows, the
all-clear counters as green chips, four large actions and "More actions".
Menu groups fold (Overview always open), "← Back" sits in the top bar,
saved messages float for 8 seconds, pages show grey loading shapes, and
admins reach the library through "Library overview" and the "Library
desk" tab bar. Screenshots: `docs/screens/slice-ui-9-*`.

## 1. What was wrong before, in plain words

1. **The menu is a list, not a map.** Eleven links in a row that wraps onto two
   lines. Phases 2 to 5 will add rota, maintenance, policies, library, expenses
   and accounts: that is twenty links. It cannot stay a row.
2. **No icons anywhere.** Every action is a word in a box. The eye has nothing
   to land on, so every screen looks the same.
3. **Page titles are shouted.** Capitals with wide letter spacing read like a
   certificate, not a modern tool. The owner's concepts use Title Case and
   that is the right call.
4. **The body font is a default.** Source Sans 3 is fine but anonymous.
5. **The logo is in a white rectangle** on a white header, so it looks pasted
   on. The new round, high-resolution version deserves better.
6. **Nothing says "this is the ICCI".** No photograph, no pattern, no sense of
   place. The concepts fix this with the building and a warm gold accent.
7. **Lists are bare tables.** No row hover, no grouping, filters in a plain
   green box, pagination as a text link.
8. **The sign-in is a grey box on cream.** It is the first thing anyone sees.

## 2. What to take from the concepts, and what to leave

Taken:

- **Dark green left sidebar** on a PC, with the round logo at the top, icons
  beside each link, and links grouped by module. This is the single biggest
  improvement and it solves the menu problem for every later phase.
- **The round gold logo on dark green** in the sidebar and on the sign-in
  screen. **(rule change, to confirm)**: `CLAUDE.md` says never place the logo
  on green. The old rectangular logo looked wrong on green; the new round
  version looks right, as the concepts show. Recommendation: allow it on dark
  green only, always as the full round coin, never recoloured, never cropped.
- **The building photograph** behind the sign-in and two-factor screens, with
  a dark green wash so the white text is readable.
- **Title Case serif headings** ("Move This Asset"), not capitals.
  **(rule change, to confirm)**: `PLAN.md` says serif capitals.
- **Counter cards with an icon and a coloured number**, and a "Quick actions"
  list on the home page.
- **Softer shapes**: 12 to 16 pixel corners, faint shadows, white cards on
  warm white.
- **Gold used as a thin line and a glow**, never as a block and never as
  small text (that rule stays).

Left out, with the reason:

- The public-website menu (About, Services, Events, Pricing, Register, Sign
  In). This app has no public pages. Signed-out visitors see only the sign-in
  screen, by design and for security.
- "Members 892", "Need help? Get support", a notification bell, "Recent
  activity: 2h ago". There are no members, no support desk and no
  notifications. Counters only show things that exist.
- A large photograph on every page. On a work tool it pushes the work down
  the screen. The photograph lives on the sign-in screens and as a slim strip
  behind the home-page greeting, and nowhere else.
- An AI-generated mosque. The concepts show a generic domed mosque. The
  Clonskeagh building is distinctive and we have real photographs of it, so
  we use those.
- A hero headline ("Empowering our community…"). Admins know where they are.

## 3. Brand and visual language

### 3.1 Colours

The palette in `PLAN.md` stays. This plan adds tints and a few shades so the
same seven colours can do more work.

| Name | Value | Use |
| --- | --- | --- |
| Green 900 | #002B23 | Sidebar bottom gradient, photo wash |
| Green 800 (existing dark) | #004236 | Sidebar, primary buttons, headings |
| Green 600 (existing) | #006B54 | Links, active states, secondary buttons |
| Green 100 (existing panel) | #EAF2EF | Panels, table header tint, hover |
| Green 50 | #F3F8F6 | Alternate card fill, selected row |
| Gold 500 (existing) | #B8985A | Hairlines, active marker, large headings only |
| Gold 300 | #D9C9A3 | Soft gold borders on cream |
| Gold 100 | #F4EEDF | Faint gold tint for highlighted cards |
| Cream (existing page) | #FAF8F3 | Page background |
| Ink (existing text) | #1F2A27 | Body text |
| Ink 60 | #5B6663 | Secondary text, captions |
| Red (existing) | #B3261E | Errors, overdue, red status |
| Amber | #8A5A00 text on #FBF1DC | Amber status |
| Status green | #1B6B3A text on #E3F2E7 | Green status |

Status colours remain the same everywhere and always carry a word.

### 3.2 Type

**(to confirm, see question 5)** Recommended pairing:

- **Titles: Cormorant Garamond, weight 600, Title Case.** An elegant serif
  with a calm, manuscript feel at large sizes. Used at 28 pixels and above
  only; below that it is too thin.
- **Everything else: Plus Jakarta Sans.** Modern, rounded, very readable at
  small sizes, with lining tabular numbers so columns of counts line up.
- **Label numbers (ICCI-000123) and codes: JetBrains Mono.** Easier to read
  aloud over the phone and to compare by eye.

All three are free Google fonts bundled at build time through `next/font`, as
today: no new dependency, no visitor contact with Google.

Alternative pairing if the owner prefers something warmer: Fraunces (titles)
with Inter (body). The cheapest change is to keep Playfair Display but drop
the capitals; that alone fixes most of the "certificate" feel.

Sizes (desktop): page title 32, section title 22, body 16, caption 14,
counter number 44 tabular. Phone: page title 26, counter number 36. Nothing
below 14 pixels except on printed labels.

### 3.3 Texture: a quiet geometric pattern

A single eight-point-star tile drawn by hand as an inline SVG, laid over the
sidebar and the sign-in panel at 6 to 8 percent opacity in gold. It gives the
green surfaces depth without a picture, costs nothing to load and prints as
nothing. It is never used behind text that has to be read closely.

### 3.4 Photographs

Three photographs were supplied. The straight-on view of the dome and minaret
over the hedges is the strongest and crops well to a wide strip. All three
are modest resolution (around 1,200 pixels wide, one much smaller), which is
enough for the sign-in panel once a dark green wash and a slight blur are
applied, but not enough for a sharp full-screen hero. See question 4 about
rights and higher-resolution originals.

Where the photo appears: sign-in, two-factor code, first-time set-up and
"signed out" screens (left panel on a PC, top band on a phone); a slim strip
(about 140 pixels tall) behind the home-page greeting. Nowhere else.

### 3.5 Logo

The new 2,000 pixel logo is a round coin on a white square. It needs cutting
out to a transparent PNG and WebP at 512, 160 and 64 pixels, so it can sit on
dark green and on cream without a white box. It is never recoloured and never
cropped inside the circle.

### 3.6 Icons

The app has no icons. Recommendation: **Lucide** (`lucide-react`), a free,
MIT-licensed set of about 1,500 consistent line icons, loaded one icon at a
time so only the ones used are shipped. **(new dependency, to confirm)**. The
alternative is to draw twenty icons by hand as SVG; it works but each new
module then needs drawing time.

Icon vocabulary: Home (house), Items (box), Register (plus in a box), Stock
(bar chart), Count a shelf (clipboard with a tick), Missing and damaged
(triangle alert), Not seen (eye off), Asset register (table), Stocktake
(scan line), People (users), Garda vetting (shield check), Print labels
(printer), Scan (QR code), Move (arrow right in a box), Approvals (check
circle), Sign out (log out).

### 3.7 Shape and depth

- Corners: 12 pixels on cards and inputs, 10 on buttons, 999 on status pills.
- Shadows: one soft shadow (0 1px 2px at 6 percent, plus 0 8px 24px at 6
  percent) on cards; none on tables; a stronger one on the sign-in card.
- Borders: 1 pixel, Green 100 on cream; Gold 300 where a card is "special"
  (the sign-in card, the primary counter).
- Focus ring: 3 pixel Gold 500 outside the element, visible on every control.
- Motion: 150 millisecond fades on hover and on page sections appearing.
  Nothing moves on its own.

## 4. The app shell

### 4.1 PC (1,024 pixels and wider)

A fixed left sidebar, 264 pixels wide, dark green with the star pattern:

1. Round logo (56 pixels) and the words "ICCI" over "Control Dashboard" in
   cream. Clicking goes home.
2. Links grouped under small gold-cream captions that grow with each phase:
   - **Overview**: Home
   - **Items and stock**: Items, Register an item, Stock, Stocktake,
     Print labels
   - **Assets**: Missing and damaged, Not seen in 12 months, Asset register
   - **People**: People, Garda vetting (Phase 2 adds Training, Policies,
     Policy grid, Lists)
   - Later: **Rota**, **Maintenance**, **Library**, **Expenses**, **Admin**
     (Accounts, Audit log for Super Admin only)
   Each link: icon, label, 44 pixels tall. Active link: Green 100 text on a
   Green 900 pill with a 3 pixel gold bar on the left. Links a role cannot use
   are not shown at all (Finance today sees "you cannot" pages; it should
   instead not see the links).
3. At the bottom: the signed-in person's initials in a gold-ringed circle,
   their name and role, and Sign out.

The main area has a slim top bar (64 pixels, white, hairline bottom) holding
the breadcrumb on the left ("People › Test Volunteer") and, on the right, a
global "Open a label" box (type ICCI-000123 or scan) and the idle-sign-out
countdown when under two minutes remain. The top bar never holds the logo
twice.

Content sits in a 1,200 pixel column with 32 pixel side padding.

### 4.2 Tablet (768 to 1,023 pixels)

The sidebar collapses to 72 pixels of icons only, with a tooltip on hover;
a button at the top expands it over the page.

### 4.3 Phone (under 768 pixels)

No sidebar. A white top bar with the small round logo, the page title and a
menu button. A **bottom bar** with five large targets: Home, Items, Scan,
People, Menu. "Scan" is raised and gold-ringed because it is the thing a
phone is for in this app. "Menu" opens a full-height sheet listing every
link in the same groups as the PC sidebar, plus the signed-in person and
Sign out. The idle sign-out warning appears as a bar above the bottom bar.

## 5. Screen patterns

Every screen is one of six patterns. Building the six well once makes every
later module look right with no extra design work.

### 5.1 Sign-in family (sign-in, code, set-up, signed out, no access)

PC: a two-panel card centred on cream. Left panel: the Centre photograph with
a Green 900 wash, the round logo, "Islamic Cultural Centre of Ireland", and a
one-line caption at the foot: "For ICCI administrators only. All data in this
prototype is made up." Right panel: white, the form, 420 pixels wide.

Phone: the photo panel becomes a 180 pixel band at the top with the logo
overlapping its lower edge; the form sits below on white.

The six-digit code becomes six separate boxes that fill as you type and paste
correctly in one go (the owner's concept). The whole field is still one input
for screen readers.

### 5.2 Home

PC, top to bottom:

1. Greeting strip: photo strip with green wash, "Good morning, Test Admin"
   in the serif, today's date, and the count of things needing attention in
   one sentence ("3 things need attention").
2. **Needs attention**: only counters that are red or amber, as cards with an
   icon, the number large, the word ("Overdue", "Low") and "Open the list".
   When nothing is red or amber, one calm green card: "All clear".
3. **Quick actions**: Register an item, Count a shelf, Report damage,
   Move an asset, Record vetting, Print labels, each with an icon. Shown only
   for actions the role can take.
4. **Everything else**: the remaining counters in a quieter row.

Phone: the greeting strip shrinks to two lines; the Scan button is already in
the bottom bar; the rest stacks.

"Recent activity" (as in the concepts) is useful but needs a new database
view that respects each role's limits. It is listed as a later slice, not
part of the first pass (question 7).

### 5.3 Lists (Items, People, Stock, Vetting, Missing and damaged, Not seen, Asset register, Approvals, Stocktakes, Disposals waiting)

- **Page header**: breadcrumb above, title left, primary button right
  ("Register an item"), a one-line count under the title ("487 items").
- **Toolbar**: one row, white card. Search box with a magnifying glass first,
  then compact filter dropdowns, then "Clear". Filters apply on change; no
  separate Search button on a PC. On a phone the filters fold behind a
  "Filters (2)" button that opens a sheet.
- **Table**: sticky header in Green 100 with Ink text (not solid dark green,
  which fights the sidebar); 52 pixel rows; hover fill Green 50; the name is
  the link; label numbers in the mono font; status pill at the right.
  Secondary detail (the location path) in Ink 60 under the name on narrow
  screens instead of its own column.
- **Pagination**: "1 to 50 of 487" with Previous and Next buttons, and a page
  size choice (50, 100, 200).
- **Empty state**: an icon, one sentence, and the primary action
  ("No items match. Clear the filters or register an item.").
- **Loading**: grey placeholder bars in the shape of the table, never a
  "Loading…" sentence alone.
- **CSV export** where it exists: an outline button with a download icon at
  the right end of the toolbar.

### 5.4 Detail pages (item, person, stocktake, label sheet)

- Header: breadcrumb, Title Case name, under it a line of facts separated by
  dots (label number, place, kind) and the status pill.
- A row of action buttons under the header: the most common one filled, the
  rest outline. On a phone the row scrolls sideways.
- Two columns on a PC: the left two-thirds for the main facts and history;
  the right third for side cards (photo, admin account link, vetting). One
  column on a phone, side cards after the main facts.
- History as a vertical timeline with a dot per entry, the date on the left,
  the who-and-what on the right, and the photo thumbnail where there is one.
- Facts in a two-column grid of label over value, not a table with a border
  per row.

### 5.5 Forms (edit, register, add stock, correct, record vetting, move, report damage, dispose)

- One column, 560 pixels wide on a PC, in a white card. Never a form that
  spans the whole screen.
- Label above the field; help text below in Ink 60; errors below in red
  with an icon and the field outlined red.
- Inputs 48 pixels tall on a phone, 44 on a PC; 12 pixel corners; Green 600
  border on focus plus the gold focus ring.
- Multi-step forms (register an item) show "Step 2 of 3: Where is it?" and a
  slim progress line in gold.
- Photo: a large dashed drop area with a camera icon on a phone ("Take a
  photo"), showing the thumbnail with a "Retake" link once taken.
- The primary button sits at the bottom right on a PC and full width, stuck
  to the bottom of the screen, on a phone. A "Cancel" link beside it.
- Dangerous actions (dispose, switch off, withdraw) use a red outline button
  and a confirmation sheet that repeats what will happen in plain words.

### 5.6 Phone-first action screens (scan, count this shelf, stocktake scan, report a problem)

- Full-screen, minimal: a 56 pixel top bar with Back and the title, the
  camera or the three fields, one big button. No sidebar, no breadcrumb.
- The scanned item is confirmed with a green tick card before any action.
- Numbers are entered with a big stepper (minus, number, plus) and the
  numeric keyboard.
- The last result stays visible in a small card at the top so the person
  knows the previous scan saved.

## 6. Shared building blocks

Built once in `src/components/ui/` and used everywhere. Today each page
repeats the same Tailwind classes; this is why small changes are slow.

Button (primary, secondary, outline, danger, ghost; sizes; icon slot),
Input, Select, Textarea, Field (label, help, error), StatusPill, Card,
PageHeader, Breadcrumb, Toolbar, DataTable (sticky header, empty, loading),
Pagination, Timeline, FactGrid, Stepper, PhotoCapture, Sheet (phone),
ConfirmDialog, Notice (success, warning, error), EmptyState, Skeleton,
CounterCard, QuickAction, Avatar, Sidebar, BottomBar, TopBar, AuthPanel.

## 7. Accessibility and practicality checks

- Every colour pair is checked for 4.5 to 1 contrast; gold on cream fails and
  is never used for text under 28 pixels.
- Every status has a word. Every icon-only button has a hidden label.
- Keyboard: the whole app works with Tab and Enter; the focus ring is gold
  and visible; the sidebar is one tab stop with arrow keys.
- Targets: 44 pixels minimum everywhere, 48 on phone forms.
- Arabic text in any field keeps displaying correctly (right-to-left inside
  the field).
- Print: label sheets and the future rota print exactly as now; the shell,
  photo and pattern print as nothing.
- Speed: fonts bundled, photos served as WebP at two sizes, pattern as inline
  SVG, icons tree-shaken. Target: home page interactive under one second on
  a phone on 4G.

## 8. Build order (one slice per session)

| Slice | What is built | How the owner checks it |
| --- | --- | --- |
| UI-0 | **Style sample page**: one screen showing the two font pairings, the colours, buttons, pills, a counter card and the logo on green, side by side. No app changes. | One screenshot; the owner picks the fonts and confirms the rule changes. |
| UI-1 | **Foundation**: colour tokens, fonts, icons, logo cut-outs, pattern, the shared building blocks in `src/components/ui/`. The app looks the same until UI-2. | Unit tests pass; a components page screenshot. |
| UI-2 | **App shell**: sidebar, top bar, phone bottom bar and menu sheet, role-aware links, breadcrumb. | Screenshots of Home on PC, tablet and phone for Centre Admin and Finance. |
| UI-3 | **Sign-in family**: photo panel, six-box code, set-up, signed-out and no-access screens. | Screenshots of all five, PC and phone. |
| UI-4 | **Home**: greeting strip, Needs attention, Quick actions, remaining counters, All clear state. | Screenshots with and without red counters. |
| UI-5 | **Lists**: every list moved onto DataTable, Toolbar, Pagination, EmptyState. | Screenshots of Items, People, Vetting, Stock, Missing and damaged. |
| UI-6 | **Detail pages and forms**: item, person, stocktake, label sheet; all edit and action forms on Field and Button. | Screenshots of item, person, register step 2, move, record vetting. |
| UI-7 | **Phone-first actions**: scan, count a shelf, stocktake scan, with the stepper and confirm card. | Phone screenshots; a real phone walk-through by the owner. |
| UI-8 | **Finish**: contrast audit, keyboard pass, print check, update `PLAN.md` section 7 and `CLAUDE.md`, regenerate every screenshot in `docs/screens/`. | Full test suite output; a before-and-after sheet. |

Each slice ends with the full test suite passing. The browser tests mostly
find things by their test ids and visible words, so restyling is low risk;
UI-2 will need the tests that click the old top menu updated to the sidebar
and bottom bar, and that is done in the same slice.

After UI-8, Phase 2 continues at P2.4 (training dates) on the new look.

## 9. Questions for the owner

**Answered 15 Nov 2026:** 1 yes, 2 yes, 3 yes, 4 use them and enhance them
(no larger originals), 5 Claude's choice (Cormorant Garamond, Plus Jakarta
Sans, JetBrains Mono), 6 yes, 7 after Phase 2, 8 yes. Because the fonts were
left to us, UI-0 (the font sample) was folded into UI-1: the style sample
page at /style shows the chosen look.

1. **Logo on dark green.** `CLAUDE.md` forbids it. Allow the new round logo
   on dark green in the sidebar and sign-in panel, as the full coin, never
   recoloured? Recommendation: yes.
2. **Title Case headings** instead of serif capitals (a `PLAN.md` change)?
   Recommendation: yes.
3. **Icons.** Add `lucide-react` (free, MIT, about 1,500 line icons, only the
   used ones shipped)? Recommendation: yes. Alternative: hand-drawn SVGs.
4. **Photographs.** Who took the three photos, and may the Centre use them?
   Are higher-resolution originals available? Recommendation: use the
   straight-on dome-and-minaret photo; even at its current size it works
   under a dark wash.
5. **Fonts.** A: Cormorant Garamond + Plus Jakarta Sans + JetBrains Mono
   (recommended). B: Fraunces + Inter. C: keep Playfair Display, drop the
   capitals, add Plus Jakarta Sans. Recommendation: decide from the UI-0
   sample screenshot rather than from names.
6. **Sidebar on a PC and bottom bar on a phone** instead of the top menu?
   Recommendation: yes; it is the only layout that survives Phases 2 to 5.
7. **Recent activity on Home.** Build it now as part of UI-4 (needs a new
   database view and permission tests, about one extra session) or after
   Phase 2? Recommendation: after Phase 2.
8. **Dark green pattern.** A faint eight-point star over the sidebar and
   sign-in panel, or plain green? Recommendation: pattern, at 6 to 8 percent.
