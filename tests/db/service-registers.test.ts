// Phase 6, slice P6.1: the service registers (PLAN.md 5.6; docs/PHASE-6.md).
// Owner's choices, 28 Nov 2026 (every recommended answer):
//   * Funeral, Shahada and Nikah registers, Super Admin only.
//   * Numbers given by the database (FU-, SH-, NK- with the year), never
//     typed, never repeated or reused, the same for every version.
//   * Never changed: a mistake is corrected with a new version (with a
//     reason), only the newest version can be corrected, and an entry can
//     be cancelled once with a reason. Nothing is deleted.
//   * Shahada and Nikah are for people aged 18 or over (a tick that must be
//     ticked). People picked from the directory must be switched on.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { addDays, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";

const today = () => todayInDublin();
const superAdmin = () => asRole("super_admin");

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "centre_admin", client: () => asRole("centre_admin") },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a Super Admin signed in with the password only (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("super_admin").email) },
];

async function newPerson(active = true) {
  const db = masterKeyClient();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Imam").single(),
    db.from("sections").select("id").eq("name", "Prayer halls").single(),
  ]);
  const { data, error } = await db
    .from("people")
    .insert({ full_name: testName("imam"), person_role_id: role.data!.id, section_id: section.data!.id, active })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

type Kind = "funeral" | "shahada" | "nikah";
const TABLE: Record<Kind, string> = { funeral: "funeral_entries", shahada: "shahada_entries", nikah: "nikah_entries" };
const VIEW: Record<Kind, string> = { funeral: "funeral_register", shahada: "shahada_register", nikah: "nikah_register" };
const PREFIX: Record<Kind, string> = { funeral: "FU", shahada: "SH", nikah: "NK" };

async function fields(kind: Kind, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const person = await newPerson();
  const base: Record<Kind, Record<string, unknown>> = {
    funeral: {
      service_date: addDays(today(), -3),
      deceased_name: testName("deceased"),
      family_contact_name: testName("family contact"),
      family_contact_phone: "01 000 1234",
      ghusl: true,
      janazah_prayer: true,
      on_duty_person_ids: [person],
    },
    shahada: {
      service_date: addDays(today(), -3),
      person_name: testName("new Muslim"),
      imam_person_id: person,
      witness_1: testName("witness one"),
      adult_confirmed: true,
    },
    nikah: {
      service_date: addDays(today(), -3),
      spouse_1_name: testName("spouse one"),
      spouse_2_name: testName("spouse two"),
      officiant_person_id: person,
      witness_1: testName("witness one"),
      witness_2: testName("witness two"),
      civil_registration: "yes",
      adults_confirmed: true,
    },
  };
  return { ...base[kind], ...extra };
}

type Entry = { id: number; number: string; first_id: number; corrects_id: number | null; created_by: string; cancelled_at: string | null; cancelled_by: string | null };

function add(client: SupabaseClient, kind: Kind, values: Record<string, unknown>) {
  return client.from(TABLE[kind]).insert(values).select().single();
}
async function mustAdd(kind: Kind, extra: Record<string, unknown> = {}): Promise<Entry> {
  const { data, error } = await add(await superAdmin(), kind, await fields(kind, extra));
  if (error) throw error;
  return data as Entry;
}

const KINDS: Kind[] = ["funeral", "shahada", "nikah"];

