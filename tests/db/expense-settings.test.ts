// Slice P5.1 (docs/PHASE-5.md, owner approved 25 Nov 2026): the lists and
// settings that expense claims are built on, and Finance's read-only asset
// register.
//   * Spend categories and funds: everyone who handles claims (Super Admin,
//     Centre Admin, Finance) reads them; only Super Admin and Finance add,
//     rename or switch them off. Never deleted. A fund's "restricted" tick is
//     fixed once it is added.
//   * The two amounts (second approval above €500, lost receipt above €50):
//     the same three roles read them; only a Super Admin changes them; no new
//     settings can be invented, and every change is in the audit log.
//   * "Is my account linked to my People record?" (needed to approve, 2A).
//   * Finance gets the asset register through two narrow look-ups, and still
//     cannot read the items or places tables themselves.
// Signed-out visitors, the Library Operator, a switched-off account and a
// password-only sign-in get nothing.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName } from "./clients";
import { newFixedAsset } from "./items-helpers";

const LISTS = ["expense_categories", "expense_funds", "app_settings"] as const;

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "the Library Operator", client: () => asRole("library_operator") },
  { label: "a switched-off account", client: () => signedInClient(seedAdmin("centre_admin", false).email) },
  { label: "a password-only sign-in", client: () => passwordOnlyClient(seedAdmin("finance").email) },
];

const HANDLERS = ["super_admin", "centre_admin", "finance"] as const;
const LIST_KEEPERS = ["super_admin", "finance"] as const;

async function newCategory(role: string = "finance") {
  const { data, error } = await (await asRole(role)).from("expense_categories").insert({ name: testName("category") }).select().single();
  if (error) throw error;
  return data as { id: string; name: string; active: boolean };
}

async function newFund(role: string = "finance", restricted = true) {
  const { data, error } = await (await asRole(role)).from("expense_funds").insert({ name: testName("fund"), restricted }).select().single();
  if (error) throw error;
  return data as { id: string; name: string; restricted: boolean; active: boolean };
}

async function settingCents(key: string) {
  const { data, error } = await masterKeyClient().from("app_settings").select("amount_cents").eq("key", key).single();
  if (error) throw error;
  return data.amount_cents as number;
}

// ---------------------------------------------------------------------------
describe("who can see the expense lists and settings", () => {
  for (const who of noAccess) {
    it(`${who.label} sees none, adds none and changes none`, async () => {
      const c = await who.client();
      for (const table of LISTS) {
        expect((await c.from(table).select("*").limit(3)).data ?? [], table).toHaveLength(0);
      }
      expect((await c.from("expense_categories").insert({ name: testName("sneaky") })).error).not.toBeNull();
      expect((await c.from("expense_funds").insert({ name: testName("sneaky"), restricted: false })).error).not.toBeNull();
      const { data } = await c.from("app_settings").update({ amount_cents: 1 }).eq("key", "second_approval_cents").select("key");
      expect(data ?? []).toHaveLength(0);
      for (const fn of ["my_expense_link", "asset_register_rows", "asset_register_names"]) {
        const r = await c.rpc(fn);
        expect(r.error !== null || (r.data as unknown[]).length === 0, fn).toBe(true);
      }
    });
  }

  for (const role of HANDLERS) {
    it(`${role} reads the categories, funds and both amounts`, async () => {
      const c = await asRole(role);
      const cats = await c.from("expense_categories").select("name, active");
      expect(cats.error).toBeNull();
      expect(cats.data!.map((x) => x.name)).toEqual(expect.arrayContaining(["Repairs and maintenance", "Utilities", "Books and learning materials", "Other"]));
      const funds = await c.from("expense_funds").select("name, restricted");
      expect(funds.data).toEqual(
        expect.arrayContaining([
          { name: "Unrestricted", restricted: false },
          { name: "Zakat", restricted: true },
          { name: "Fitra", restricted: true },
        ]),
      );
      const settings = await c.from("app_settings").select("key, amount_cents");
      expect(settings.data!.map((s) => s.key).sort()).toEqual(["lost_receipt_second_cents", "second_approval_cents"]);
    });
  }

  it("the starting list has the 14 categories of the plan, and the amounts start at €500 and €50", async () => {
    const { data } = await masterKeyClient().from("expense_categories").select("name").not("name", "like", "Test run%");
    expect(data).toHaveLength(14);
    expect(await settingCents("second_approval_cents")).toBeGreaterThan(0);
    const fresh = await masterKeyClient().from("audit_log").select("new_values").eq("table_name", "app_settings").eq("action", "insert");
    const firstValues = Object.fromEntries((fresh.data ?? []).map((r) => [r.new_values.key, r.new_values.amount_cents]));
    expect(firstValues).toEqual({ second_approval_cents: 50000, lost_receipt_second_cents: 5000 });
  });
});

