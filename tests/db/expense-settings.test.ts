// Slice P5.1 (docs/PHASE-5.md, owner approved 25 Nov 2026): the lists and
// settings that expense claims are built on, and Finance's read-only asset
// register.
//   * Spend categories and funds: everyone who handles claims (Super Admin,
//     Centre Admin, Finance) reads them; only Super Admin and Finance add,
//     rename or switch them off. Never deleted. A fund's "restricted" tick is
//     fixed once it is added.
//   * The two amounts (second approval above €500, lost receipt above €50):
//     the same three roles read them; a Super Admin asks for a change and a
//     different Super Admin confirms it (migration 0052); no new settings can
//     be invented, and every change is in the audit log.
//   * A category or fund name is locked once used on a claim (0052).
//   * "Is my account linked to my People record?" (needed to approve, 2A).
//   * Finance gets the asset register through two narrow look-ups, and still
//     cannot read the items or places tables themselves.
// Signed-out visitors, the Library Operator, a switched-off account and a
// password-only sign-in get nothing.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";
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

  // Security review 26 Nov 2026, finding 2 (migration 0052): a name used on
  // a claim never changes, so earlier months' files stay as they were.
  it("once a category or fund is used on a claim, its name is locked; switching it off still works", async () => {
    const cat = await newCategory();
    const fund = await newFund();
    const m = masterKeyClient();
    const { error: claimError } = await m.rpc("enter_expense_claim", {
      p_amount_cents: 1234,
      p_receipt_date: new Date().toISOString().slice(0, 10),
      p_category_id: cat.id,
      p_description: "Test note: made-up claim for the name lock",
      p_payment: "centre_direct",
      p_suggested_fund_id: fund.id,
      p_receipt_lost_reason: "Test note: made-up lost receipt",
    });
    expect(claimError).toBeNull();
    for (const role of LIST_KEEPERS) {
      const c = await asRole(role);
      expect((await c.from("expense_categories").update({ name: testName("new name") }).eq("id", cat.id)).error?.message, role).toMatch(/already used.*switch it off/i);
      expect((await c.from("expense_funds").update({ name: testName("new name") }).eq("id", fund.id)).error?.message, role).toMatch(/already used.*switch it off/i);
    }
    expect((await m.from("expense_funds").update({ name: testName("master") }).eq("id", fund.id)).error?.message).toMatch(/already used/i);
    const f = await asRole("finance");
    expect((await f.from("expense_categories").update({ active: false }).eq("id", cat.id)).error).toBeNull();
    expect((await f.from("expense_funds").update({ active: false }).eq("id", fund.id)).error).toBeNull();
  });

  it("the starting Zakat fund, once on a claim, cannot be renamed", async () => {
    const m = masterKeyClient();
    const zakat = (await m.from("expense_funds").select("id").eq("name", "Zakat").single()).data!.id;
    const { data } = await m.from("expense_entries").select("id").eq("fund_id", zakat).limit(1);
    expect(data, "the seed puts Zakat on some claims").toHaveLength(1);
    const { error } = await (await asRole("finance")).from("expense_funds").update({ name: "General" }).eq("id", zakat);
    expect(error?.message).toMatch(/already used/i);
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
// Security review 26 Nov 2026, finding 1 (migration 0052): one Super Admin
// asks for a new amount; it takes effect only when a different Super Admin
// confirms it. Nobody changes an amount directly any more.
const SUPER_TWO = "super.two@icci-prototype.test";
const KEY = "lost_receipt_second_cents";

async function askFor(amount: number, role = "super_admin") {
  const { data, error } = await (await asRole(role)).from("app_setting_changes").insert({ key: KEY, amount_cents: amount }).select().single();
  if (error) throw new Error(error.message);
  return data as { id: number; status: string; amount_cents: number };
}

async function changeStatus(client: Awaited<ReturnType<typeof asRole>>, id: number, status: string, note?: string) {
  return client.from("app_setting_changes").update({ status, ...(note ? { note } : {}) }).eq("id", id).select("id, status");
}

describe("the two amounts", () => {
  it("nobody changes an amount directly, not even a Super Admin", async () => {
    const before = await settingCents(KEY);
    for (const role of ["super_admin", "centre_admin", "finance"]) {
      const { data } = await (await asRole(role)).from("app_settings").update({ amount_cents: before + 100 }).eq("key", KEY).select("key");
      expect(data ?? [], role).toHaveLength(0);
    }
    const two = await signedInClient(SUPER_TWO);
    expect((await two.from("app_settings").update({ amount_cents: before + 100 }).eq("key", KEY).select("key")).data ?? []).toHaveLength(0);
    expect(await settingCents(KEY)).toBe(before);
  });

  it("a Super Admin asks, cannot confirm their own request, and a second Super Admin confirms it; it is in the audit log", async () => {
    const before = await settingCents(KEY);
    const ask = await askFor(before + 100);
    expect(ask.status).toBe("waiting");
    expect(await settingCents(KEY)).toBe(before);

    const own = await changeStatus(await asRole("super_admin"), ask.id, "confirmed");
    expect(own.error?.message).toMatch(/different Super Admin/i);
    expect(await settingCents(KEY)).toBe(before);
    for (const role of ["centre_admin", "finance"]) {
      const { data } = await changeStatus(await asRole(role), ask.id, "confirmed");
      expect(data ?? [], role).toHaveLength(0);
    }

    const ok = await changeStatus(await signedInClient(SUPER_TWO), ask.id, "confirmed");
    expect(ok.error).toBeNull();
    expect(await settingCents(KEY)).toBe(before + 100);
    const log = await masterKeyClient()
      .from("audit_log")
      .select("old_values, new_values")
      .eq("table_name", "app_settings")
      .eq("record_id", KEY)
      .eq("action", "update")
      .order("id", { ascending: false })
      .limit(1)
      .single();
    expect(log.data!.old_values.amount_cents).toBe(before);
    expect(log.data!.new_values.amount_cents).toBe(before + 100);
    const { data: row } = await masterKeyClient().from("app_setting_changes").select("decided_by, decided_at").eq("id", ask.id).single();
    expect(row!.decided_by).toBe(userIdOf(SUPER_TWO));
    expect(row!.decided_at).not.toBeNull();

    // A decided request never changes again.
    expect((await changeStatus(await signedInClient(SUPER_TWO), ask.id, "turned_down")).error?.message).toMatch(/already/i);
    // Put the amount back for the other tests (the master key, as the seed does).
    expect((await masterKeyClient().from("app_settings").update({ amount_cents: before }).eq("key", KEY)).error).toBeNull();
  });

  it("only one request waits per amount; the asker cancels it, nobody else can; a second Super Admin may turn one down", async () => {
    const before = await settingCents(KEY);
    const ask = await askFor(before + 200);
    await expect(askFor(before + 300)).rejects.toThrow(/already waiting/i);
    expect((await changeStatus(await signedInClient(SUPER_TWO), ask.id, "cancelled")).error?.message).toMatch(/only the person who asked/i);
    expect((await changeStatus(await asRole("super_admin"), ask.id, "cancelled")).error).toBeNull();

    const second = await askFor(before + 400);
    expect((await changeStatus(await asRole("super_admin"), second.id, "turned_down", "Not agreed")).error?.message).toMatch(/different Super Admin/i);
    expect((await changeStatus(await signedInClient(SUPER_TWO), second.id, "turned_down", "Not agreed")).error).toBeNull();
    expect(await settingCents(KEY)).toBe(before);
  });

  it("a request cannot be bent: not the same amount, not already decided, not a different amount on confirming", async () => {
    const before = await settingCents(KEY);
    await expect(askFor(before)).rejects.toThrow(/already/i);
    const s = await asRole("super_admin");
    expect((await s.from("app_setting_changes").insert({ key: KEY, amount_cents: before + 1, status: "confirmed" })).error).not.toBeNull();
    expect((await s.from("app_setting_changes").insert({ key: "made_up_cents", amount_cents: 1 })).error).not.toBeNull();
    expect((await s.from("app_setting_changes").insert({ key: KEY, amount_cents: 100000001 })).error).not.toBeNull();
    const ask = await askFor(before + 500);
    const bent = await (await signedInClient(SUPER_TWO)).from("app_setting_changes").update({ status: "confirmed", amount_cents: 100000000 }).eq("id", ask.id);
    expect(bent.error?.message).toMatch(/never changes/i);
    expect(await settingCents(KEY)).toBe(before);
    expect((await masterKeyClient().from("app_setting_changes").delete().eq("id", ask.id)).error).not.toBeNull();
    expect((await changeStatus(s, ask.id, "cancelled")).error).toBeNull();
  });

  it("Centre Admin and Finance read waiting requests but cannot ask; signed-out and the others see none", async () => {
    const before = await settingCents(KEY);
    const ask = await askFor(before + 600);
    for (const role of ["centre_admin", "finance"]) {
      const c = await asRole(role);
      expect((await c.from("app_setting_changes").select("id").eq("id", ask.id)).data, role).toHaveLength(1);
      expect((await c.from("app_setting_changes").insert({ key: "second_approval_cents", amount_cents: 1 })).error, role).not.toBeNull();
    }
    for (const who of noAccess) {
      const c = await who.client();
      expect((await c.from("app_setting_changes").select("id").limit(3)).data ?? [], who.label).toHaveLength(0);
      expect((await c.from("app_setting_changes").insert({ key: KEY, amount_cents: 1 })).error, who.label).not.toBeNull();
    }
    expect((await changeStatus(await asRole("super_admin"), ask.id, "cancelled")).error).toBeNull();
  });

  it("no new setting can be invented, a key never changes, and the amount stays within €0 to €1,000,000", async () => {
    const s = await asRole("super_admin");
    const m = masterKeyClient();
    expect((await s.from("app_settings").insert({ key: "made_up_cents", amount_cents: 1 })).error).not.toBeNull();
    expect((await m.from("app_settings").insert({ key: "made_up_cents", amount_cents: 1 })).error).not.toBeNull();
    expect((await m.from("app_settings").update({ key: "other_cents" }).eq("key", "second_approval_cents")).error).not.toBeNull();
    expect((await m.from("app_settings").update({ amount_cents: -1 }).eq("key", "second_approval_cents")).error).not.toBeNull();
    expect((await m.from("app_settings").update({ amount_cents: 100000001 }).eq("key", "second_approval_cents")).error).not.toBeNull();
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
