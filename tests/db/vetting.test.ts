// Phase 2, slice P2.3: Garda vetting (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1).
// Owner's choices, 15 Nov 2026:
//   * One row per thing that happened (applied, vetted, not required). Never
//     typed over or deleted: a wrong entry is withdrawn with a reason.
//   * Expiry: vetted date + 3 years by default, changeable for each person.
//   * Status is worked out from today's date every time it is read, so it
//     turns "expired" on the day with nobody touching it.
//   * One admin is enough (no second approval), but nobody can record or
//     withdraw vetting for the person linked to their own account.
//   * Re-vetting applied while still vetted: the real status (valid or due)
//     with the applied date; "applied" only when nothing valid is on file.
//   * "Not required" can be recorded for one person; roles that do not need
//     vetting show "not required" automatically.
//   * Switched-off people get no new entries (withdrawing still works).
//   * Status and dates only: no disclosure, reference number or file.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { addDays, addYears, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
const today = () => todayInDublin();

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

async function listId(table: "person_roles" | "sections", name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function newPerson(role = "Volunteer", extra: Record<string, unknown> = {}) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("people")
    .insert({
      full_name: testName("vetting person"),
      person_role_id: await listId("person_roles", role),
      section_id: await listId("sections", "Volunteers"),
      ...extra,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function personOfAccount(email: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("people").select("id").eq("app_user_id", userIdOf(email)).single();
  if (error) throw new Error(`${email} is not linked to a person (run npm run db:seed): ${error.message}`);
  return data.id;
}

type Rec = {
  id: number;
  person_id: string;
  kind: string;
  happened_on: string;
  expires_on: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string;
};

function record(client: SupabaseClient, person_id: string, fields: Record<string, unknown>) {
  return client.from("vetting_records").insert({ person_id, ...fields }).select().single<Rec>();
}
async function mustRecord(person_id: string, fields: Record<string, unknown>, role = "centre_admin") {
  const { data, error } = await record(await asRole(role), person_id, fields);
  if (error) throw error;
  return data!;
}
/** Vetted `ago` days before today, expiring `left` days from today. */
function vetted(ago: number, left: number) {
  return { kind: "vetted", happened_on: addDays(today(), -ago), expires_on: addDays(today(), left) };
}

type Status = { person_id: string; status: string; vetted_on: string | null; expires_on: string | null; applied_on: string | null; needs_vetting: boolean };

async function statusOf(person_id: string): Promise<Status> {
  const { data, error } = await (await asRole("centre_admin")).from("people_vetting").select("*").eq("person_id", person_id).single<Status>();
  if (error) throw error;
  return data!;
}

// ---------------------------------------------------------------------------
describe("who can read and record vetting", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read vetting records or anyone's vetting status`, async () => {
      const p = await newPerson();
      await mustRecord(p, vetted(10, 1000));
      const c = await who.client();
      expect((await c.from("vetting_records").select("id").limit(5)).data ?? []).toEqual([]);
      expect((await c.from("people_vetting").select("person_id").limit(5)).data ?? []).toEqual([]);
    });

    it(`${who.label} cannot record or withdraw vetting`, async () => {
      const p = await newPerson();
      const r = await mustRecord(p, vetted(10, 1000));
      const c = await who.client();
      expect((await record(c, p, vetted(5, 1000))).error).not.toBeNull();
      await c.from("vetting_records").update({ withdrawn_reason: "Test: should not work" }).eq("id", r.id);
      const { data } = await masterKeyClient().from("vetting_records").select("withdrawn_at").eq("id", r.id).single();
      expect(data).toEqual({ withdrawn_at: null });
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can record vetting for someone else, alone (no second admin)`, async () => {
      const p = await newPerson();
      const r = await mustRecord(p, vetted(10, 1000), role);
      expect(r.created_by).toBe(userIdOf(seedAdmin(role).email));
      expect((await statusOf(p)).status).toBe("valid");
    });
  }
});

describe("nobody can record or withdraw their own vetting", () => {
  it("a Centre Admin linked to a person cannot record vetting for that person", async () => {
    const mine = await personOfAccount(seedAdmin("centre_admin").email);
    const { error } = await record(await asRole("centre_admin"), mine, vetted(1, 1000));
    expect(error?.message).toMatch(/your own/i);
  });

  it("another admin can record it, and the linked admin cannot withdraw it", async () => {
    const mine = await personOfAccount(seedAdmin("centre_admin").email);
    const r = await mustRecord(mine, { kind: "applied", happened_on: today() }, "super_admin");
    const { error } = await (await asRole("centre_admin")).from("vetting_records").update({ withdrawn_reason: "Test: my own" }).eq("id", r.id);
    expect(error?.message).toMatch(/your own/i);
    // Another admin can withdraw it.
    const ok = await (await secondCentreAdmin()).from("vetting_records").update({ withdrawn_reason: "Test: entered by mistake" }).eq("id", r.id).select().single();
    expect(ok.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("what a vetting entry accepts", () => {
  it("only applied, vetted or not required", async () => {
    const p = await newPerson();
    const { error } = await record(await asRole("centre_admin"), p, { kind: "disclosure", happened_on: today() });
    expect(error).not.toBeNull();
  });

  it("needs a date, which cannot be in the future", async () => {
    const p = await newPerson();
    const c = await asRole("centre_admin");
    expect((await record(c, p, { kind: "applied", happened_on: null })).error).not.toBeNull();
    expect((await record(c, p, { kind: "applied", happened_on: addDays(today(), 1) })).error?.message).toMatch(/future/i);
    expect((await record(c, p, { kind: "applied", happened_on: today() })).error).toBeNull();
  });

  it("a 'vetted' entry needs an expiry date after the vetted date, and at most 10 years later", async () => {
    const p = await newPerson();
    const c = await asRole("centre_admin");
    const on = addDays(today(), -30);
    expect((await record(c, p, { kind: "vetted", happened_on: on, expires_on: null })).error?.message).toMatch(/expiry/i);
    expect((await record(c, p, { kind: "vetted", happened_on: on, expires_on: on })).error?.message).toMatch(/after/i);
    expect((await record(c, p, { kind: "vetted", happened_on: on, expires_on: addDays(addYears(on, 10), 1) })).error?.message).toMatch(/10 years/i);
    expect((await record(c, p, { kind: "vetted", happened_on: on, expires_on: addYears(on, 10) })).error).toBeNull();
  });

  it("the expiry is changeable for each person (5 years here instead of the usual 3)", async () => {
    const p = await newPerson();
    const on = addDays(today(), -30);
    const r = await mustRecord(p, { kind: "vetted", happened_on: on, expires_on: addYears(on, 5) });
    expect(r.expires_on).toBe(addYears(on, 5));
  });

  it("'applied' and 'not required' entries have no expiry date", async () => {
    const p = await newPerson();
    const c = await asRole("centre_admin");
    for (const kind of ["applied", "not_required"]) {
      expect((await record(c, p, { kind, happened_on: today(), expires_on: addDays(today(), 100) })).error?.message, kind).toMatch(/expiry/i);
    }
  });

  it("has no place for a disclosure, reference number, file or notes", async () => {
    const p = await newPerson();
    const c = await asRole("super_admin");
    for (const column of ["disclosure", "reference_number", "disclosure_number", "file_path", "document_path", "notes"]) {
      expect((await record(c, p, { kind: "applied", happened_on: today(), [column]: "x" })).error, column).not.toBeNull();
    }
  });

  it("a new entry cannot arrive already withdrawn", async () => {
    const p = await newPerson();
    const { error } = await record(await asRole("centre_admin"), p, { kind: "applied", happened_on: today(), withdrawn_reason: "Test" });
    expect(error).not.toBeNull();
  });

  it("a switched-off person gets no new entries", async () => {
    const p = await newPerson();
    const c = await asRole("centre_admin");
    await c.from("people").update({ active: false }).eq("id", p);
    expect((await record(c, p, { kind: "applied", happened_on: today() })).error?.message).toMatch(/switched off/i);
  });

  it("who and when are filled in by the database and cannot be faked", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, { kind: "applied", happened_on: today(), created_by: userIdOf(seedAdmin("super_admin").email) });
    expect(r.created_by).toBe(userIdOf(seedAdmin("centre_admin").email));
  });
});

// ---------------------------------------------------------------------------
describe("withdrawing a wrong entry", () => {
  it("needs a reason; who and when are filled in by the database; the entry stays", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, vetted(10, 1000));
    const c = await asRole("super_admin");
    expect((await c.from("vetting_records").update({ withdrawn_reason: "   " }).eq("id", r.id)).error?.message).toMatch(/reason/i);
    const { data, error } = await c
      .from("vetting_records")
      .update({ withdrawn_reason: " Test: wrong person ", withdrawn_by: userIdOf(seedAdmin("centre_admin").email) })
      .eq("id", r.id)
      .select()
      .single<Rec>();
    expect(error).toBeNull();
    expect(data).toMatchObject({ withdrawn_reason: "Test: wrong person", withdrawn_by: userIdOf(seedAdmin("super_admin").email) });
    expect(data!.withdrawn_at).not.toBeNull();
  });

  it("the admin who entered it may withdraw it (fixing their own typo)", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, vetted(10, 1000));
    const { error } = await (await asRole("centre_admin")).from("vetting_records").update({ withdrawn_reason: "Test: typo" }).eq("id", r.id);
    expect(error).toBeNull();
  });

  it("a withdrawn entry no longer counts, and the history keeps both entries", async () => {
    const p = await newPerson();
    const wrong = await mustRecord(p, vetted(10, 1000));
    const c = await asRole("centre_admin");
    await c.from("vetting_records").update({ withdrawn_reason: "Test: wrong dates" }).eq("id", wrong.id);
    expect((await statusOf(p)).status).toBe("none");
    await mustRecord(p, vetted(20, 900));
    expect((await statusOf(p)).status).toBe("valid");
    const { data } = await c.from("vetting_records").select("id, withdrawn_at").eq("person_id", p).order("id");
    expect(data).toHaveLength(2);
    expect(data![0].withdrawn_at).not.toBeNull();
    expect(data![1].withdrawn_at).toBeNull();
  });

  it("nothing else can be changed: not the dates, the kind, the person, nor a second withdrawal", async () => {
    const p = await newPerson();
    const other = await newPerson();
    const r = await mustRecord(p, vetted(10, 1000));
    const c = await asRole("super_admin");
    for (const change of [{ expires_on: addDays(today(), 2000) }, { happened_on: addDays(today(), -5) }, { kind: "applied" }, { person_id: other }]) {
      expect((await c.from("vetting_records").update(change).eq("id", r.id)).error, JSON.stringify(change)).not.toBeNull();
    }
    await c.from("vetting_records").update({ withdrawn_reason: "Test: first" }).eq("id", r.id);
    expect((await c.from("vetting_records").update({ withdrawn_reason: "Test: second" }).eq("id", r.id)).error?.message).toMatch(/already withdrawn/i);
    // Not even with the master key.
    expect((await masterKeyClient().from("vetting_records").update({ expires_on: addDays(today(), 3000) }).eq("id", r.id)).error).not.toBeNull();
  });

  it("a switched-off person's entry can still be withdrawn", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, vetted(10, 1000));
    const c = await asRole("centre_admin");
    await c.from("people").update({ active: false }).eq("id", p);
    expect((await c.from("vetting_records").update({ withdrawn_reason: "Test: left" }).eq("id", r.id)).error).toBeNull();
  });

  it("nobody can delete an entry, not even with the master key; every change is in the audit log", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, vetted(10, 1000));
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      expect((await c.from("vetting_records").delete().eq("id", r.id)).error).not.toBeNull();
    }
    await (await asRole("super_admin")).from("vetting_records").update({ withdrawn_reason: "Test: audit" }).eq("id", r.id);
    const { data } = await masterKeyClient().from("audit_log").select("action").eq("table_name", "vetting_records").eq("record_id", String(r.id)).order("id");
    expect((data ?? []).map((x) => x.action)).toEqual(["insert", "update"]);
  });
});

// ---------------------------------------------------------------------------
describe("the vetting status, worked out from today's date", () => {
  it("someone whose role needs vetting, with nothing on record: none", async () => {
    expect(await statusOf(await newPerson())).toMatchObject({ status: "none", needs_vetting: true });
  });

  it("a role that does not need vetting: not required, automatically", async () => {
    expect(await statusOf(await newPerson("Board member"))).toMatchObject({ status: "not_required", needs_vetting: false });
  });

  it("'not required' recorded for one person whose role needs it", async () => {
    const p = await newPerson();
    await mustRecord(p, { kind: "not_required", happened_on: today() });
    expect((await statusOf(p)).status).toBe("not_required");
  });

  it("applied, with nothing valid on file: applied", async () => {
    const p = await newPerson();
    await mustRecord(p, { kind: "applied", happened_on: addDays(today(), -3) });
    expect(await statusOf(p)).toMatchObject({ status: "applied", applied_on: addDays(today(), -3) });
  });

  it("the boundaries: expired yesterday, expires today, in 60 days, in 61 days", async () => {
    const cases: [number, string][] = [
      [-1, "expired"],
      [0, "due"],
      [60, "due"],
      [61, "valid"],
    ];
    for (const [left, expected] of cases) {
      const p = await newPerson();
      await mustRecord(p, vetted(365, left));
      const s = await statusOf(p);
      expect(s.status, `expires in ${left} days`).toBe(expected);
      expect(s.expires_on).toBe(addDays(today(), left));
    }
  });

  it("re-vetting applied while still vetted: keeps the real status and shows the applied date", async () => {
    const p = await newPerson();
    await mustRecord(p, vetted(1000, 30));
    await mustRecord(p, { kind: "applied", happened_on: addDays(today(), -2) });
    expect(await statusOf(p)).toMatchObject({ status: "due", applied_on: addDays(today(), -2) });
  });

  it("re-vetting applied after the old vetting expired: applied", async () => {
    const p = await newPerson();
    await mustRecord(p, vetted(1200, -10));
    await mustRecord(p, { kind: "applied", happened_on: addDays(today(), -2) });
    expect((await statusOf(p)).status).toBe("applied");
  });

  it("an application from before the latest vetting does not count", async () => {
    const p = await newPerson();
    await mustRecord(p, { kind: "applied", happened_on: addDays(today(), -1300) });
    await mustRecord(p, vetted(1200, -10));
    expect(await statusOf(p)).toMatchObject({ status: "expired", applied_on: null });
  });

  it("the newest vetting counts, even if typed in after an older one", async () => {
    const p = await newPerson();
    await mustRecord(p, vetted(100, 1000));
    await mustRecord(p, vetted(1200, -10)); // an older vetting, entered later for the history
    expect((await statusOf(p)).status).toBe("valid");
  });

  it("vetted again after 'not required': the vetting counts", async () => {
    const p = await newPerson();
    await mustRecord(p, { kind: "not_required", happened_on: addDays(today(), -400) });
    await mustRecord(p, vetted(10, 1000));
    expect((await statusOf(p)).status).toBe("valid");
  });

  it("moving someone to a role that does not need vetting changes the status with no new entry", async () => {
    const p = await newPerson();
    expect((await statusOf(p)).status).toBe("none");
    await (await asRole("centre_admin")).from("people").update({ person_role_id: await listId("person_roles", "Contractor") }).eq("id", p);
    expect((await statusOf(p)).status).toBe("not_required");
  });
});

// ---------------------------------------------------------------------------
describe("the home page counter", () => {
  type Counters = { vetting_expired: number; vetting_none: number; vetting_due: number };
  async function counters(): Promise<Counters> {
    const { data, error } = await (await asRole("centre_admin")).rpc("home_counters").single<Counters>();
    if (error) throw error;
    return data!;
  }

  it("matches the vetting list (switched-on people only)", async () => {
    const c = await asRole("centre_admin");
    const got = await counters();
    const count = async (status: string) =>
      (await c.from("people_vetting").select("person_id", { count: "exact", head: true }).eq("active", true).eq("status", status)).count;
    expect(got.vetting_expired).toBe(await count("expired"));
    expect(got.vetting_none).toBe(await count("none"));
    expect(got.vetting_due).toBe(await count("due"));
  });

  it("goes up for an expired, a missing and a due vetting; a switched-off person is left out", async () => {
    const before = await counters();
    await mustRecord(await newPerson(), vetted(1200, -5));
    await newPerson();
    await mustRecord(await newPerson(), vetted(1000, 20));
    const gone = await newPerson();
    await (await asRole("centre_admin")).from("people").update({ active: false }).eq("id", gone);
    const after = await counters();
    expect(after.vetting_expired - before.vetting_expired).toBe(1);
    expect(after.vetting_none - before.vetting_none).toBe(1);
    expect(after.vetting_due - before.vetting_due).toBe(1);
  });
});
