# Phase 6: service registers, build plan

Written 28 November 2026, when the owner asked to start Phase 6. The owner chose every recommended answer in section 5 the same night
(28 Nov 2026: "complete Phase 6 with the recommended answers", while he
sleeps). Built, tested and committed slice by slice; not pushed and not on
ICCI Staging until he has reviewed it. It follows `docs/PLAN.md`
section 5.6 and every rule in `CLAUDE.md`.

What PLAN.md asks for: three registers, each visible to the Super Admin only.

- **Funeral register:** family contact, date, services provided (ghusl,
  kafan, janazah prayer, family room), who was on duty.
- **Shahada register:** name, date, authenticating imam, certificate number.
- **Nikah register:** names of the couple, date, officiant, witnesses,
  certificate number.
- Never: cause of death, medical details, immigration details or identity
  documents. Certificates are printed later, and only when asked.

## 1. What my review found

1. **These are the most sensitive records in the app.** A Shahada entry
   says a person became Muslim. A Nikah entry says who married whom. Both
   reveal religion, which Irish and EU data law (GDPR) treats as a "special
   category". A religious body may keep such records about its own
   community, but only for that purpose and not shared outside. **I am not
   certain** what ICCI's privacy notice says or how long ICCI must keep
   these entries. ICCI's data protection person should confirm this before
   the first real entry (question 10). Building on made-up data is safe.
2. **The funeral register does not name the person who died.** PLAN.md
   lists "family contact" but not the deceased. A register without that
   name cannot be searched later (question 1).
3. **Children.** PLAN.md section 2 says nothing about children. A Nikah or
   Shahada for someone under 18 should not be in the app, but funerals of
   children do happen at the Centre (question 2).
4. **Free-text notes are a risk.** A notes box invites "died of cancer" or
   "came from Syria on a visa": exactly what PLAN.md forbids. I recommend
   no notes box at all (question 3).
5. **Who was on duty and who officiated are already in the app.** Imams
   and staff are in People, and the rota has "Funeral on call" every day.
   Picking them from People, rather than typing, keeps names consistent
   (question 4).
6. **Certificate numbers must never repeat or be reused**, even when an
   entry is cancelled. Who sets the number is not in PLAN.md (question 5).
7. **Is a Nikah also a legal marriage?** In Ireland a religious marriage
   is legally valid only through the civil registration process. The
   register could note "also registered as a civil marriage: yes or no"
   with no form numbers (question 6). **I am not certain** of the details;
   ICCI's imams will know how they handle this today.
8. **Mistakes.** No hard deletes, so a wrong entry is corrected with a new
   linked version (the old one stays in History), or cancelled with a
   reason ("entered twice"). Nothing needs approving, because the Super
   Admin is the only person who can see the registers (question 7).
9. **Where the registers do not appear:** the Home page, the search box,
   reminders and any CSV export. Fewer places means fewer leaks
   (question 8).
10. **Backups and the monthly export** (docs/AFTERCARE.md) will hold these
    entries too, so whoever stores them must treat them as sensitive.

## 2. What each register holds (recommended)

**Funeral:** name of the person who died; date of the janazah; family
contact (one name, one phone number); services ticked: ghusl, kafan,
janazah prayer, family room; who was on duty (one or more people from
People, suggested from that day's "Funeral on call" on the rota). No age,
date of birth, cause of death, address or burial details.

**Shahada:** the person's name as they wish it written; date; the
authenticating imam (from People); two witnesses (typed names, question 9);
certificate number; a tick "aged 18 or over". No former name, contact
details, nationality or country.

**Nikah:** names of the two spouses; date; the officiant (from People);
two witnesses (typed names); the wali, if any (typed name, question 9);
"also registered as a civil marriage: yes, no, not known"; certificate
number; a tick "both aged 18 or over". No mahr amount, addresses or
identity details.

Every entry also has who recorded it and when, a full History, "Correct
this entry" and "Cancel this entry (with a reason)".

## 3. Slices, one per session

| Slice | What | Notes |
| --- | --- | --- |
| P6.1 | Database for all three registers | Super Admin only; tests first: every other role and a signed-out visitor are refused; certificate numbers never repeat; corrections and cancel; audit log. Migration 0060. |
| P6.2 | Funeral register screens | List by month, record, entry page, correct, cancel. On-duty people suggested from the rota. |
| P6.3 | Shahada register screens | Same pattern. |
| P6.4 | Nikah register screens | Same pattern. |
| P6.5 | Finishing | "Registers" in the Super Admin's menu, made-up seed (local and ICCI Staging), a fresh-eyes privacy and security check, screenshots, user guide page. |

Migrations go to ICCI Staging before main is pushed, as always.

## 4. Made-up data

Seed entries use obviously invented names (as elsewhere), Dublin 01 000
phone numbers, and certificate numbers starting "TEST". The demo gets about
ten entries per register.

## 5. Questions for the owner

Each has a recommendation. "All recommended" is a fine answer.

1. **Name of the person who died in the funeral register?**
   A: yes, name only *(recommended)*. B: no, family contact only, as written.
2. **Children.** A: Nikah and Shahada for 18 or over only (a tick that must
   be ticked); funerals of children may be recorded, with no age stored
   *(recommended)*. B: adults only in all three; children's funerals stay
   on paper.
3. **Notes box?** A: none *(recommended)*. B: a short note with a warning
   not to write medical or immigration details.
4. **Imams and on-duty people.** A: picked from People, with the rota's
   funeral on call suggested *(recommended)*. B: typed names.
5. **Certificate numbers.** A: the app gives the next number, for example
   SH-2026-0001 and NK-2026-0001, and the imam writes it on the paper
   certificate *(recommended)*. B: typed from the existing paper
   certificate book (the app refuses a number used before). C: both (app
   number, plus an optional "old paper number" for past certificates).
6. **Civil marriage tick on Nikah entries?** A: yes, "yes, no or not known",
   no form numbers *(recommended)*. B: leave it out.
7. **Mistakes.** A: correct (new version, old one kept in History) or
   cancel with a reason; no approval step *(recommended)*. B: a second
   Super Admin must confirm every entry.
8. **Keep the registers off Home, search, reminders and exports?**
   A: yes *(recommended)*. B: a Home counter "entries this month" for the
   Super Admin.
9. **Witnesses and wali.** A: two typed witness names for Shahada and
   Nikah, and an optional wali name for Nikah *(recommended)*. B: only what
   PLAN.md lists (witnesses on Nikah only, no wali).
10. **Privacy check.** A: build now on made-up data; ICCI's data protection
    person confirms the privacy notice and how long entries are kept before
    any real entry *(recommended)*. B: wait for that answer before building.
