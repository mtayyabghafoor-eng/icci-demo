// Phase 2, slice P2.9: email reminders for the renewals register (PLAN.md 5.2).
// Owner's choices, 17 Nov 2026 (all recommended):
//   * Reminders at 60, 30 and 7 days before the due date, none after it.
//     Each renewal gets each reminder once per due date; a missed day is
//     caught up with the latest stage only.
//   * One summary a day to switched-on Super Admins and Centre Admins only.
//   * No people's names in emails ("Garda vetting for 1 person").
//   * The daily timer cannot sign in: one narrow exception lets it call
//     run_reminders and record_reminder_deliveries, which do nothing
//     without its secret key. Everything else stays closed.
//   * Reminder records are never changed or deleted.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { storeReminderKey } from "../../scripts/reminder-key.mts";
import { requireEnv } from "@/lib/env";
import { reminderStage } from "@/lib/reminders/rules";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";

const today = () => todayInDublin();
const TABLES = ["reminder_runs", "reminders_sent", "reminder_deliveries", "reminder_retries"] as const;

/** The timer's key from .env.local; its fingerprint is (re)stored so the database matches. */
async function timerKey(): Promise<string> {
  const key = requireEnv("CRON_SECRET");
  await storeReminderKey(masterKeyClient(), key);
  return key;
}

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("super_admin").email) },
];

async function newRenewal(dueIn: number, label = "reminder renewal"): Promise<{ id: string; title: string }> {
  const title = testName(label);
  const { data, error } = await (await asRole("centre_admin")).rpc("add_renewal", {
    p_title: title,
    p_category: "Insurance",
    p_owner_person_id: null,
    p_documents_needed: null,
    p_notes: null,
    p_due_on: addDays(today(), dueIn),
  });
  if (error) throw error;
  return { id: data as string, title };
}

type Item = { source: string; record_id: string; title: string; category: string; due_on: string; stage: number; days_left: number };
type Run = { run_id: number; run_on: string; trigger: string; items: Item[]; recipients: { id: string; name: string; email: string; retry: Item[] }[] };

async function run(client: SupabaseClient, key?: string): Promise<Run> {
  const { data, error } = await client.rpc("run_reminders", key ? { p_key: key } : {});
  if (error) throw error;
  return data as Run;
}

// ---------------------------------------------------------------------------
describe("which reminder is due", () => {
  it("7 from 0 to 7 days left, 30 from 8 to 30, 60 from 31 to 60; none after the due date or before 60", async () => {
    const c = await asRole("centre_admin");
    for (const days of [-1, 0, 1, 7, 8, 29, 30, 31, 59, 60, 61, 400]) {
      const { data, error } = await c.rpc("reminder_stage", { p_days_left: days });
      expect(error).toBeNull();
      expect(data, `days ${days}`).toBe(reminderStage(days));
    }
    expect(reminderStage(20)).toBe(30); // a missed day: only the latest stage
    expect(reminderStage(-1)).toBeNull();
  });
});

