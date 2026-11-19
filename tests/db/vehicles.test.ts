// Phase 2, slice P2.7: vehicles (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.3).
// Owner's choices, 16 Nov 2026 (all recommended):
//   * A vehicle is a fixed asset plus registration, make and model, and a
//     keeper (any switched-on person, or nobody).
//   * Tax, insurance and NCT are dated entries, never typed over; a wrong
//     one is withdrawn with a reason. The latest "valid until" counts.
//   * "NCT not needed yet" is allowed for newer cars.
//   * Valid, Due soon (60 days or fewer), Expired, Not recorded.
//   * Super Admin and Centre Admin only.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { addDays, addYears, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";
import { consumableFields, idOf, newFixedAsset } from "./items-helpers";

const today = () => todayInDublin();

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const reg = () => `TR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

async function newPerson(active = true) {
  const db = masterKeyClient();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Staff").single(),
    db.from("sections").select("id").eq("name", "Maintenance").single(),
  ]);
  const { data, error } = await db
    .from("people")
    .insert({ full_name: testName("keeper"), person_role_id: role.data!.id, section_id: section.data!.id, active })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function newVehicle(extra: Record<string, unknown> = {}) {
  const asset = await newFixedAsset("centre_admin", { name: testName("van"), category_id: await idOf("item_categories", "Vehicles") });
  const { data, error } = await (await asRole("centre_admin"))
    .from("vehicles")
    .insert({ item_id: asset.id, registration: reg(), make_model: "Test Van (made up)", ...extra })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; item_id: string; registration: string; created_by: string };
}

function renew(client: SupabaseClient, vehicle_id: string, kind: string, ago: number, validFor: number) {
  return client
    .from("vehicle_renewals")
    .insert({ vehicle_id, kind, renewed_on: addDays(today(), -ago), valid_until: addDays(today(), -ago + validFor) })
    .select()
    .single();
}
async function mustRenew(vehicle_id: string, kind: string, ago: number, validFor: number) {
  const { data, error } = await renew(await asRole("centre_admin"), vehicle_id, kind, ago, validFor);
  if (error) throw error;
  return data as { id: number };
}

type Status = { tax_status: string; insurance_status: string; nct_status: string; tax_until: string | null };
async function statusOf(id: string): Promise<Status> {
  const { data, error } = await (await asRole("centre_admin")).from("vehicle_status").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Status;
}

// ---------------------------------------------------------------------------
describe("who can see and change vehicles", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add or change vehicles or renewals`, async () => {
      const v = await newVehicle();
      await mustRenew(v.id, "tax", 10, 365);
      const c = await who.client();
      for (const table of ["vehicles", "vehicle_renewals", "vehicle_status"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
      const asset = await newFixedAsset();
      expect((await c.from("vehicles").insert({ item_id: asset.id, registration: reg() }).select()).data ?? []).toHaveLength(0);
      expect((await c.from("vehicles").update({ make_model: "changed" }).eq("id", v.id).select()).data ?? []).toHaveLength(0);
      expect((await renew(c, v.id, "insurance", 1, 365)).data).toBeNull();
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add a vehicle and record renewals; who is filled in by the database`, async () => {
      const asset = await newFixedAsset();
      const c = await asRole(role);
      const { data, error } = await c.from("vehicles").insert({ item_id: asset.id, registration: ` ${reg().toLowerCase()} ` }).select().single();
      expect(error).toBeNull();
      expect(data.registration).toMatch(/^TR-[A-Z0-9]+$/);
      expect(data.created_by).toBe(userIdOf(seedAdmin(role).email));
      expect((await renew(c, data.id, "tax", 5, 365)).error).toBeNull();
    });
  }
});

describe("vehicle rules", () => {
  it("registrations are unique, ignoring spaces, dashes and capitals", async () => {
    const v = await newVehicle();
    const asset = await newFixedAsset();
    const same = v.registration.replace("-", " ").toLowerCase();
    const r = await (await asRole("centre_admin")).from("vehicles").insert({ item_id: asset.id, registration: same });
    expect(r.error).not.toBeNull();
  });

  it("a registration is letters, numbers, spaces and dashes only", async () => {
    const asset = await newFixedAsset();
    const r = await (await asRole("centre_admin")).from("vehicles").insert({ item_id: asset.id, registration: "AB/12!" });
    expect(r.error).not.toBeNull();
  });

  it("only a fixed asset that is not disposed of can be a vehicle; one vehicle per asset", async () => {
    const c = await asRole("centre_admin");
    const { data: stock } = await c.from("items").insert(await consumableFields()).select("id").single();
    expect((await c.from("vehicles").insert({ item_id: stock!.id, registration: reg() })).error?.message).toMatch(/only a fixed asset/i);
    const v = await newVehicle();
    expect((await c.from("vehicles").insert({ item_id: v.item_id, registration: reg() })).error).not.toBeNull();
  });

  it("the keeper must be a switched-on person, or nobody", async () => {
    const c = await asRole("centre_admin");
    const v = await newVehicle();
    expect((await c.from("vehicles").update({ keeper_person_id: await newPerson(false) }).eq("id", v.id)).error?.message).toMatch(/switched off/i);
    expect((await c.from("vehicles").update({ keeper_person_id: await newPerson() }).eq("id", v.id)).error).toBeNull();
    expect((await c.from("vehicles").update({ keeper_person_id: null }).eq("id", v.id)).error).toBeNull();
  });

  it("a vehicle cannot be moved to another asset, and is never deleted", async () => {
    const v = await newVehicle();
    const other = await newFixedAsset();
    expect((await (await asRole("centre_admin")).from("vehicles").update({ item_id: other.id }).eq("id", v.id)).error?.message).toMatch(/cannot be moved/i);
    await masterKeyClient().from("vehicles").delete().eq("id", v.id);
    expect((await masterKeyClient().from("vehicles").select("id").eq("id", v.id)).data).toHaveLength(1);
  });
});

describe("renewals", () => {
  it("the renewal date cannot be in the future; valid until must be after it, at most 3 years", async () => {
    const v = await newVehicle();
    const c = await asRole("centre_admin");
    expect((await renew(c, v.id, "tax", -1, 365)).error?.message).toMatch(/future/i);
    expect((await renew(c, v.id, "tax", 5, 0)).error).not.toBeNull();
    const r = await c
      .from("vehicle_renewals")
      .insert({ vehicle_id: v.id, kind: "nct", renewed_on: today(), valid_until: addDays(addYears(today(), 3), 1) });
    expect(r.error?.message).toMatch(/3 years/i);
  });

  it("only tax, insurance or NCT", async () => {
    const v = await newVehicle();
    expect((await renew(await asRole("centre_admin"), v.id, "parking", 1, 30)).error).not.toBeNull();
  });

  it("nothing new for a switched-off or disposed vehicle", async () => {
    const v = await newVehicle();
    const c = await asRole("centre_admin");
    await c.from("vehicles").update({ active: false }).eq("id", v.id);
    expect((await renew(c, v.id, "tax", 1, 365)).error?.message).toMatch(/switched off/i);
  });

  it("a wrong entry is withdrawn with a reason, never changed or deleted", async () => {
    const v = await newVehicle();
    const e = await mustRenew(v.id, "insurance", 3, 365);
    const c = await asRole("super_admin");
    expect((await c.from("vehicle_renewals").update({ valid_until: today() }).eq("id", e.id)).error?.message).toMatch(/cannot be changed/i);
    expect((await c.from("vehicle_renewals").update({ withdrawn_reason: " " }).eq("id", e.id)).error?.message).toMatch(/needs a reason/i);
    const { data, error } = await c.from("vehicle_renewals").update({ withdrawn_reason: "Test: wrong year" }).eq("id", e.id).select().single();
    expect(error).toBeNull();
    expect(data.withdrawn_by).toBe(userIdOf(seedAdmin("super_admin").email));
    await masterKeyClient().from("vehicle_renewals").delete().eq("id", e.id);
    expect((await masterKeyClient().from("vehicle_renewals").select("id").eq("id", e.id)).data).toHaveLength(1);
    expect((await statusOf(v.id)).insurance_status).toBe("none");
  });
});

describe("status", () => {
  it("valid, due within 60 days, expired, or not recorded", async () => {
    const v = await newVehicle();
    expect(await statusOf(v.id)).toMatchObject({ tax_status: "none", insurance_status: "none", nct_status: "none" });
    await mustRenew(v.id, "tax", 300, 365); // 65 days left
    await mustRenew(v.id, "insurance", 320, 365); // 45 days left
    await mustRenew(v.id, "nct", 400, 365); // ended 35 days ago
    expect(await statusOf(v.id)).toMatchObject({ tax_status: "valid", insurance_status: "due", nct_status: "expired" });
  });

  it("the latest valid-until date counts; a renewal turns expired into valid", async () => {
    const v = await newVehicle();
    await mustRenew(v.id, "tax", 400, 365);
    expect((await statusOf(v.id)).tax_status).toBe("expired");
    await mustRenew(v.id, "tax", 1, 365);
    expect((await statusOf(v.id)).tax_until).toBe(addDays(today(), 364));
    expect((await statusOf(v.id)).tax_status).toBe("valid");
  });

  it('"NCT not needed yet" shows until an NCT is recorded', async () => {
    const v = await newVehicle({ nct_needed: false });
    expect((await statusOf(v.id)).nct_status).toBe("not_needed");
    await mustRenew(v.id, "nct", 1, 700);
    expect((await statusOf(v.id)).nct_status).toBe("valid");
  });

  it("the date rule, checked with any dates", async () => {
    const c = await asRole("centre_admin");
    const s = async (until: string | null, on: string) => (await c.rpc("renewal_status", { p_valid_until: until, p_today: on })).data;
    expect(await s("2026-12-31", "2026-11-01")).toBe("due");
    // 1 Nov + 60 days = 31 Dec (due); 31 Oct + 60 days = 30 Dec (still valid).
    expect(await s("2026-12-31", "2026-10-31")).toBe("valid");
    expect(await s("2026-12-31", "2026-12-31")).toBe("due");
    expect(await s("2026-12-31", "2027-01-01")).toBe("expired");
    expect(await s(null, "2026-01-01")).toBe("none");
  });
});

describe("the audit log", () => {
  it("records a vehicle and a renewal", async () => {
    const v = await newVehicle();
    const e = await mustRenew(v.id, "tax", 1, 365);
    const db = masterKeyClient();
    expect((await db.from("audit_log").select("action").eq("table_name", "vehicles").eq("record_id", v.id)).data?.map((r) => r.action)).toContain("insert");
    expect((await db.from("audit_log").select("action").eq("table_name", "vehicle_renewals").eq("record_id", String(e.id))).data?.map((r) => r.action)).toContain("insert");
  });
});
