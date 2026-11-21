// Phase 2, slice P2.8: the renewals register (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.3).
// Owner's choices, 16 Nov 2026 (all recommended):
//   * A typed-in renewal has a title, category, owner (a switched-on person,
//     or nobody), documents needed and notes. It is switched off, never deleted.
//   * Its due date is a dated entry, never typed over. "Mark renewed" adds a
//     new entry; a wrong one is withdrawn with a reason. The latest due date counts.
//   * The register also reads vehicle tax, insurance and NCT, Garda vetting
//     expiry, policy review dates and asset warranties (never copied).
//   * Overdue (red), Due soon (60 days, amber), Up to date (green). A warranty
//     that has ended is "Ended" (grey), not overdue.
//   * Training dates are left out. Finance sees nothing.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { addDays, addYears, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";
import { idOf, newFixedAsset } from "./items-helpers";

const today = () => todayInDublin();
const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
const TINY_PDF = new TextEncoder().encode("%PDF-1.4\n% Test run: made-up file\n%%EOF\n");

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

async function newPerson(role = "Volunteer", active = true) {
  const { data, error } = await masterKeyClient()
    .from("people")
    .insert({
      full_name: testName("renewal person"),
      person_role_id: await listId("person_roles", role),
      section_id: await listId("sections", "Volunteers"),
      active,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

type AddArgs = { p_title?: string; p_category?: string; p_owner_person_id?: string | null; p_documents_needed?: string | null; p_notes?: string | null; p_due_on?: string };
function add(client: SupabaseClient, args: AddArgs = {}) {
  return client.rpc("add_renewal", {
    p_title: testName("fire alarm service"),
    p_category: "Service contract",
    p_owner_person_id: null,
    p_documents_needed: "Test: last service report (made up)",
    p_notes: null,
    p_due_on: addDays(today(), 100),
    ...args,
  });
}
async function mustAdd(args: AddArgs = {}): Promise<string> {
  const { data, error } = await add(await asRole("centre_admin"), args);
  if (error) throw error;
  return data as string;
}

function renew(client: SupabaseClient, renewal_id: string, renewedAgo: number, dueIn: number) {
  return client
    .from("renewal_dates")
    .insert({ renewal_id, renewed_on: addDays(today(), -renewedAgo), due_on: addDays(today(), dueIn) })
    .select()
    .single();
}

type Row = { source: string; record_id: string; title: string; category: string; owner_person_id: string | null; due_on: string | null; status: string; note: string | null };
async function registerRows(recordId: string, client?: SupabaseClient): Promise<Row[]> {
  const c = client ?? (await asRole("centre_admin"));
  const { data, error } = await c.from("renewals_register").select("*").eq("record_id", recordId);
  if (error) throw error;
  return (data ?? []) as Row[];
}
async function rowOf(recordId: string, source?: string): Promise<Row | undefined> {
  return (await registerRows(recordId)).find((r) => !source || r.source === source);
}

// ---------------------------------------------------------------------------
describe("who can see and change renewals", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add or change renewals or the register`, async () => {
      const id = await mustAdd();
      const c = await who.client();
      for (const table of ["renewals", "renewal_dates", "renewals_register"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
      expect((await add(c)).data).toBeNull();
      expect((await c.from("renewals").insert({ title: testName("sneaky"), category: "Other" }).select()).data ?? []).toHaveLength(0);
      expect((await c.from("renewals").update({ notes: "changed" }).eq("id", id).select()).data ?? []).toHaveLength(0);
      expect((await renew(c, id, 0, 300)).data).toBeNull();
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add a renewal with its due date; who is filled in by the database`, async () => {
      const c = await asRole(role);
      const { data: id, error } = await add(c);
      expect(error).toBeNull();
      const { data } = await c.from("renewals").select("*").eq("id", id).single();
      expect(data.created_by).toBe(userIdOf(seedAdmin(role).email));
      const { data: dates } = await c.from("renewal_dates").select("*").eq("renewal_id", id);
      expect(dates).toHaveLength(1);
      expect(dates![0]).toMatchObject({ renewed_on: null, due_on: addDays(today(), 100) });
      expect((await renew(c, id as string, 0, 400)).error).toBeNull();
    });
  }
});

