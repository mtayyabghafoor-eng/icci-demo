# Prompts to use with Claude Code

Copy one prompt at a time. Start a new session (or type `/clear`) between
prompts unless a prompt says to continue.

---

## Prompt 1: orientation (first session, no code)

```
Read CLAUDE.md, docs/PLAN.md and docs/PROGRESS.md. Do not write any code yet.

1. Tell me in plain English, in under 20 lines, what you understand we are
   building and what is out of scope.
2. Challenge the technical recommendation in section 6 of the plan. I am not
   a developer and there will be two or three users. If something simpler or
   safer fits, say so and explain the trade-off.
3. Ask me every question you need answered before starting, as multiple-choice
   questions with your recommended option first.
4. List what I need to install and which accounts I need to create, step by
   step, assuming I have never done this before.

Then write my answers and the final decisions into docs/PROGRESS.md.
```

## Prompt 2: project setup

```
Read CLAUDE.md, docs/PLAN.md and docs/PROGRESS.md.

Set up the project for build-order step 1 only: the app skeleton, the test
tooling, a development database with made-up data only, and a seed script that
creates at least 200 obviously fictional items across 15 locations.

Show me your plan in ten lines or fewer and wait for "go".

When done: fill in the Commands section of CLAUDE.md, run every command once
and show me the output, commit, and update docs/PROGRESS.md.
```

## Prompt 3: one slice (reuse for every feature)

Replace the text in angle brackets.

```
Read CLAUDE.md, docs/PLAN.md and docs/PROGRESS.md.

Build this slice only: <build-order step number and name, for example
"5. Stock: restock, weekly count, adjustment, low-stock list">, as described in
section <section number> of the plan.

Before coding, show me a plan in ten lines or fewer, including which tests you
will write, and wait for "go".

Then build it. Write the tests first for anything involving permissions, stock
arithmetic or approvals. Run the full test suite and keep going until it
passes.

Finish with:
- three lines on what changed, in plain English
- the test command you ran and its output
- a screenshot of every new or changed screen, saved in docs/screens/, on a
  phone-sized and a PC-sized window
- anything you were unsure about
Then commit and update docs/PROGRESS.md.
```

## Prompt 4: review against the plan (after every slice)

```
Use a subagent to review the changes from the last commit against
docs/PLAN.md and the rules in CLAUDE.md. Check that every requirement for this
slice is implemented, that every table touched has row-level security and a
test for each role and for signed-out visitors, that nothing can be hard
deleted, and that no secret or real-looking personal data is in the code.
Report only gaps that affect correctness or security. Skip style.
```

## Prompt 5: explain it to me

```
Explain what you built in this session as if to a hospital manager. What can I
now do in the app, step by step? What should I click to check it works? What
would go wrong if it were broken?
```

## Prompt 6: security review (end of each phase, fresh session)

```
Read CLAUDE.md and docs/PLAN.md. Act as an independent security reviewer who
did not write this code. Review the whole codebase and the database migrations.

Try to find ways that: a signed-out visitor could read anything; one role could
read or change what the plan forbids; a record could be deleted or silently
altered; an approval could be self-approved; a secret could leak; personal data
beyond the plan's field lists could be stored.

For each finding give: severity, how to reproduce it, and the fix. Do not fix
anything yet. Write the findings to docs/security-review-<date>.md.
```

## Prompt 7: when something is wrong

```
This is not right: <what you see, with a screenshot if possible>.
What I expected: <what should happen>.
Find the cause before changing anything, tell me what it is in plain English,
then fix it, add a test that would have caught it, and run the full suite.
```

If the same problem is still there after two corrections, stop. Type `/clear`
and start again with a clearer description that includes what you learned.

## Prompt 8: end of session

```
Update docs/PROGRESS.md: what was built today, what was decided, what is next,
and any open questions for me. Then tell me the single next prompt I should
run.
```

## Prompt 9: when the plan changes

Use this after the site visit, or whenever the admin team changes its mind.

```
The plan has changed: <describe the change>.
Update docs/PLAN.md to match, show me the before and after of each changed
section, and list which already-built parts are affected. Do not change any
code until I say "go".
```

---

## After launch: keeping the site running

These three prompts go with `docs/AFTERCARE.md`. Read that document first.

## Prompt 10: set up the watchers (before launch)

```
Read CLAUDE.md, docs/PLAN.md, docs/PROGRESS.md and docs/AFTERCARE.md.

Set up section 12 of AFTERCARE.md, items 1 to 6, one at a time, in order:
the staging copy, the nightly self-check, the uptime monitor, error alerts,
the Report a problem button, and the empty incident log.

For each item: show me a plan in ten lines or fewer, say what I need to
create or approve myself (accounts, a dependency, a payment), and wait for
"go". Never send personal data to any outside service. Nothing is installed
or bought until I say so.

Finish each item with three lines on what changed, the test output, and a
screenshot of any new screen in docs/screens/. Then commit and update
docs/PROGRESS.md.
```

## Prompt 11: something is wrong on the live site

Use the five lines from AFTERCARE.md section 5, step 4. If it is Red, roll
back in Vercel first, then run this.

```
Read CLAUDE.md and docs/AFTERCARE.md. Something is wrong on the live site.

Screen: <which page, or the web address>
What I did: <the steps, in order>
What happened: <what I saw; the error email is pasted below>
What I expected: <what should happen>
Who else is affected, and since when: <...>
Severity, as I judge it: <Red / Amber / Yellow>
Rolled back already: <yes / no>

Do this in order and stop at each step until I say "go":
1. Reproduce it on the staging copy and tell me whether it happens there.
2. Find the cause before changing anything and explain it in plain English.
3. Fix it, add a test that would have caught it, and run the full suite.
4. Release to staging and tell me exactly what to click to check it.
5. When I say "release", release to production.
6. Add one line to docs/INCIDENTS.md and update docs/PROGRESS.md.
```

## Prompt 12: the monthly maintenance session

```
Read CLAUDE.md, docs/PROGRESS.md and docs/AFTERCARE.md.

This is the monthly maintenance session. Do these one at a time and stop
before anything that changes a dependency or a setting:
1. List the library updates available, say which are security fixes, and
   apply only those I approve. Run the full suite after.
2. Read docs/INCIDENTS.md and the Report a problem list; fix any Yellows I
   approve.
3. Produce this month's export (database and files) and tell me where it is
   so I can copy it to the ICCI drive.
4. Tell me, in plain English, anything from the watchers or the service
   emails that needs my attention.
Then commit and update docs/PROGRESS.md.
```
