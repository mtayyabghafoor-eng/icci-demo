// Phase 2, slice P2.4: training dates (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1).
// Owner's choices, 16 Nov 2026 (all recommended):
//   * One row per course completed: person, type, date done, optional expiry.
//     Never typed over or deleted: a wrong entry is withdrawn with a reason.
//   * Each training type may have a usual length in years that fills in the
//     expiry on the screen; the admin can change it or leave it empty.
//   * Status from today's date in Dublin: Valid, Due soon (60 days or fewer),
//     Expired, or No expiry. The newest entry for each type counts.
//   * Only recorded training is shown; no "required training" rules yet and
//     no home counter.
//   * Nobody records or withdraws their own training. Switched-off people
//     and switched-off types get no new entries. No certificates stored.
//   * Super Admin and Centre Admin only.
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

async function listId(table: "person_roles" | "sections" | "training_types", name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function newPerson() {
  const { data, error } = await (await asRole("centre_admin"))
    .from("people")
    .insert({
      full_name: testName("training person"),
      person_role_id: await listId("person_roles", "Volunteer"),
      section_id: await listId("sections", "Volunteers"),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function newType(usual_years: number | null = 2) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("training_types")
    .insert({ name: testName("training type"), usual_years })
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
  training_type_id: string;
  completed_on: string;
  expires_on: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string;
};

function record(client: SupabaseClient, person_id: string, training_type_id: string, fields: Record<string, unknown>) {
  return client.from("training_records").insert({ person_id, training_type_id, ...fields }).select().single<Rec>();
}
async function mustRecord(person_id: string, training_type_id: string, fields: Record<string, unknown>, role = "centre_admin") {
  const { data, error } = await record(await asRole(role), person_id, training_type_id, fields);
  if (error) throw error;
  return data!;
}
/** Done `ago` days before today, expiring `left` days from today (null: no expiry). */
function done(ago: number, left: number | null) {
  return { completed_on: addDays(today(), -ago), expires_on: left === null ? null : addDays(today(), left) };
}

type Status = { person_id: string; training_type_id: string; status: string; completed_on: string; expires_on: string | null };

async function statusesOf(person_id: string): Promise<Status[]> {
  const { data, error } = await (await asRole("centre_admin")).from("people_training").select("*").eq("person_id", person_id);
  if (error) throw error;
  return (data ?? []) as Status[];
}
async function statusOf(person_id: string, type: string): Promise<Status | undefined> {
  return (await statusesOf(person_id)).find((s) => s.training_type_id === type);
}

// ---------------------------------------------------------------------------
describe("the starting list of training types", () => {
  it("has Fire safety, First aid, Safeguarding awareness and Manual handling, each with a usual length", async () => {
    const { data } = await (await asRole("centre_admin"))
      .from("training_types")
      .select("name, usual_years, active")
      .in("name", ["Fire safety", "First aid", "Safeguarding awareness", "Manual handling"]);
    expect((data ?? []).map((t) => t.name).sort()).toEqual(["Fire safety", "First aid", "Manual handling", "Safeguarding awareness"]);
    for (const t of data ?? []) expect(t.usual_years, t.name).toBeGreaterThan(0);
  });
});

describe("who can see and change training types", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add or change training types`, async () => {
      const t = await newType();
      const c = await who.client();
      expect((await c.from("training_types").select("id").limit(5)).data ?? []).toEqual([]);
      expect((await c.from("training_types").insert({ name: testName("not allowed"), usual_years: 1 }).select()).error).not.toBeNull();
      await c.from("training_types").update({ name: "Test run changed" }).eq("id", t);
      const { data } = await masterKeyClient().from("training_types").select("name").eq("id", t).single();
      expect(data!.name).not.toBe("Test run changed");
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add, rename, change the usual length, and switch a type off and on`, async () => {
      const c = await asRole(role);
      const { data, error } = await c.from("training_types").insert({ name: testName("course"), usual_years: 3 }).select("id").single();
      expect(error).toBeNull();
      const id = data!.id;
      expect((await c.from("training_types").update({ name: testName("renamed"), usual_years: null }).eq("id", id)).error).toBeNull();
      expect((await c.from("training_types").update({ active: false }).eq("id", id)).error).toBeNull();
      expect((await c.from("training_types").update({ active: true }).eq("id", id)).error).toBeNull();
    });
  }

  it("the usual length is 1 to 10 whole years, or empty", async () => {
    const c = await asRole("centre_admin");
    for (const bad of [0, 11, -1]) {
      expect((await c.from("training_types").insert({ name: testName("bad"), usual_years: bad })).error, String(bad)).not.toBeNull();
    }
    expect((await c.from("training_types").insert({ name: testName("none"), usual_years: null })).error).toBeNull();
  });

  it("two types cannot share a name (capitals and spaces ignored)", async () => {
    const c = await asRole("centre_admin");
    const name = testName("same");
    expect((await c.from("training_types").insert({ name, usual_years: 1 })).error).toBeNull();
    expect((await c.from("training_types").insert({ name: ` ${name.toUpperCase()} `, usual_years: 1 })).error).not.toBeNull();
  });

  it("nobody can delete a type, not even with the master key", async () => {
    const t = await newType();
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      expect((await c.from("training_types").delete().eq("id", t)).error).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe("who can read and record training", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read training records or anyone's training status`, async () => {
      const p = await newPerson();
      await mustRecord(p, await newType(), done(10, 500));
      const c = await who.client();
      expect((await c.from("training_records").select("id").limit(5)).data ?? []).toEqual([]);
      expect((await c.from("people_training").select("person_id").limit(5)).data ?? []).toEqual([]);
    });

    it(`${who.label} cannot record or withdraw training`, async () => {
      const p = await newPerson();
      const t = await newType();
      const r = await mustRecord(p, t, done(10, 500));
      const c = await who.client();
      expect((await record(c, p, t, done(5, 500))).error).not.toBeNull();
      await c.from("training_records").update({ withdrawn_reason: "Test: should not work" }).eq("id", r.id);
      const { data } = await masterKeyClient().from("training_records").select("withdrawn_at").eq("id", r.id).single();
      expect(data).toEqual({ withdrawn_at: null });
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can record training for someone else, alone (no second admin)`, async () => {
      const p = await newPerson();
      const t = await newType();
      const r = await mustRecord(p, t, done(10, 500), role);
      expect(r.created_by).toBe(userIdOf(seedAdmin(role).email));
      expect((await statusOf(p, t))?.status).toBe("valid");
    });
  }
});

describe("nobody can record or withdraw their own training", () => {
  it("a Centre Admin linked to a person cannot record training for that person", async () => {
    const mine = await personOfAccount(seedAdmin("centre_admin").email);
    const { error } = await record(await asRole("centre_admin"), mine, await newType(), done(1, 500));
    expect(error?.message).toMatch(/your own/i);
  });

  it("another admin can record it, and the linked admin cannot withdraw it", async () => {
    const mine = await personOfAccount(seedAdmin("centre_admin").email);
    const r = await mustRecord(mine, await newType(), done(1, 500), "super_admin");
    const { error } = await (await asRole("centre_admin")).from("training_records").update({ withdrawn_reason: "Test: my own" }).eq("id", r.id);
    expect(error?.message).toMatch(/your own/i);
    const ok = await (await secondCentreAdmin()).from("training_records").update({ withdrawn_reason: "Test: entered by mistake" }).eq("id", r.id).select().single();
    expect(ok.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("what a training entry accepts", () => {
  it("needs a date done, which cannot be in the future", async () => {
    const p = await newPerson();
    const t = await newType();
    const c = await asRole("centre_admin");
    expect((await record(c, p, t, { completed_on: null })).error).not.toBeNull();
    expect((await record(c, p, t, { completed_on: addDays(today(), 1) })).error?.message).toMatch(/future/i);
    expect((await record(c, p, t, { completed_on: today() })).error).toBeNull();
  });

  it("needs a training type from the list", async () => {
    const p = await newPerson();
    const c = await asRole("centre_admin");
    expect((await c.from("training_records").insert({ person_id: p, completed_on: today() })).error).not.toBeNull();
    expect((await record(c, p, "00000000-0000-4000-8000-000000000000", { completed_on: today() })).error).not.toBeNull();
  });

  it("the expiry is optional; if given, it is after the date done and at most 10 years later", async () => {
    const p = await newPerson();
    const t = await newType();
    const c = await asRole("centre_admin");
    const on = addDays(today(), -30);
    expect((await record(c, p, t, { completed_on: on, expires_on: on })).error?.message).toMatch(/after/i);
    expect((await record(c, p, t, { completed_on: on, expires_on: addDays(addYears(on, 10), 1) })).error?.message).toMatch(/10 years/i);
    expect((await record(c, p, t, { completed_on: on, expires_on: addYears(on, 10) })).error).toBeNull();
    expect((await record(c, p, t, { completed_on: on, expires_on: null })).error).toBeNull();
  });

  it("the expiry can differ from the type's usual length", async () => {
    const p = await newPerson();
    const t = await newType(1);
    const on = addDays(today(), -30);
    const r = await mustRecord(p, t, { completed_on: on, expires_on: addYears(on, 4) });
    expect(r.expires_on).toBe(addYears(on, 4));
  });

  it("has no place for a certificate, file or notes", async () => {
    const p = await newPerson();
    const t = await newType();
    const c = await asRole("super_admin");
    for (const column of ["certificate", "certificate_number", "file_path", "document_path", "notes", "provider"]) {
      expect((await record(c, p, t, { completed_on: today(), [column]: "x" })).error, column).not.toBeNull();
    }
  });

  it("a new entry cannot arrive already withdrawn", async () => {
    const p = await newPerson();
    const { error } = await record(await asRole("centre_admin"), p, await newType(), { completed_on: today(), withdrawn_reason: "Test" });
    expect(error).not.toBeNull();
  });

  it("a switched-off person gets no new entries", async () => {
    const p = await newPerson();
    const c = await asRole("centre_admin");
    await c.from("people").update({ active: false }).eq("id", p);
    expect((await record(c, p, await newType(), { completed_on: today() })).error?.message).toMatch(/switched off/i);
  });

  it("a switched-off training type gets no new entries, but old ones stay", async () => {
    const p = await newPerson();
    const t = await newType();
    await mustRecord(p, t, done(100, 500));
    const c = await asRole("centre_admin");
    await c.from("training_types").update({ active: false }).eq("id", t);
    expect((await record(c, p, t, { completed_on: today() })).error?.message).toMatch(/switched off/i);
    expect((await statusOf(p, t))?.status).toBe("valid");
  });

  it("who and when are filled in by the database and cannot be faked", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, await newType(), { completed_on: today(), created_by: userIdOf(seedAdmin("super_admin").email) });
    expect(r.created_by).toBe(userIdOf(seedAdmin("centre_admin").email));
  });
});

// ---------------------------------------------------------------------------
describe("withdrawing a wrong entry", () => {
  it("needs a reason; who and when are filled in by the database; the entry stays", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, await newType(), done(10, 500));
    const c = await asRole("super_admin");
    expect((await c.from("training_records").update({ withdrawn_reason: "   " }).eq("id", r.id)).error?.message).toMatch(/reason/i);
    const { data, error } = await c
      .from("training_records")
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
    const r = await mustRecord(p, await newType(), done(10, 500));
    const { error } = await (await asRole("centre_admin")).from("training_records").update({ withdrawn_reason: "Test: typo" }).eq("id", r.id);
    expect(error).toBeNull();
  });

  it("a withdrawn entry no longer counts, and the history keeps both entries", async () => {
    const p = await newPerson();
    const t = await newType();
    const wrong = await mustRecord(p, t, done(10, 500));
    const c = await asRole("centre_admin");
    await c.from("training_records").update({ withdrawn_reason: "Test: wrong dates" }).eq("id", wrong.id);
    expect(await statusOf(p, t)).toBeUndefined();
    await mustRecord(p, t, done(20, -3));
    expect((await statusOf(p, t))?.status).toBe("expired");
    const { data } = await c.from("training_records").select("id, withdrawn_at").eq("person_id", p).order("id");
    expect(data).toHaveLength(2);
    expect(data![0].withdrawn_at).not.toBeNull();
    expect(data![1].withdrawn_at).toBeNull();
  });

  it("nothing else can be changed: not the dates, the type, the person, nor a second withdrawal", async () => {
    const p = await newPerson();
    const other = await newPerson();
    const t = await newType();
    const r = await mustRecord(p, t, done(10, 500));
    const c = await asRole("super_admin");
    for (const change of [{ expires_on: addDays(today(), 2000) }, { completed_on: addDays(today(), -5) }, { training_type_id: await newType() }, { person_id: other }]) {
      expect((await c.from("training_records").update(change).eq("id", r.id)).error, JSON.stringify(change)).not.toBeNull();
    }
    await c.from("training_records").update({ withdrawn_reason: "Test: first" }).eq("id", r.id);
    expect((await c.from("training_records").update({ withdrawn_reason: "Test: second" }).eq("id", r.id)).error?.message).toMatch(/already withdrawn/i);
    expect((await masterKeyClient().from("training_records").update({ expires_on: addDays(today(), 3000) }).eq("id", r.id)).error).not.toBeNull();
  });

  it("a switched-off person's entry can still be withdrawn", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, await newType(), done(10, 500));
    const c = await asRole("centre_admin");
    await c.from("people").update({ active: false }).eq("id", p);
    expect((await c.from("training_records").update({ withdrawn_reason: "Test: left" }).eq("id", r.id)).error).toBeNull();
  });

  it("nobody can delete an entry, not even with the master key; every change is in the audit log", async () => {
    const p = await newPerson();
    const r = await mustRecord(p, await newType(), done(10, 500));
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      expect((await c.from("training_records").delete().eq("id", r.id)).error).not.toBeNull();
    }
    await (await asRole("super_admin")).from("training_records").update({ withdrawn_reason: "Test: audit" }).eq("id", r.id);
    const { data } = await masterKeyClient().from("audit_log").select("action").eq("table_name", "training_records").eq("record_id", String(r.id)).order("id");
    expect((data ?? []).map((x) => x.action)).toEqual(["insert", "update"]);
  });
});

// ---------------------------------------------------------------------------
describe("the training status, worked out from today's date", () => {
  it("nothing recorded: no row (only recorded training is shown)", async () => {
    expect(await statusesOf(await newPerson())).toEqual([]);
  });

  it("no expiry date: no_expiry", async () => {
    const p = await newPerson();
    const t = await newType(null);
    await mustRecord(p, t, done(400, null));
    expect(await statusOf(p, t)).toMatchObject({ status: "no_expiry", expires_on: null });
  });

  it("the boundaries: expired yesterday, expires today, in 60 days, in 61 days", async () => {
    const cases: [number, string][] = [
      [-1, "expired"],
      [0, "due"],
      [60, "due"],
      [61, "valid"],
    ];
    const t = await newType();
    for (const [left, expected] of cases) {
      const p = await newPerson();
      await mustRecord(p, t, done(365, left));
      const s = await statusOf(p, t);
      expect(s?.status, `expires in ${left} days`).toBe(expected);
      expect(s?.expires_on).toBe(addDays(today(), left));
    }
  });

  it("the newest course of each type counts, even if typed in after an older one", async () => {
    const p = await newPerson();
    const t = await newType();
    await mustRecord(p, t, done(100, 600));
    await mustRecord(p, t, done(900, -10)); // an older course, entered later for the history
    expect(await statusOf(p, t)).toMatchObject({ status: "valid", completed_on: addDays(today(), -100) });
  });

  it("a refresher after an expired course makes it valid again", async () => {
    const p = await newPerson();
    const t = await newType();
    await mustRecord(p, t, done(900, -10));
    expect((await statusOf(p, t))?.status).toBe("expired");
    await mustRecord(p, t, done(2, 700));
    expect((await statusOf(p, t))?.status).toBe("valid");
  });

  it("one row per type: two types give two rows", async () => {
    const p = await newPerson();
    await mustRecord(p, await newType(), done(10, 500));
    await mustRecord(p, await newType(), done(10, -5));
    expect((await statusesOf(p)).map((s) => s.status).sort()).toEqual(["expired", "valid"]);
  });
});