describe("renewal rules", () => {
  it("needs a title and a category from the list", async () => {
    const c = await asRole("centre_admin");
    expect((await add(c, { p_title: "  " })).error).not.toBeNull();
    expect((await add(c, { p_category: "Parking fines" })).error).not.toBeNull();
  });

  it("the owner must be a switched-on person, or nobody", async () => {
    const c = await asRole("centre_admin");
    expect((await add(c, { p_owner_person_id: await newPerson("Volunteer", false) })).error?.message).toMatch(/switched off/i);
    const id = await mustAdd({ p_owner_person_id: await newPerson() });
    expect((await c.from("renewals").update({ owner_person_id: null }).eq("id", id)).error).toBeNull();
  });

  it("the first due date may already have passed, but cannot be more than 10 years ahead", async () => {
    const c = await asRole("centre_admin");
    expect((await add(c, { p_due_on: addDays(addYears(today(), 10), 1) })).error?.message).toMatch(/10 years/i);
    expect((await add(c, { p_due_on: addDays(today(), -10) })).error).toBeNull();
  });

  it("a renewal is switched off, never deleted", async () => {
    const id = await mustAdd();
    await masterKeyClient().from("renewals").delete().eq("id", id);
    expect((await masterKeyClient().from("renewals").select("id").eq("id", id)).data).toHaveLength(1);
    const c = await asRole("centre_admin");
    expect((await c.from("renewals").update({ active: false }).eq("id", id)).error).toBeNull();
    expect((await renew(c, id, 0, 300)).error?.message).toMatch(/switched off/i);
    expect(await rowOf(id)).toBeUndefined();
  });
});

describe("marking renewed", () => {
  it("the renewal date cannot be in the future; the new due date must be after it", async () => {
    const id = await mustAdd();
    const c = await asRole("centre_admin");
    expect((await renew(c, id, -1, 300)).error?.message).toMatch(/future/i);
    expect((await renew(c, id, 5, -6)).error?.message).toMatch(/after/i);
  });

  it("the latest due date counts", async () => {
    const id = await mustAdd({ p_due_on: addDays(today(), -3) });
    expect((await rowOf(id))?.status).toBe("overdue");
    const { error } = await renew(await asRole("centre_admin"), id, 0, 365);
    expect(error).toBeNull();
    expect(await rowOf(id)).toMatchObject({ status: "ok", due_on: addDays(today(), 365), source: "manual" });
  });

  it("a wrong entry is withdrawn with a reason, never changed or deleted", async () => {
    const id = await mustAdd({ p_due_on: addDays(today(), 20) });
    const { data: e } = await renew(await asRole("centre_admin"), id, 0, 365);
    const c = await asRole("super_admin");
    expect((await c.from("renewal_dates").update({ due_on: today() }).eq("id", e.id)).error?.message).toMatch(/cannot be changed/i);
    expect((await c.from("renewal_dates").update({ withdrawn_reason: " " }).eq("id", e.id)).error?.message).toMatch(/needs a reason/i);
    const { data, error } = await c.from("renewal_dates").update({ withdrawn_reason: "Test: wrong year" }).eq("id", e.id).select().single();
    expect(error).toBeNull();
    expect(data.withdrawn_by).toBe(userIdOf(seedAdmin("super_admin").email));
    await masterKeyClient().from("renewal_dates").delete().eq("id", e.id);
    expect((await masterKeyClient().from("renewal_dates").select("id").eq("id", e.id)).data).toHaveLength(1);
    expect(await rowOf(id)).toMatchObject({ status: "due", due_on: addDays(today(), 20) });
  });
});

describe("the register: status", () => {
  it("overdue, due within 60 days, or up to date", async () => {
    expect((await rowOf(await mustAdd({ p_due_on: addDays(today(), -1) })))?.status).toBe("overdue");
    expect((await rowOf(await mustAdd({ p_due_on: today() })))?.status).toBe("due");
    expect((await rowOf(await mustAdd({ p_due_on: addDays(today(), 60) })))?.status).toBe("due");
    expect((await rowOf(await mustAdd({ p_due_on: addDays(today(), 61) })))?.status).toBe("ok");
  });

  it("the date rule, checked with any dates; an ended warranty is not overdue", async () => {
    const c = await asRole("centre_admin");
    const s = async (due: string | null, on: string, warranty = false) =>
      (await c.rpc("register_status", { p_due_on: due, p_today: on, p_is_warranty: warranty })).data;
    expect(await s("2026-12-31", "2026-11-01")).toBe("due");
    expect(await s("2026-12-31", "2026-10-31")).toBe("ok");
    expect(await s("2026-12-31", "2027-01-01")).toBe("overdue");
    expect(await s("2026-12-31", "2027-01-01", true)).toBe("ended");
    expect(await s("2026-12-31", "2026-12-01", true)).toBe("due");
    expect(await s(null, "2026-01-01")).toBe("none");
  });
});

