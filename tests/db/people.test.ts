// Phase 2, slice P2.1: the people directory (PLAN.md 5.2; docs/PHASE-2-AND-3.md
// 4.1). Owner's choices, 15 Nov 2026: one main role per person; the starting
// lists of roles (with Caretaker and Gardener added) and sections; Super
// Admin and Centre Admin only (Finance and the Library Operator see nothing).
// A person is switched off, never deleted. Nothing else is stored about a
// person: no address, date of birth, notes or documents.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];
const TABLES = ["person_roles", "sections", "people"] as const;

async function listId(table: "person_roles" | "sections", name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw new Error(`No ${table} named ${name}: ${error.message}`);
  return data.id;
}

async function personFields(extra: Record<string, unknown> = {}) {
  return {
    full_name: testName("person"),
    person_role_id: await listId("person_roles", "Volunteer"),
    section_id: await listId("sections", "Volunteers"),
    ...extra,
  };
}

type Person = { id: string; full_name: string; active: boolean; phone: string | null; email: string | null; created_by: string };

async function addPerson(client: SupabaseClient, extra: Record<string, unknown> = {}) {
  return client.from("people").insert(await personFields(extra)).select().single<Person>();
}
async function mustAdd(extra: Record<string, unknown> = {}, role = "centre_admin") {
  const { data, error } = await addPerson(await asRole(role), extra);
  if (error) throw error;
  return data!;
}

