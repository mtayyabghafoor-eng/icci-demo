# Keeping the site running after launch

A plan for the owner, who is not a developer, for everything that happens
after the website goes live: knowing when something is wrong, finding out
what it is, fixing it safely, and keeping the system healthy year after year.

Written 16 November 2026. Nothing in this document has been built or bought
yet. Section 12 lists what to set up, in order, before the launch.

---

## 1. The short version

You do not need to read code to run this system safely. You need three
things, and each one is either built into the services already chosen or
costs very little:

1. **The system tells you when something is wrong**, by email, with the exact
   error and the screen. You forward it; you do not interpret it.
2. **A safe undo**. The hosting keeps every previous version of the site. Going
   back to yesterday's working version is two clicks and takes a minute.
3. **A fixed routine** for handing the problem to Claude Code, checking the fix
   on a test copy, and only then releasing it.

Behind those sits a safety net: nothing in the database is ever deleted, every
change is logged, and there are daily backups. A bug can show a wrong screen.
It cannot quietly destroy records.

And for the rare problem that is beyond you and Claude Code together, there is
a named backup developer on a small retainer. That is the single most
important item in this plan.

---

## 2. The honest picture: what can go wrong

| What can happen | How likely | How bad | What protects you |
| --- | --- | --- | --- |
| A screen crashes or shows an error | Occasionally, mostly after a change | Annoying | Error alerts, rollback |
| The site is down | Rare; usually Vercel or Supabase themselves | Serious for an hour | Uptime alert, status pages, nothing to fix yourself |
| An admin cannot sign in (lost phone, lost authenticator) | Likely once a year | Serious for that person | Recovery procedure, a second Super Admin |
| A number or list is wrong | Occasionally | Depends | Correction entries, audit log, nothing overwritten |
| A change breaks something that worked | Likely at some point | Annoying | Tests, staging copy, rollback |
| A card or account lapses and a service stops | Likely over the years | Serious | Yearly checklist, ICCI-owned accounts |
| A security update is needed in a library the site uses | Several times a year | Low if done monthly | Monthly maintenance session |
| Records destroyed by a bug or a mistake | Very unlikely | Very bad | No deletes anywhere, backups, monthly export |
| You are unavailable for a long time | Possible | Serious | Handover pack, backup developer |

Most of what will actually happen is in the first and fifth rows, and both are
handled by the same routine: undo, reproduce on the test copy, fix with Claude
Code, test, release.

---

## 3. How you will know: the watchers

Each watcher does one job and emails you only when something is wrong. None
of them needs you to look at a dashboard.

| Watcher | What it tells you | Tool | Cost | Needs your approval? |
| --- | --- | --- | --- | --- |
| Uptime check | "The site has been unreachable for 5 minutes" | UptimeRobot or Better Stack (free plan) | Free | Just an account |
| Error alerts | "This screen crashed at 14:32 for this user, with this error" | Sentry (free plan, 5,000 errors a month) | Free at this size | Yes: it adds a small library to the site |
| Release failures | "Today's release failed to build" | Vercel, built in | Included | No |
| Database health | "Your database is near its limit" or "a backup failed" | Supabase, built in | Included in Pro | No |
| Nightly self-check | "The automated tests failed last night" | GitHub Actions running the full test suite against the staging copy every night | Free (the private-repository allowance is plenty) | No |
| Report a problem button | A note from you or Dr Khan inside the app: which screen, who, when, what they were doing | Built into the app (a small new table and screen) | Nothing | It is a small slice of work |
| Health page | One screen inside the app: last backup, last nightly check, open problems, upcoming renewals of services | Built into the app | Nothing | Optional, nice to have |

**Recommendation:** set up all of the first six before launch. They cost
nothing and are far easier to add while the site is still being built. The
health page can wait.

If you would rather not add Sentry (it is a third-party service that sees
error messages, not personal data, but still a service), the fallback is
Vercel's own error logs. They are harder to read and do not email you, so
Sentry is the recommended choice.

---

## 4. The severity scale

Decide the severity first, before doing anything. It tells you how fast to
act and whether to undo.

