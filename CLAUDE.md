# ICCI Control Dashboard

Admin-only web app for the Islamic Cultural Centre of Ireland: inventory, people,
policies, renewals, rota, maintenance, library, expenses, service registers.
The full specification is in `docs/PLAN.md`. Read it before any task.
Progress and decisions are logged in `docs/PROGRESS.md`. Read it at the start
of every session and update it at the end.

## Who you are working with

The owner of this repository is a doctor, not a developer. He reviews your work
from screenshots and plain-language summaries, not from code.

- Explain every decision in plain English, with no unexplained jargon.
- When something is not covered by `docs/PLAN.md`, stop and ask. Offer two or
  three options with a recommendation. Do not guess.
- Before building anything, show a plan of ten lines or fewer and wait for "go".
- End every task with: what changed (three lines), the test command you ran and
  its output, and screenshots of each changed screen saved in `docs/screens/`.
- If you are unsure whether something is safe, say so.

## Rules with no exceptions

- Made-up data only. Never real names, phone numbers, receipts or documents.
  Seed data must be obviously fictional.
  One exception (owner's decision, 22 Nov 2026): the online demo (ICCI
  Staging) may name real Irish suppliers with their published business
  details and hold real manufacturers' published manuals (scripts/demo-data.mts,
  files in the git-ignored demo-files/). People in the demo stay invented
  (male Arabic names for the administration), never real ICCI staff, and
  their phone numbers use the unused Dublin 01 000 range. Development and
  test data stay obviously fictional.
- Never print, log or commit secrets. Keys live in `.env.local`, which is
  git-ignored. Never read or display `.env*` files.
- Every table has row-level security enabled and a test that proves each role,
  and a signed-out visitor, cannot do what they should not.
- No hard deletes anywhere. Records are deactivated or corrected with a new
  linked entry. The audit log is append-only.
- Every database change is a numbered migration file. Never change the
  database by hand or through a dashboard.
- Stock quantities are never overwritten. The current quantity is derived from
  movements and counts.
- Nobody can approve their own entry. Enforce this in the database, not only
  in the screen.
- No offline mode, no staff or volunteer logins, no accounting ledger, no
  payroll. If a task seems to need one, stop and ask.
- Do not add a dependency without saying what it is for and asking first.

## Working rhythm

- One slice per session. A slice is one small feature from `docs/PLAN.md`.
- Tests first for anything involving permissions, stock arithmetic or approvals.
- Run the full test suite before saying a task is done. Keep going until it
  passes. Show the output.
- Commit after each passing slice with a clear message.

## Commands

Run from the project folder. Database commands need `.env.local` (copied from
`.env.example`) and a one-time `npx supabase login` + `npx supabase link`.

- Install: `npm install` then `npx playwright install chromium`
- Run locally: `npm run dev` then open http://localhost:3000
- Run tests: `npm test` (type check, lint, unit, database, browser)
- Run the permissions tests only: `npm run test:permissions`
- Apply migrations: `npm run db:push`
- Tests use the LOCAL Supabase database in Docker by default (Docker Desktop
  must be running). One-time: `npm run setup:local-db` (writes the
  git-ignored `.env.localdb`). Cloud icci-dev instead: set
  `ICCI_TEST_TARGET=cloud` before `npm test`.
- Reset and seed the local test database: `npm run db:reset`
  (seed only: `npm run db:seed`). The cloud icci-dev versions are
  `npm run db:reset:cloud` and `npm run db:seed:cloud` (both refuse unless
  ICCI_ENVIRONMENT=development).
- Refill the online demo (ICCI Staging) with made-up data:
  `npm run db:seed:staging` (needs `.env.staging`; never resets).
- Take screenshots: `npm run screenshots` (saved to `docs/screens/`)
- Create the test-account password in `.env.local`: `npm run setup:test-password`

Notes: Next.js 16 differs from older versions; read `node_modules/next/dist/docs/`
before using an unfamiliar API (see `AGENTS.md`). Supabase CLI v3 uses
`--remote` (not `--linked`) for the cloud project.

## Design

Colours and style rules are in `docs/PLAN.md` under "Design"; the full look
and screen patterns are in `docs/UI-PLAN.md`. The logo is
`public/brand/icci-logo-*.png` (round, transparent). Never recolour or crop
it. It may sit on dark green (#004236 or darker) and on cream or white,
always as the whole round coin. Use the shared parts in `src/components/ui/`
rather than repeating styles on each page.