// ---------------------------------------------------------------------------
describe("who can read the people directory and its lists", () => {
  for (const who of noAccess) {
    it(`${who.label} sees nothing`, async () => {
      await mustAdd();
      const c = await who.client();
      for (const table of TABLES) {
        const { data } = await c.from(table).select("id").limit(5);
        expect(data ?? [], table).toEqual([]);
      }
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can read people, roles and sections`, async () => {
      const p = await mustAdd();
      const c = await asRole(role);
      expect((await c.from("people").select("id").eq("id", p.id)).data).toHaveLength(1);
      expect(((await c.from("person_roles").select("id")).data ?? []).length).toBeGreaterThanOrEqual(10);
      expect(((await c.from("sections").select("id")).data ?? []).length).toBeGreaterThanOrEqual(10);
    });
  }
});

describe("who can add or change people", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot add a person, a role or a section`, async () => {
      const c = await who.client();
      expect((await addPerson(c)).error).not.toBeNull();
      expect((await c.from("person_roles").insert({ name: testName("role"), needs_vetting: false })).error).not.toBeNull();
      expect((await c.from("sections").insert({ name: testName("section") })).error).not.toBeNull();
    });

    it(`${who.label} cannot change or switch off a person`, async () => {
      const p = await mustAdd();
      await (await who.client()).from("people").update({ phone: "+353 00 000 9999", active: false }).eq("id", p.id);
      const { data } = await masterKeyClient().from("people").select("phone, active").eq("id", p.id).single();
      expect(data).toEqual({ phone: null, active: true });
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add, edit, switch off and switch back on a person`, async () => {
      const c = await asRole(role);
      const p = await mustAdd({}, role);
      expect(p.active).toBe(true);
      expect(p.created_by).toBe(userIdOf(seedAdmin(role).email));

      const edited = await c.from("people").update({ phone: "+353 00 000 1234", email: "test.person@example.test" }).eq("id", p.id).select().single();
      expect(edited.error).toBeNull();
      expect(edited.data).toMatchObject({ phone: "+353 00 000 1234", email: "test.person@example.test" });

      expect((await c.from("people").update({ active: false }).eq("id", p.id).select().single()).data).toMatchObject({ active: false });
      expect((await c.from("people").update({ active: true }).eq("id", p.id).select().single()).data).toMatchObject({ active: true });
    });
  }

  it("nobody can delete a person, a role or a section, not even with the master key", async () => {
    const p = await mustAdd();
    const role = await listId("person_roles", "Volunteer");
    const section = await listId("sections", "Volunteers");
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      expect((await c.from("people").delete().eq("id", p.id)).error).not.toBeNull();
      expect((await c.from("person_roles").delete().eq("id", role)).error).not.toBeNull();
      expect((await c.from("sections").delete().eq("id", section)).error).not.toBeNull();
    }
    expect((await masterKeyClient().from("people").select("id").eq("id", p.id)).data).toHaveLength(1);
  });

  it("every change is written to the audit log", async () => {
    const p = await mustAdd();
    await (await asRole("centre_admin")).from("people").update({ active: false }).eq("id", p.id);
    const { data } = await masterKeyClient().from("audit_log").select("action").eq("table_name", "people").eq("record_id", p.id).order("id");
    expect((data ?? []).map((r) => r.action)).toEqual(["insert", "update"]);
  });
});

// ---------------------------------------------------------------------------
describe("the starting lists (owner's choice, 15 Nov 2026)", () => {
  it("has the ten person roles; all need vetting except Board member and Contractor", async () => {
    const { data } = await masterKeyClient().from("person_roles").select("name, needs_vetting").not("name", "like", "Test run%");
    const byName = Object.fromEntries((data ?? []).map((r) => [r.name, r.needs_vetting]));
    expect(byName).toEqual({
      Imam: true,
      Staff: true,
      Security: true,
      Cleaner: true,
      Caretaker: true,
      Gardener: true,
      Reception: true,
      Volunteer: true,
      "Board member": false,
      Contractor: false,
    });
  });

  it("has the ten sections", async () => {
    const { data } = await masterKeyClient().from("sections").select("name").not("name", "like", "Test run%");
    expect((data ?? []).map((r) => r.name).sort()).toEqual(
      ["Administration", "Cleaning", "Maintenance", "Prayer halls", "Reception", "Restaurant", "Security", "Shop", "Volunteers", "Women's section"].sort(),
    );
  });

  it("a role or section name cannot be used twice (ignoring capitals and spaces)", async () => {
    const c = await asRole("centre_admin");
    expect((await c.from("person_roles").insert({ name: " imam ", needs_vetting: true })).error).not.toBeNull();
    expect((await c.from("sections").insert({ name: "SHOP" })).error).not.toBeNull();
  });
});

describe("what a person record accepts", () => {
  it("needs a name", async () => {
    for (const full_name of ["", "   "]) expect((await addPerson(await asRole("centre_admin"), { full_name })).error).not.toBeNull();
  });

  it("refuses a name over 200 characters", async () => {
    expect((await addPerson(await asRole("centre_admin"), { full_name: "Test " + "x".repeat(200) })).error).not.toBeNull();
  });

  it("accepts Arabic names", async () => {
    const p = await mustAdd({ full_name: `Test run ${Date.now()} اختبار` });
    expect(p.full_name).toContain("اختبار");
  });

  it("needs a role and a section", async () => {
    const c = await asRole("centre_admin");
    expect((await addPerson(c, { person_role_id: null })).error).not.toBeNull();
    expect((await addPerson(c, { section_id: null })).error).not.toBeNull();
  });

  it("phone and email are optional, but must look like a phone number and an email address", async () => {
    const c = await asRole("centre_admin");
    expect((await addPerson(c, { phone: null, email: null })).error).toBeNull();
    expect((await addPerson(c, { phone: "+353 (0)1 000-0000" })).error).toBeNull();
    expect((await addPerson(c, { phone: "call reception" })).error).not.toBeNull();
    expect((await addPerson(c, { phone: "12" })).error).not.toBeNull();
    expect((await addPerson(c, { email: "not an email" })).error).not.toBeNull();
    expect((await addPerson(c, { email: "test.person@example.test" })).error).toBeNull();
  });

  // Security review 26 Nov 2026, finding 3, owner's choice A (migration
  // 0053): two people may share a name, but only when the admin says "yes,
  // this is a different person", and that answer is kept.
  it("two people may share a name only with a 'different person' tick, which is kept", async () => {
    const name = testName("same name");
    const first = await mustAdd({ full_name: name });
    expect((first as Person & { same_name_confirmed: boolean }).same_name_confirmed).toBe(false);
    for (const role of ["centre_admin", "super_admin"]) {
      const twin = await addPerson(await asRole(role), { full_name: `  ${name.toLowerCase()} ` });
      expect(twin.error?.message, role).toMatch(/already a person called.*different person/i);
    }
    const second = await mustAdd({ full_name: name, same_name_confirmed: true });
    expect((second as Person & { same_name_confirmed: boolean }).same_name_confirmed).toBe(true);
    const { data } = await (await asRole("centre_admin")).from("people").select("id").eq("full_name", name);
    expect(data).toHaveLength(2);

    // The tick cannot be faked where no name is shared, nor taken away later.
    const alone = await mustAdd({ same_name_confirmed: true });
    expect((alone as Person & { same_name_confirmed: boolean }).same_name_confirmed).toBe(false);
    const c = await asRole("centre_admin");
    const kept = await c.from("people").update({ same_name_confirmed: false, phone: "+353 1 000 0101" }).eq("id", second.id).select("same_name_confirmed").single();
    expect(kept.error).toBeNull();
    expect(kept.data!.same_name_confirmed).toBe(true);

    // Renaming someone to a name already there needs the tick too.
    const rename = await c.from("people").update({ full_name: name }).eq("id", alone.id);
    expect(rename.error?.message).toMatch(/already a person called/i);
    expect((await c.from("people").update({ full_name: name, same_name_confirmed: true }).eq("id", alone.id)).error).toBeNull();

    // The seed and migrations (master key, nobody signed in) are not asked.
    const m = await masterKeyClient().from("people").insert(await personFields({ full_name: name })).select("id").single();
    expect(m.error).toBeNull();
  });

  it("has no place for an address, date of birth, notes, PPS number or documents", async () => {
    const c = await asRole("super_admin");
    for (const column of ["address", "date_of_birth", "notes", "pps_number", "document_path", "photo_path"]) {
      expect((await addPerson(c, { [column]: "x" })).error, column).not.toBeNull();
    }
  });

  it("who and when are filled in by the database and cannot be faked", async () => {
    const p = await mustAdd({ created_by: userIdOf(seedAdmin("super_admin").email), created_at: "2000-01-01T00:00:00Z" });
    expect(p.created_by).toBe(userIdOf(seedAdmin("centre_admin").email));
    expect(new Date((p as unknown as { created_at: string }).created_at).getFullYear()).toBeGreaterThan(2000);
  });
});

describe("switched-off roles and sections", () => {
  async function switchedOff(table: "person_roles" | "sections") {
    const c = await asRole("centre_admin");
    const fields: Record<string, unknown> = table === "person_roles" ? { name: testName("role"), needs_vetting: true } : { name: testName("section") };
    const { data, error } = await c.from(table).insert(fields).select("id").single();
    if (error) throw error;
    return data.id as string;
  }

  it("a new person cannot be given a switched-off role or section", async () => {
    const c = await asRole("centre_admin");
    const role = await switchedOff("person_roles");
    const section = await switchedOff("sections");
    await c.from("person_roles").update({ active: false }).eq("id", role);
    await c.from("sections").update({ active: false }).eq("id", section);
    expect((await addPerson(c, { person_role_id: role })).error?.message).toMatch(/switched off/i);
    expect((await addPerson(c, { section_id: section })).error?.message).toMatch(/switched off/i);
  });

  it("someone who already has it keeps it, and can still be edited; moving someone onto it is refused", async () => {
    const c = await asRole("centre_admin");
    const role = await switchedOff("person_roles");
    const keeper = await mustAdd({ person_role_id: role });
    const other = await mustAdd();
    await c.from("person_roles").update({ active: false }).eq("id", role);

    const edit = await c.from("people").update({ phone: "+353 00 000 4321" }).eq("id", keeper.id).select().single();
    expect(edit.error).toBeNull();
    const move = await c.from("people").update({ person_role_id: role }).eq("id", other.id);
    expect(move.error?.message).toMatch(/switched off/i);
  });
});