// ---------------------------------------------------------------------------
describe("who can see and change the service registers", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add, correct or cancel any entry`, async () => {
      const c = await who.client();
      for (const kind of KINDS) {
        const e = await mustAdd(kind);
        for (const table of [TABLE[kind], VIEW[kind]]) {
          const { data } = await c.from(table).select("*").limit(5);
          expect(data ?? [], table).toHaveLength(0);
        }
        expect((await add(c, kind, await fields(kind))).data, `${kind}: add`).toBeNull();
        expect((await add(c, kind, await fields(kind, { corrects_id: e.id, correction_reason: "Test: wrong" }))).data, `${kind}: correct`).toBeNull();
        const cancel = await c.from(TABLE[kind]).update({ cancelled_reason: "Test: not allowed" }).eq("id", e.id).select();
        expect(cancel.data ?? [], `${kind}: cancel`).toHaveLength(0);
        const still = await (await superAdmin()).from(TABLE[kind]).select("cancelled_at").eq("id", e.id).single();
        expect(still.data!.cancelled_at).toBeNull();
      }
    });
  }

  it("not even the master key (no signed-in Super Admin) can add an entry", async () => {
    for (const kind of KINDS) {
      const r = await add(masterKeyClient(), kind, await fields(kind));
      expect(r.error, kind).not.toBeNull();
    }
  });

  it("both Super Admins see every entry; the database fills in who recorded it", async () => {
    for (const kind of KINDS) {
      const e = await mustAdd(kind);
      expect(e.created_by).toBe(userIdOf(seedAdmin("super_admin").email));
      const other = await asRole("super_admin");
      const two = await signedInClient("super.two@icci-prototype.test");
      for (const c of [other, two]) {
        const { data } = await c.from(VIEW[kind]).select("id").eq("id", e.id);
        expect(data ?? []).toHaveLength(1);
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe("register numbers", () => {
  it("are given by the database, in order, with the year of the service date", async () => {
    for (const kind of KINDS) {
      const year = Number(today().slice(0, 4));
      const a = await mustAdd(kind, { number: "XX-9999-9999" });
      const b = await mustAdd(kind);
      expect(a.number).toMatch(new RegExp(`^${PREFIX[kind]}-${year}-\\d{4,}$`));
      expect(Number(b.number.split("-")[2])).toBeGreaterThan(Number(a.number.split("-")[2]));
      expect(a.first_id).toBe(a.id);
      const old = await mustAdd(kind, { service_date: "2019-06-01" });
      expect(old.number).toMatch(new RegExp(`^${PREFIX[kind]}-2019-\\d{4,}$`));
    }
  });

  it("are never reused, even after an entry is cancelled", async () => {
    for (const kind of KINDS) {
      const a = await mustAdd(kind);
      const c = await superAdmin();
      expect((await c.from(TABLE[kind]).update({ cancelled_reason: "Test: entered twice" }).eq("id", a.id).select()).error).toBeNull();
      const b = await mustAdd(kind);
      expect(b.number).not.toBe(a.number);
      expect(Number(b.number.split("-")[2])).toBeGreaterThan(Number(a.number.split("-")[2]));
    }
  });

  it("cannot be changed afterwards", async () => {
    const e = await mustAdd("shahada");
    const r = await (await superAdmin()).from("shahada_entries").update({ number: "SH-2000-0001" }).eq("id", e.id).select();
    expect(r.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("corrections and cancelling", () => {
  it("an entry is never typed over: a change is refused", async () => {
    const e = await mustAdd("funeral");
    const r = await (await superAdmin()).from("funeral_entries").update({ deceased_name: "Changed" }).eq("id", e.id).select();
    expect(r.error?.message).toMatch(/cannot be changed/i);
  });

  for (const kind of KINDS) {
    it(`${kind}: a correction is a new version with a reason; the old one stays and the number is kept`, async () => {
      const e = await mustAdd(kind);
      const c = await superAdmin();
      const noReason = await add(c, kind, await fields(kind, { corrects_id: e.id }));
      expect(noReason.error).not.toBeNull();
      const blank = await add(c, kind, await fields(kind, { corrects_id: e.id, correction_reason: "   " }));
      expect(blank.error).not.toBeNull();
      const fix = await add(c, kind, await fields(kind, { corrects_id: e.id, correction_reason: "  Test:   name   misspelt " }));
      expect(fix.error).toBeNull();
      const v2 = fix.data as Entry & { correction_reason: string };
      expect(v2.number).toBe(e.number);
      expect(v2.first_id).toBe(e.id);
      expect(v2.correction_reason).toBe("Test: name misspelt");
      // Both versions are kept; the register shows the newest, with 2 versions.
      const all = await c.from(TABLE[kind]).select("id").eq("first_id", e.id).order("id");
      expect((all.data ?? []).map((x) => x.id)).toEqual([e.id, v2.id]);
      const shown = await c.from(VIEW[kind]).select("id, versions").eq("first_id", e.id);
      expect(shown.data).toEqual([{ id: v2.id, versions: 2 }]);
      // Only the newest version can be corrected or cancelled.
      expect((await add(c, kind, await fields(kind, { corrects_id: e.id, correction_reason: "Test: again" }))).error).not.toBeNull();
      expect((await c.from(TABLE[kind]).update({ cancelled_reason: "Test: old" }).eq("id", e.id).select()).error).not.toBeNull();
    });
  }

  it("cancelling needs a reason, happens once, and records who and when", async () => {
    const e = await mustAdd("nikah");
    const c = await superAdmin();
    expect((await c.from("nikah_entries").update({ cancelled_reason: "  " }).eq("id", e.id).select()).error).not.toBeNull();
    const done = await c
      .from("nikah_entries")
      .update({ cancelled_reason: "Test: entered twice", cancelled_by: userIdOf(seedAdmin("finance").email), cancelled_at: "2000-01-01T00:00:00Z" })
      .eq("id", e.id)
      .select()
      .single();
    expect(done.error).toBeNull();
    const row = done.data as Entry;
    expect(row.cancelled_by).toBe(userIdOf(seedAdmin("super_admin").email));
    expect(new Date(row.cancelled_at!).getFullYear()).toBeGreaterThan(2020);
    expect((await c.from("nikah_entries").update({ cancelled_reason: "Test: again" }).eq("id", e.id).select()).error).not.toBeNull();
    // A cancelled entry cannot be corrected.
    expect((await add(c, "nikah", await fields("nikah", { corrects_id: e.id, correction_reason: "Test: fix" }))).error).not.toBeNull();
  });

  it("a new entry cannot arrive already cancelled", async () => {
    const r = await add(await superAdmin(), "shahada", await fields("shahada", { cancelled_reason: "Test: no" }));
    expect(r.error).not.toBeNull();
  });

  it("nothing is ever deleted, not even with the master key, and every entry is in the audit log", async () => {
    for (const kind of KINDS) {
      const e = await mustAdd(kind);
      await masterKeyClient().from(TABLE[kind]).delete().eq("id", e.id);
      await (await superAdmin()).from(TABLE[kind]).delete().eq("id", e.id);
      const still = await masterKeyClient().from(TABLE[kind]).select("id").eq("id", e.id);
      expect(still.data ?? []).toHaveLength(1);
      const audit = await masterKeyClient().from("audit_log").select("id").eq("table_name", TABLE[kind]).eq("record_id", String(e.id));
      expect((audit.data ?? []).length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
describe("what each register accepts", () => {
  it("no date in the future, none before 1950", async () => {
    for (const kind of KINDS) {
      const c = await superAdmin();
      expect((await add(c, kind, await fields(kind, { service_date: addDays(today(), 1) }))).error, kind).not.toBeNull();
      expect((await add(c, kind, await fields(kind, { service_date: "1949-12-31" }))).error, kind).not.toBeNull();
    }
  });

  it("funeral: at least one service, one to ten people on duty, each once and switched on", async () => {
    const c = await superAdmin();
    const none = { ghusl: false, kafan: false, janazah_prayer: false, family_room: false };
    expect((await add(c, "funeral", await fields("funeral", none))).error).not.toBeNull();
    expect((await add(c, "funeral", await fields("funeral", { on_duty_person_ids: [] }))).error).not.toBeNull();
    const p = await newPerson();
    expect((await add(c, "funeral", await fields("funeral", { on_duty_person_ids: [p, p] }))).error).not.toBeNull();
    const off = await newPerson(false);
    expect((await add(c, "funeral", await fields("funeral", { on_duty_person_ids: [off] }))).error?.message).toMatch(/switched off/);
    expect((await add(c, "funeral", await fields("funeral", { on_duty_person_ids: ["00000000-0000-4000-8000-000000000000"] }))).error).not.toBeNull();
    expect((await add(c, "funeral", await fields("funeral", { family_contact_phone: "call me" }))).error).not.toBeNull();
    const ok = await add(c, "funeral", await fields("funeral", { family_contact_phone: null, deceased_name: "  Test   run  name " }));
    expect(ok.error).toBeNull();
    expect((ok.data as { deceased_name: string }).deceased_name).toBe("Test run name");
  });

  it("shahada: the 18-or-over tick is required; the imam must be switched on", async () => {
    const c = await superAdmin();
    expect((await add(c, "shahada", await fields("shahada", { adult_confirmed: false }))).error).not.toBeNull();
    expect((await add(c, "shahada", await fields("shahada", { adult_confirmed: null }))).error).not.toBeNull();
    const off = await newPerson(false);
    expect((await add(c, "shahada", await fields("shahada", { imam_person_id: off }))).error?.message).toMatch(/switched off/);
    const noWitness = await add(c, "shahada", await fields("shahada", { witness_1: null }));
    expect(noWitness.error).toBeNull();
  });

  it("shahada: a correction may keep an imam who has since been switched off", async () => {
    const imam = await newPerson();
    const e = await mustAdd("shahada", { imam_person_id: imam });
    await masterKeyClient().from("people").update({ active: false }).eq("id", imam);
    const fix = await add(await superAdmin(), "shahada", await fields("shahada", { imam_person_id: imam, corrects_id: e.id, correction_reason: "Test: date" }));
    expect(fix.error).toBeNull();
  });

  it("nikah: both 18 or over, two witnesses, and civil registration yes, no or not known", async () => {
    const c = await superAdmin();
    expect((await add(c, "nikah", await fields("nikah", { adults_confirmed: false }))).error).not.toBeNull();
    expect((await add(c, "nikah", await fields("nikah", { witness_2: null }))).error).not.toBeNull();
    expect((await add(c, "nikah", await fields("nikah", { witness_1: "   " }))).error).not.toBeNull();
    expect((await add(c, "nikah", await fields("nikah", { civil_registration: "maybe" }))).error).not.toBeNull();
    const plain = await fields("nikah");
    delete plain.civil_registration;
    const ok = await add(c, "nikah", { ...plain, wali_name: testName("wali") });
    expect(ok.error).toBeNull();
    expect((ok.data as { civil_registration: string }).civil_registration).toBe("unknown");
  });
});