describe("the register: dates read from elsewhere", () => {
  it("a vehicle's tax, insurance and NCT, with its keeper as the owner", async () => {
    const keeper = await newPerson();
    const asset = await newFixedAsset("centre_admin", { name: testName("van"), category_id: await idOf("item_categories", "Cars and vans") });
    const c = await asRole("centre_admin");
    const reg = `TR-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const { data: v, error } = await c.from("vehicles").insert({ item_id: asset.id, registration: reg, keeper_person_id: keeper }).select("id").single();
    if (error) throw error;
    await c.from("vehicle_renewals").insert({ vehicle_id: v.id, kind: "tax", renewed_on: addDays(today(), -400), valid_until: addDays(today(), -35) });
    await c.from("vehicle_renewals").insert({ vehicle_id: v.id, kind: "insurance", renewed_on: addDays(today(), -10), valid_until: addDays(today(), 355) });
    const rows = await registerRows(v.id);
    expect(rows.map((r) => r.source).sort()).toEqual(["vehicle_insurance", "vehicle_tax"]);
    expect(rows.find((r) => r.source === "vehicle_tax")).toMatchObject({ status: "overdue", owner_person_id: keeper, category: "Vehicles" });
    expect(rows.find((r) => r.source === "vehicle_tax")?.title).toContain(reg);
    await c.from("vehicles").update({ active: false }).eq("id", v.id);
    expect(await registerRows(v.id)).toHaveLength(0);
  });

  it("Garda vetting expiry, for switched-on people who need vetting", async () => {
    const person = await newPerson("Volunteer");
    const c = await asRole("centre_admin");
    const { error } = await c
      .from("vetting_records")
      .insert({ person_id: person, kind: "vetted", happened_on: addDays(today(), -1000), expires_on: addDays(today(), 30) });
    if (error) throw error;
    expect(await rowOf(person, "vetting")).toMatchObject({ status: "due", due_on: addDays(today(), 30), owner_person_id: person, category: "Garda vetting" });
    await masterKeyClient().from("people").update({ active: false }).eq("id", person);
    expect(await rowOf(person, "vetting")).toBeUndefined();
  });

  it("a policy's next review date, from its current published version", async () => {
    const owner = await newPerson();
    const c = await asRole("centre_admin");
    const { data: policy, error } = await c.from("policies").insert({ title: testName("policy"), owner_person_id: owner }).select("id").single();
    if (error) throw error;
    expect(await rowOf(policy.id, "policy_review")).toBeUndefined(); // nothing published yet
    const path = `policies/${policy.id}/${crypto.randomUUID()}.pdf`;
    await c.storage.from("policy-files").upload(path, TINY_PDF, { contentType: "application/pdf" });
    const { data: ver, error: verError } = await c
      .from("policy_versions")
      .insert({ policy_id: policy.id, version_label: "v1", approved_on: addDays(today(), -400), next_review_on: addDays(today(), 20), file_path: path })
      .select("id")
      .single();
    if (verError) throw verError;
    const pub = await (await secondCentreAdmin()).from("policy_versions").update({ status: "published" }).eq("id", ver.id);
    if (pub.error) throw pub.error;
    expect(await rowOf(policy.id, "policy_review")).toMatchObject({ status: "due", due_on: addDays(today(), 20), owner_person_id: owner, category: "Policies" });
  });

  it("an asset's warranty; ended is grey, not overdue; disposed assets are left out", async () => {
    const soon = await newFixedAsset("centre_admin", { purchase_date: addDays(today(), -700), warranty_end: addDays(today(), 10) });
    const ended = await newFixedAsset("centre_admin", { purchase_date: addDays(today(), -700), warranty_end: addDays(today(), -10) });
    const none = await newFixedAsset();
    expect(await rowOf(soon.id, "warranty")).toMatchObject({ status: "due", category: "Warranties" });
    expect(await rowOf(ended.id, "warranty")).toMatchObject({ status: "ended" });
    expect(await rowOf(none.id, "warranty")).toBeUndefined();
  });

  it("training dates are not in the register", async () => {
    const { data } = await (await asRole("centre_admin")).from("renewals_register").select("source").like("source", "train%").limit(1);
    expect(data).toHaveLength(0);
  });
});

describe("home page counters", () => {
  type C = { renewals_overdue: number; renewals_due_30: number };
  const counters = async () => {
    const { data, error } = await (await asRole("centre_admin")).rpc("home_counters").single<C>();
    if (error) throw error;
    return data!;
  };

  it("count overdue renewals and those due in 30 days or fewer", async () => {
    const before = await counters();
    await mustAdd({ p_due_on: addDays(today(), -2) });
    await mustAdd({ p_due_on: addDays(today(), 30) });
    await mustAdd({ p_due_on: addDays(today(), 31) });
    await newFixedAsset("centre_admin", { purchase_date: addDays(today(), -700), warranty_end: addDays(today(), -3) });
    const after = await counters();
    expect(after.renewals_overdue - before.renewals_overdue).toBe(1);
    expect(after.renewals_due_30 - before.renewals_due_30).toBe(1);
  });
});

describe("the audit log", () => {
  it("records a renewal and its due dates", async () => {
    const id = await mustAdd();
    const db = masterKeyClient();
    expect((await db.from("audit_log").select("action").eq("table_name", "renewals").eq("record_id", id)).data?.map((r) => r.action)).toContain("insert");
    const { data: d } = await db.from("renewal_dates").select("id").eq("renewal_id", id).single();
    expect((await db.from("audit_log").select("action").eq("table_name", "renewal_dates").eq("record_id", String(d!.id))).data?.map((r) => r.action)).toContain("insert");
  });
});