| Level | Meaning | Examples | What to do | By when |
| --- | --- | --- | --- | --- |
| **Red** | Nobody can use the site, or data looks wrong on many screens | Site down; sign-in broken for everyone; stock levels wrong everywhere | Roll back to the last good version now. Then investigate. | Within the hour |
| **Amber** | One feature is broken, the rest works | Label printing fails; one list will not open; a photo will not upload | Do not roll back. Work around it. Fix within days. | Within 3 days |
| **Yellow** | Wrong but harmless | A typo; a misaligned button; a slow page | Note it. Fix in the next monthly session. | Next month |
| **Grey** | Not your bug | Vercel or Supabase are having an outage (their status pages say so) | Wait. Tell the other admins. Nothing to fix. | When they fix it |

If you are not sure whether something is Red or Amber, treat it as Amber
unless more than one person is affected.

---

## 5. The fixing routine

This is the card to keep to hand. It is the same every time.

### Step 1: do not touch the live database

Never fix data by hand, never change a setting in the Supabase dashboard to
"see if it helps", never edit the live site. Everything goes through the
routine below. The database rules mean you cannot easily do harm, but the
habit matters.

### Step 2: decide the severity (section 4)

### Step 3: if Red, undo first

In Vercel: open the project, open **Deployments**, find the last one marked
as working (the one before today's), open its menu and choose **Promote to
Production**. The previous version is live again within a minute. You have
now bought yourself time. Nothing is lost by doing this; the newer version is
still there to go back to.

If the site is down and Vercel's own status page or Supabase's status page
shows a problem, it is Grey: wait.

### Step 4: write down what you saw

Fill in these five lines. They go to Claude Code word for word.

```
Screen: (which page, or the web address)
What I did: (the steps, in order)
What happened: (what you saw, with the screenshot or the error email)
What I expected:
Who else is affected, and since when:
```

The error email from Sentry, if there is one, is the most useful thing you
can attach. Forward it whole.

### Step 5: reproduce it on the staging copy

The staging copy is a second, identical site with made-up data. Try the same
steps there. If it happens there too, Claude Code can work on it safely. If it
only happens on the live site, say so: the cause is usually a difference in
settings or data, and that narrows the search a lot.

### Step 6: hand it to Claude Code

Use Prompt 11 in `docs/PROMPTS.md`. It makes Claude Code find the cause
before changing anything, explain it in plain English, fix it, add a test
that would have caught it, and run the full suite. You read the explanation
and the test output. You do not read the code.

If the explanation does not make sense to you, ask it to explain again as if
to a hospital manager (Prompt 5). If after two attempts the problem is still
there, stop, start a fresh session, and include what you learned. If a third
attempt fails, this is the moment for the backup developer.

### Step 7: check the fix on staging

Claude Code releases the fix to the staging copy first. You repeat your steps
from Step 4 there. Only when you see it working do you say "release".

### Step 8: release

Releasing is a push of the fixed code to the main branch. Vercel builds and
publishes it automatically within a few minutes. Claude Code does this when
you say "release". If the build fails, Vercel emails you and the previous
version stays live: a failed release can never take the site down.

### Step 9: log it in one line

Add one line to `docs/INCIDENTS.md`: the date, what broke, why, what fixed
it. Claude Code can write the line. Over a year this log becomes the most
useful document you have, for you and for anyone who takes over.

### The special cases

- **Someone cannot sign in.** Lost phone or lost authenticator app. A Super
  Admin resets their two-factor from the accounts screen, and they set it up
  again on first sign-in. If the Super Admin is the one locked out, the
  second Super Admin does it. Always have two.
- **A number is wrong.** Stock and assets are never overwritten; they are
  derived from movements and counts. The fix is a correction entry on the
  screen, not a database edit. If a correction entry cannot express the fix,
  Claude Code writes a numbered migration and you see exactly what it changes
  before it runs.
- **The site is slow.** Yellow. Note which screen and roughly how many
  records. Raise it in the monthly session.
- **An email from a service says "action required".** Usually a payment,
  a plan limit or a renewal. Read it in full; those are the ones that quietly
  turn into a Red six weeks later.

---

## 6. The safe path for every change

Three copies of the site, used in a fixed order:

| Copy | Data | Who uses it | Purpose |
| --- | --- | --- | --- |
| Development | Made up | Claude Code, on your PC | Building and testing |
| Staging | Made up | You, Dr Khan, Claude Code | Looking at a change before it goes live; reproducing bugs |
| Production | Real | The admin team | The live system |

Every change, however small, walks the same path: built on development,
full test suite passes, released to staging, looked at by you, released to
production. Nothing is ever edited on production directly. Vercel also makes
a private preview address for every change, so you can look at a single
change on its own before it joins staging.

This is slower than "just change it on the live site". It is also the reason
you can sleep.

---

## 7. Backups and recovery

Nothing in the app can delete a record, so backups are for the two things
that rule cannot stop: a service failing, and a mistake in a migration.

| Layer | What it covers | How it is done | Who |
| --- | --- | --- | --- |
| Daily backups | Whole database, kept 7 days | Supabase Pro plan, automatic | Supabase |
| Point-in-time recovery | Restore to any minute in the last 7 days | Supabase add-on (about $100 a month). Recommended only once the data would be painful to lose a day of; decide at launch | Supabase |
| Monthly export | A copy you hold yourself, outside Supabase | Claude Code produces a dated export file (database and uploaded files). You save it to an ICCI-owned drive | You, 10 minutes |
| Restore drill | Proof that a backup can actually be restored | Twice a year, restore last month's export into staging and look at it | Claude Code, you watch |

The restore drill is the part people skip. Do not skip it. A backup that has
never been restored is a hope, not a backup.

---

## 8. The routine calendar

| When | Time | What |
| --- | --- | --- |
| Daily | 0 | Nothing. The watchers email you if something is wrong. |
| Weekly | 10 min | Open the Report a problem list and the uptime report. Decide severity of anything new. |
| Monthly | 1 hour | A maintenance session with Claude Code (Prompt 12): apply library updates, run the full suite, fix Yellows, produce the monthly export, read the service bills. |
| Quarterly | 2 hours | Security review (Prompt 6). Check that the second Super Admin still has access. Review who has an account and deactivate leavers. |
| Twice a year | 1 hour | Restore drill (section 7). Rollback drill: roll staging back one version and forward again, so you have done it before you need to. |
| Yearly | 2 hours | Renew the domain. Check the payment card on each service. Rotate the service keys. Read and update this document and the agreement with ICCI. |

Put the monthly, quarterly and yearly items in your own calendar now, as
repeating events.

---

## 9. Accounts, keys and the handover pack

Everything should survive you losing your laptop, your phone, or your
interest.

- **One shared password manager** (Bitwarden has a free plan for two people,
  or a family plan for a few euro a month) holding: GitHub, Vercel, Supabase,
  the domain registrar, Sentry, the uptime monitor, and the recovery codes for
  each. You and one other trusted person (a trustee, or Dr Khan) can open it.
- **Accounts in ICCI's name.** All services are registered with the
  project-only email already chosen, so they can be handed over. That mailbox
  must itself be in the password manager and have a recovery phone that is
  not only yours.
- **Two Super Admins at all times.** Never one.
- **The handover pack** is a folder, kept with ICCI, containing: this document,
  `docs/PLAN.md`, `docs/INCIDENTS.md`, the list of services with monthly
  costs and renewal dates, the name and terms of the backup developer, and
  the latest monthly export. Claude Code refreshes the service list at the
  yearly review.

With this pack, a competent developer who has never seen the project could
take it over in a day.

---

## 10. The backup developer

You and Claude Code will handle almost everything. The backup developer is
insurance for the rest: a migration that went wrong, a service that changed
its rules, a problem Claude Code cannot see, or simply you being away.

- **Who:** one freelance web developer who knows Next.js and Supabase. Ask
  for someone who has run small systems for small organisations, not an
  agency. Irish rates are roughly 60 to 100 euro an hour.
- **What to agree, in writing:** a small retainer (for example 2 hours a
  month, used or not) or pay-per-incident; a response time (next working day
  is reasonable for a system of this size); that they get read access to the
  repository and the staging copy from day one, so the first call is not also
  their first look.
- **When to call them:** a Red that rollback did not fix; a problem Claude
  Code has failed on three times; any change to the database that Claude
  Code says it is unsure about; anything to do with money, law or a security
  breach.
- **What to hand them:** the handover pack. They should read this document
  first.

Find and agree this before launch, while nothing is urgent. The worst time
to look for a developer is at 9 pm on the night the site is down.

---

## 11. The agreement with ICCI

As the accountable person, protect yourself with a page that states plainly:

- What the system does, and that it is maintained with reasonable care, not
  that it will never fail.
- Response times by severity (section 4), during the hours you are actually
  available.
- Who pays for the services (section 13) and that they are ICCI's accounts.
- That records are never deleted and backups are kept, and what the recovery
  time is (a day, with the monthly export; an hour, with daily backups).
- What happens if you step away: the handover pack and the backup developer.
- What is out of scope: anything the plan excludes (no offline mode, no
  accounting, no payroll), and anything used on a device or network you do
  not control.

---

## 12. What to set up before launch, in order

Each line is one session with Claude Code. None of them is large.

1. **Staging copy.** A second Supabase project and a Vercel environment, with
   made-up data, at a private address. (Prompt 10 covers items 1 to 5.)
2. **Nightly self-check.** GitHub Actions runs the full test suite against
   staging every night and emails only on failure.
3. **Uptime monitor.** You create the free account; Claude Code tells you
   what to enter.
4. **Error alerts.** Sentry, if you approve the dependency. Claude Code adds
   it so that no personal data is ever sent, only the error and the screen.
5. **Report a problem button** and the list it feeds, as a small slice.
6. **Incident log.** An empty `docs/INCIDENTS.md` with the one-line format.
7. **Rollback drill.** Do one rollback on staging with Claude Code
   explaining each click, and screenshot it for this document.
8. **Monthly export** script and the first export, saved to an ICCI drive.
9. **Password manager** set up and shared; every service and its recovery
   codes inside it.
10. **Backup developer** found, agreed, given access to the repository and
    staging.
11. **The agreement** written and signed.
12. **Health page** in the app. Optional; after launch is fine.

---

## 13. Running costs

| Item | Monthly | Yearly | Notes |
| --- | --- | --- | --- |
| Supabase Pro | about $25 | about $300 | Needed for daily backups |
| Vercel Pro | about $20 | about $240 | Needed for organisational use and server-side sign-out |
| Domain (for example under icci.ie) | | about 20 to 40 euro | Set a renewal reminder |
| Uptime monitor | free | | |
| Sentry | free | | At this size |
| GitHub | free | | Private repository |
| Password manager | free to about 3 euro | | |
| Point-in-time recovery | about $100 | about $1,200 | Optional, decide at launch |
| Backup developer retainer | about 150 to 200 euro | about 2,000 euro | 2 hours a month at Irish rates |
| **Total without options** | **about 60 euro** | **about 700 euro** | |
| **Total with retainer** | **about 250 euro** | **about 2,700 euro** | |

---

## 14. Decisions for you

| Question | Recommendation | Alternative |
| --- | --- | --- |
| Add Sentry for error alerts? | Yes. Free, no personal data sent, and it turns "something is wrong" into "this is wrong, here". | Use Vercel's own logs: free, nothing added, but no emails and harder to read. |
| Which uptime monitor? | UptimeRobot: free, simple, emails and optional text messages. | Better Stack: slightly nicer, also free at this size. |
| Backup developer now or after launch? | Before launch, on a small retainer. | Pay-per-incident, found only when needed. Cheaper, riskier. |
| Point-in-time recovery? | Not at launch. Daily backups plus the monthly export are enough for a system where nothing is deleted. Review after six months. | Add it from day one for about $100 a month. |
| Who is the second person in the password manager? | A trustee, so it survives a change of admin staff. | Dr Khan. |

Tell Claude Code your answers and it will record them in `docs/PROGRESS.md`
and update this document.