describe("who can see and run the reminders", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read reminder records or run the reminders without the key`, async () => {
      const c = await who.client();
      for (const t of TABLES) {
        const { data } = await c.from(t).select("*").limit(5);
        expect(data ?? [], t).toHaveLength(0);
      }
      expect((await c.rpc("run_reminders", {})).error).not.toBeNull();
      expect((await c.rpc("record_reminder_deliveries", { p_run_id: 1, p_outcomes: [] })).error).not.toBeNull();
    });
  }

  it("a Centre Admin can read the records but cannot run the reminders", async () => {
    const c = await asRole("centre_admin");
    for (const t of TABLES) expect((await c.from(t).select("*").limit(1)).error, t).toBeNull();
    expect((await c.rpc("run_reminders", {})).error?.message).toMatch(/Only a Super Admin/);
  });

  it("a wrong, short or empty key is refused, signed in or not", async () => {
    await timerKey();
    for (const c of [signedOutClient(), await asRole("super_admin")]) {
      for (const k of ["0".repeat(64), "short", ""]) {
        const { error } = await c.rpc("run_reminders", { p_key: k });
        expect(error, k).not.toBeNull();
      }
    }
  });

  it("nobody, not even a Super Admin, adds, changes or deletes reminder records directly", async () => {
    const c = await asRole("super_admin");
    const r = await run(c);
    expect((await c.from("reminder_runs").insert({ run_on: today(), trigger: "button" }).select()).data ?? []).toHaveLength(0);
    expect((await c.from("reminder_runs").update({ trigger: "timer" }).eq("id", r.run_id).select()).data ?? []).toHaveLength(0);
    expect((await c.from("reminder_runs").delete().eq("id", r.run_id)).error).not.toBeNull();
    const m = masterKeyClient();
    expect((await m.from("reminder_runs").update({ trigger: "timer" }).eq("id", r.run_id)).error?.message).toMatch(/never changed/);
    expect((await m.from("reminder_runs").delete().eq("id", r.run_id)).error?.message).toMatch(/cannot be deleted/);
  });

  it("only the master key (this PC) can set the timer's key", async () => {
    const hash = "a".repeat(64);
    expect((await signedOutClient().rpc("set_reminder_timer_key", { p_key_hash: hash })).error).not.toBeNull();
    expect((await (await asRole("super_admin")).rpc("set_reminder_timer_key", { p_key_hash: hash })).error).not.toBeNull();
    expect((await masterKeyClient().rpc("set_reminder_timer_key", { p_key_hash: "not a fingerprint" })).error).not.toBeNull();
    await timerKey(); // put the real one back
  });
});

describe("running the reminders", () => {
  it("picks up each renewal at its stage, once; overdue and far-off ones get nothing", async () => {
    const r5 = await newRenewal(5);
    const r20 = await newRenewal(20);
    const r45 = await newRenewal(45);
    const r61 = await newRenewal(61);
    const late = await newRenewal(-1);
    const c = await asRole("super_admin");

    const first = await run(c);
    expect(first).toMatchObject({ run_on: today(), trigger: "button" });
    const mine = (r: Run, id: string) => r.items.filter((i) => i.record_id === id);
    expect(mine(first, r5.id)).toEqual([expect.objectContaining({ stage: 7, days_left: 5, title: r5.title, source: "manual", category: "Insurance" })]);
    expect(mine(first, r20.id)).toEqual([expect.objectContaining({ stage: 30, days_left: 20 })]);
    expect(mine(first, r45.id)).toEqual([expect.objectContaining({ stage: 60, days_left: 45 })]);
    expect(mine(first, r61.id)).toEqual([]);
    expect(mine(first, late.id)).toEqual([]);

    // The same day again: nothing new for these.
    const second = await run(c);
    for (const r of [r5, r20, r45]) expect(mine(second, r.id)).toEqual([]);

    // Remembered, with the run it came from.
    const { data: sent } = await c.from("reminders_sent").select("run_id, record_id, stage, due_on").eq("record_id", r20.id);
    expect(sent).toEqual([{ run_id: first.run_id, record_id: r20.id, stage: 30, due_on: addDays(today(), 20) }]);
  });

  it("a new due date gets its own reminders", async () => {
    const r = await newRenewal(40);
    const c = await asRole("super_admin");
    expect((await run(c)).items.filter((i) => i.record_id === r.id).map((i) => i.stage)).toEqual([60]);
    // Renewed today, next due in 50 days: the 60-day reminder comes again, for the new date.
    const ins = await (await asRole("centre_admin")).from("renewal_dates").insert({ renewal_id: r.id, renewed_on: today(), due_on: addDays(today(), 50) });
    expect(ins.error).toBeNull();
    expect((await run(c)).items.filter((i) => i.record_id === r.id)).toEqual([expect.objectContaining({ stage: 60, due_on: addDays(today(), 50) })]);
  });

  it("a switched-off renewal is not reminded", async () => {
    const r = await newRenewal(3);
    await (await asRole("centre_admin")).from("renewals").update({ active: false }).eq("id", r.id);
    expect((await run(await asRole("super_admin"))).items.filter((i) => i.record_id === r.id)).toEqual([]);
  });

  it("never puts a person's name in a reminder", async () => {
    const m = masterKeyClient();
    const roleId = (await m.from("person_roles").select("id").eq("name", "Volunteer").single()).data!.id;
    const sectionId = (await m.from("sections").select("id").eq("name", "Volunteers").single()).data!.id;
    const name = testName("vetting reminder person");
    const { data: person, error } = await m.from("people").insert({ full_name: name, person_role_id: roleId, section_id: sectionId }).select("id").single();
    if (error) throw error;
    const v = await (await asRole("centre_admin"))
      .from("vetting_records")
      .insert({ person_id: person.id, kind: "vetted", happened_on: addDays(today(), -1000), expires_on: addDays(today(), 25) });
    expect(v.error).toBeNull();
    const r = await run(await asRole("super_admin"));
    const item = r.items.find((i) => i.record_id === person.id);
    expect(item).toMatchObject({ source: "vetting", title: "Garda vetting for 1 person", stage: 30 });
    expect(JSON.stringify(r)).not.toContain(name);
    const { data: kept } = await m.from("reminders_sent").select("email_title").eq("record_id", person.id);
    expect(kept).toEqual([{ email_title: "Garda vetting for 1 person" }]);
  });

  it("goes to switched-on Super Admins and Centre Admins only", async () => {
    await newRenewal(4);
    const r = await run(await asRole("super_admin"));
    const emails = r.recipients.map((p) => p.email);
    for (const role of ["super_admin", "centre_admin"]) expect(emails).toContain(seedAdmin(role).email);
    expect(emails).toContain(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
    for (const e of [seedAdmin("finance").email, seedAdmin("library_operator").email, seedAdmin("centre_admin", false).email]) expect(emails).not.toContain(e);
  });

  it("a quiet run has nobody to email", async () => {
    const c = await asRole("super_admin");
    await run(c); // takes whatever is due now
    const again = await run(c);
    expect(again.items).toEqual([]);
    expect(again.recipients).toEqual([]);
  });

  it("the timer, signed out, runs them with its key", async () => {
    const key = await timerKey();
    const r = await newRenewal(2);
    const out = await run(signedOutClient(), key);
    expect(out.trigger).toBe("timer");
    expect(out.items.filter((i) => i.record_id === r.id)).toHaveLength(1);
    const { data } = await (await asRole("centre_admin")).from("reminder_runs").select("trigger, created_by").eq("id", out.run_id).single();
    expect(data).toEqual({ trigger: "timer", created_by: null });
  });
});

describe("writing down what happened to each email", () => {
  async function runWithItems(c: SupabaseClient, key?: string) {
    await newRenewal(1);
    const r = await run(c, key);
    expect(r.items.length).toBeGreaterThan(0);
    return r;
  }
  const outcomesFor = (r: Run) => r.recipients.map((p) => ({ recipient_id: p.id, outcome: "recorded only", detail: "Development: made-up data, so no email was sent." }));

  it("once per run, for the admins who were due an email", async () => {
    const c = await asRole("super_admin");
    const r = await runWithItems(c);
    const { data, error } = await c.rpc("record_reminder_deliveries", { p_run_id: r.run_id, p_outcomes: outcomesFor(r) });
    expect(error).toBeNull();
    expect(data).toBe(r.recipients.length);
    expect((await c.rpc("record_reminder_deliveries", { p_run_id: r.run_id, p_outcomes: outcomesFor(r) })).error?.message).toMatch(/already recorded/);
    const { data: rows } = await (await asRole("centre_admin")).from("reminder_deliveries").select("recipient_id, outcome").eq("run_id", r.run_id);
    expect(rows).toHaveLength(r.recipients.length);
  });

  it("refuses Finance as a recipient, a made-up outcome, and a run with nothing to send", async () => {
    const c = await asRole("super_admin");
    const r = await runWithItems(c);
    const finance = userIdOf(seedAdmin("finance").email);
    expect((await c.rpc("record_reminder_deliveries", { p_run_id: r.run_id, p_outcomes: [{ recipient_id: finance, outcome: "sent", detail: null }] })).error?.message).toMatch(
      /only to switched-on Super Admins and Centre Admins/,
    );
    expect((await c.rpc("record_reminder_deliveries", { p_run_id: r.run_id, p_outcomes: [{ ...outcomesFor(r)[0], outcome: "maybe" }] })).error).not.toBeNull();
    const quiet = await run(c);
    expect((await c.rpc("record_reminder_deliveries", { p_run_id: quiet.run_id, p_outcomes: outcomesFor(r) })).error?.message).toMatch(/nothing to send/);
  });

  it("the timer records only its own runs, and a Super Admin only theirs", async () => {
    const key = await timerKey();
    const byButton = await runWithItems(await asRole("super_admin"));
    expect((await signedOutClient().rpc("record_reminder_deliveries", { p_run_id: byButton.run_id, p_outcomes: outcomesFor(byButton), p_key: key })).error?.message).toMatch(
      /Not allowed/,
    );
    const byTimer = await runWithItems(signedOutClient(), key);
    expect((await (await asRole("super_admin")).rpc("record_reminder_deliveries", { p_run_id: byTimer.run_id, p_outcomes: outcomesFor(byTimer) })).error?.message).toMatch(
      /Not allowed/,
    );
    const ok = await signedOutClient().rpc("record_reminder_deliveries", { p_run_id: byTimer.run_id, p_outcomes: outcomesFor(byTimer), p_key: key });
    expect(ok.error).toBeNull();
  });
});

// Round C4 (migration 0055): a failed email is tried again on the next run.
describe("an email that failed to send", () => {
  const record = (c: SupabaseClient, r: Run, outcome: (id: string) => string) =>
    c.rpc("record_reminder_deliveries", {
      p_run_id: r.run_id,
      p_outcomes: r.recipients.map((p) => ({ recipient_id: p.id, outcome: outcome(p.id), detail: outcome(p.id) === "failed" ? "Test: the email service could not be reached." : "Test: recorded only." })),
    });

  it("is sent again to that admin only, once, until an email to them works", async () => {
    const c = await asRole("super_admin");
    const me = userIdOf(seedAdmin("super_admin").email);
    const other = userIdOf(seedAdmin("centre_admin").email);
    await run(c); // take anything already due, so only this test's renewals are new
    const missed = await newRenewal(3, "retried renewal");
    const gone = await newRenewal(4, "switched off before the retry");

    const first = await run(c);
    expect(first.items.map((i) => i.record_id)).toEqual(expect.arrayContaining([missed.id, gone.id]));
    expect((await record(c, first, (id) => (id === me ? "failed" : "recorded only"))).error).toBeNull();
    // One of the two is switched off before the next run: no point sending it.
    await (await asRole("centre_admin")).from("renewals").update({ active: false }).eq("id", gone.id);

    const second = await run(c);
    expect(second.items).toEqual([]);
    expect(second.recipients.map((p) => p.id)).toEqual([me]);
    expect(second.recipients[0].retry.map((i) => i.record_id)).toEqual([missed.id]);
    expect(second.recipients[0].retry[0]).toMatchObject({ title: missed.title, stage: 7, days_left: 3 });
    // Written down, and readable by a Centre Admin.
    const { data: rows } = await (await asRole("centre_admin")).from("reminder_retries").select("recipient_id").eq("run_id", second.run_id);
    expect(rows).toEqual([{ recipient_id: me }]);
    // A run with only a retry has nothing for the other admins.
    const wrong = await c.rpc("record_reminder_deliveries", { p_run_id: second.run_id, p_outcomes: [{ recipient_id: other, outcome: "sent", detail: null }] });
    expect(wrong.error?.message).toMatch(/nothing to send to that admin/);
    // It fails again: still owed. Then it works: no longer owed.
    expect((await record(c, second, () => "failed")).error).toBeNull();
    const third = await run(c);
    expect(third.recipients.find((p) => p.id === me)?.retry.map((i) => i.record_id)).toEqual([missed.id]);
    expect((await record(c, third, () => "recorded only")).error).toBeNull();
    const fourth = await run(c);
    expect(fourth.recipients).toEqual([]);
  });

  it("nobody adds, changes or deletes retry records directly", async () => {
    const c = await asRole("super_admin");
    const me = userIdOf(seedAdmin("super_admin").email);
    const r = await run(c);
    expect((await c.from("reminder_retries").insert({ run_id: r.run_id, recipient_id: me, sent_id: 1 }).select()).data ?? []).toHaveLength(0);
    // The test above made at least one (so this never passes by finding none).
    const { data: rows } = await masterKeyClient().from("reminder_retries").select("id").limit(1);
    expect(rows).toHaveLength(1);
    expect((await masterKeyClient().from("reminder_retries").update({ sent_id: 1 }).eq("id", rows![0].id)).error?.message).toMatch(/never changed/);
    expect((await masterKeyClient().from("reminder_retries").delete().eq("id", rows![0].id)).error?.message).toMatch(/cannot be deleted/);
  });
});

describe("the audit log", () => {
  it("records each run and each reminder", async () => {
    const r = await newRenewal(6);
    const out = await run(await asRole("super_admin"));
    const m = masterKeyClient();
    const { data: runs } = await m.from("audit_log").select("action, changed_by").eq("table_name", "reminder_runs").eq("record_id", String(out.run_id));
    expect(runs).toEqual([{ action: "insert", changed_by: userIdOf(seedAdmin("super_admin").email) }]);
    const { data: sent } = await m.from("reminders_sent").select("id").eq("record_id", r.id).single();
    const { data: log } = await m.from("audit_log").select("action").eq("table_name", "reminders_sent").eq("record_id", String(sent!.id));
    expect(log).toEqual([{ action: "insert" }]);
  });
});