// ---------------------------------------------------------------------------
describe("spend categories and funds", () => {
  for (const role of LIST_KEEPERS) {
    it(`${role} adds, renames, switches off and back on`, async () => {
      const c = await asRole(role);
      const cat = await newCategory(role);
      const fund = await newFund(role);
      const renamed = testName("renamed");
      expect((await c.from("expense_categories").update({ name: renamed }).eq("id", cat.id)).error).toBeNull();
      expect((await c.from("expense_funds").update({ name: testName("renamed fund") }).eq("id", fund.id)).error).toBeNull();
      for (const [table, id] of [["expense_categories", cat.id], ["expense_funds", fund.id]] as const) {
        expect((await c.from(table).update({ active: false }).eq("id", id)).error, table).toBeNull();
        expect((await c.from(table).update({ active: true }).eq("id", id)).error, table).toBeNull();
      }
    });
  }

  it("a Centre Admin reads them but cannot add or change them", async () => {
    const c = await asRole("centre_admin");
    expect((await c.from("expense_categories").insert({ name: testName("centre") })).error).not.toBeNull();
    expect((await c.from("expense_funds").insert({ name: testName("centre"), restricted: false })).error).not.toBeNull();
    const cat = await newCategory();
    const { data } = await c.from("expense_categories").update({ active: false }).eq("id", cat.id).select("id");
    expect(data ?? []).toHaveLength(0);
    const { data: still } = await masterKeyClient().from("expense_categories").select("active").eq("id", cat.id).single();
    expect(still!.active).toBe(true);
  });

  it("names are unique however they are typed, and never empty", async () => {
    const c = await asRole("finance");
    const cat = await newCategory();
    expect((await c.from("expense_categories").insert({ name: ` ${cat.name.toUpperCase()} ` })).error?.message).toMatch(/already/i);
    expect((await c.from("expense_categories").insert({ name: "   " })).error).not.toBeNull();
    expect((await c.from("expense_funds").insert({ name: "zakat", restricted: true })).error?.message).toMatch(/already/i);
  });

  it("a fund's restricted tick cannot change once added", async () => {
    const fund = await newFund("finance", true);
    const { error } = await (await asRole("super_admin")).from("expense_funds").update({ restricted: false }).eq("id", fund.id);
    expect(error?.message).toMatch(/restricted.*cannot be changed/i);
  });

  it("nobody deletes a category, a fund or a setting, not even with the master key", async () => {
    const cat = await newCategory();
    const fund = await newFund();
    const m = masterKeyClient();
    expect((await m.from("expense_categories").delete().eq("id", cat.id)).error).not.toBeNull();
    expect((await m.from("expense_funds").delete().eq("id", fund.id)).error).not.toBeNull();
    expect((await m.from("app_settings").delete().eq("key", "second_approval_cents")).error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("the two amounts", () => {
  it("only a Super Admin changes them; it is in the audit log", async () => {
    const before = await settingCents("lost_receipt_second_cents");
    for (const role of ["centre_admin", "finance"]) {
      const { data } = await (await asRole(role)).from("app_settings").update({ amount_cents: before + 100 }).eq("key", "lost_receipt_second_cents").select("key");
      expect(data ?? [], role).toHaveLength(0);
    }
    expect(await settingCents("lost_receipt_second_cents")).toBe(before);

    const s = await asRole("super_admin");
    const { error } = await s.from("app_settings").update({ amount_cents: before + 100 }).eq("key", "lost_receipt_second_cents");
    expect(error).toBeNull();
    expect(await settingCents("lost_receipt_second_cents")).toBe(before + 100);
    const log = await masterKeyClient()
      .from("audit_log")
      .select("old_values, new_values")
      .eq("table_name", "app_settings")
      .eq("record_id", "lost_receipt_second_cents")
      .eq("action", "update")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(log.data!.old_values.amount_cents).toBe(before);
    expect(log.data!.new_values.amount_cents).toBe(before + 100);
    expect((await s.from("app_settings").update({ amount_cents: before }).eq("key", "lost_receipt_second_cents")).error).toBeNull();
  });

  it("no new setting can be invented, a key never changes, and the amount stays within €0 to €1,000,000", async () => {
    const s = await asRole("super_admin");
    expect((await s.from("app_settings").insert({ key: "made_up_cents", amount_cents: 1 })).error).not.toBeNull();
    expect((await masterKeyClient().from("app_settings").insert({ key: "made_up_cents", amount_cents: 1 })).error).not.toBeNull();
    expect((await s.from("app_settings").update({ key: "other_cents" }).eq("key", "second_approval_cents")).error).not.toBeNull();
    expect((await s.from("app_settings").update({ amount_cents: -1 }).eq("key", "second_approval_cents")).error).not.toBeNull();
    expect((await s.from("app_settings").update({ amount_cents: 100000001 }).eq("key", "second_approval_cents")).error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("is my account linked to my People record?", () => {
  it("a linked Centre Admin is told yes, with their name", async () => {
    const { data, error } = await (await asRole("centre_admin")).rpc("my_expense_link");
    expect(error).toBeNull();
    expect(data).toEqual([{ linked: true, person_name: "Test Centre Admin" }]);
  });

  it("the unlinked seed Super Admin is told no", async () => {
    const { data } = await (await asRole("super_admin")).rpc("my_expense_link");
    expect(data).toEqual([{ linked: false, person_name: null }]);
  });
});

// ---------------------------------------------------------------------------
describe("Finance and the asset register (read only)", () => {
  it("Finance reads the register rows and the place and category names, but still not the tables", async () => {
    const asset = await newFixedAsset("centre_admin");
    const f = await asRole("finance");
    const rows = await f.rpc("asset_register_rows").eq("id", asset.id);
    expect(rows.error).toBeNull();
    expect(rows.data).toHaveLength(1);
    expect(Object.keys(rows.data![0]).sort()).toEqual(
      ["category_id", "condition", "id", "label_serial", "location_id", "name", "purchase_date", "value_cents", "warranty_end"].sort(),
    );
    for (const [kind, id] of [["place", asset.location_id], ["category", asset.category_id]]) {
      const names = await f.rpc("asset_register_names").eq("kind", kind).eq("id", id);
      expect(names.error, kind).toBeNull();
      expect(names.data, kind).toHaveLength(1);
    }
    for (const table of ["items", "locations", "item_categories"]) {
      expect((await f.from(table).select("id").limit(1)).data ?? [], table).toHaveLength(0);
    }
  });

  it("the register leaves out disposed assets and consumables, as the admins' register does", async () => {
    const m = masterKeyClient();
    const { data: consumables } = await m.from("items").select("id").eq("kind", "consumable").limit(20);
    expect(consumables!.length).toBeGreaterThan(0);
    // A disposal of our own, approved by a different admin.
    const gone = await newFixedAsset("centre_admin");
    const req = await (await asRole("centre_admin"))
      .from("asset_events")
      .insert({ item_id: gone.id, kind: "disposal", disposal_route: "thrown_away", note: "Test note: made-up disposal", reported_by: "Test volunteer (fictional)" })
      .select("id")
      .single();
    if (req.error) throw req.error;
    const ok = await (await asRole("super_admin")).from("asset_events").update({ status: "approved" }).eq("id", req.data.id);
    if (ok.error) throw ok.error;
    const excluded = [...consumables!.map((x) => x.id), gone.id];
    const { data } = await (await asRole("finance")).rpc("asset_register_rows").in("id", excluded);
    expect(data).toHaveLength(0);
  });

  it("with a place, the register holds that place and everything inside it, and nothing else", async () => {
    const m = masterKeyClient();
    const asset = await newFixedAsset("centre_admin");
    const { data: room } = await m.from("locations").select("id, parent_id").eq("id", asset.location_id).single();
    const f = await asRole("finance");
    for (const place of [room!.id, room!.parent_id]) {
      if (!place) continue;
      const { data, error } = await f.rpc("asset_register_rows", { p_place: place }).eq("id", asset.id);
      expect(error).toBeNull();
      expect(data, place).toHaveLength(1);
    }
    const { data: elsewhere } = await m.from("locations").insert({ name: testName("empty building"), kind: "building" }).select("id").single();
    const { data: none } = await f.rpc("asset_register_rows", { p_place: elsewhere!.id });
    expect(none).toHaveLength(0);
  });

  it("Finance cannot change anything through the register", async () => {
    const asset = await newFixedAsset("centre_admin");
    const { data } = await (await asRole("finance")).from("items").update({ name: "changed by finance" }).eq("id", asset.id).select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
