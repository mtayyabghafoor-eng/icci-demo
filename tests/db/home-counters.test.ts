// Slice 9: home page counters (PLAN.md 5.7). The database works out each
// number, with the reader's own access rules, so these tests talk to it
// directly. Test files run one at a time, so "before and after" is safe.
//
// "Waiting for you" counts only what this admin may decide: never their own
// entry, never a stocktake they took part in (owner's choice, 15 Nov 2026).
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, passwordOnlyClient, signedInClient, signedOutClient, testName } from "./clients";
import { consumableFields, fixedAssetFields, idOf } from "./items-helpers";

type Counters = {
  low_stock: number;
  out_of_stock: number;
  damaged: number;
  missing: number;
  corrections_for_me: number;
  disposals_for_me: number;
  stocktake_diffs_for_me: number;
};

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);

async function counters(client: SupabaseClient): Promise<Counters> {
  const { data, error } = await client.rpc("home_counters").single<Counters>();
  if (error) throw error;
  return data!;
}

const note = { note: "Test note: made-up event", reported_by: "Test volunteer (fictional)" };

async function newConsumable(client: SupabaseClient, counted: number) {
  const { data, error } = await client.from("items").insert(await consumableFields({ minimum_level: 5 })).select().single();
  if (error) throw error;
  const m = await client.from("stock_movements").insert({ item_id: data.id, kind: "count", quantity: counted }).select().single();
  if (m.error) throw m.error;
  return { item: data as { id: string }, count: m.data as { id: number } };
}

async function newAsset(client: SupabaseClient, extra: Record<string, unknown> = {}) {
  const { data, error } = await client.from("items").insert(await fixedAssetFields(extra)).select().single();
  if (error) throw error;
  return data as { id: string; label_serial: string };
}

describe("home page counters: who can see them", () => {
  const refused = [
    { label: "a signed-out visitor", client: async () => signedOutClient() },
    { label: "finance", client: () => asRole("finance") },
    { label: "library_operator", client: () => asRole("library_operator") },
    { label: "a deactivated account", client: () => asRole("centre_admin", false) },
    { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
  ];
  for (const r of refused) {
    it(`${r.label} cannot see the counters`, async () => {
      const { data, error } = await (await r.client()).rpc("home_counters");
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can see the counters`, async () => {
      const c = await counters(await asRole(role));
      for (const v of Object.values(c)) expect(Number.isInteger(v) && v >= 0).toBe(true);
    });
  }
});

describe("home page counters: the numbers match the lists", () => {
  it("each counter equals what its list shows", async () => {
    const c = await asRole("centre_admin");
    const got = await counters(c);
    const [low, out, damaged, missing] = await Promise.all([
      c.from("stock_levels").select("item_id", { count: "exact", head: true }).in("status", ["low", "out"]),
      c.from("stock_levels").select("item_id", { count: "exact", head: true }).eq("status", "out"),
      c.from("items").select("id", { count: "exact", head: true }).eq("kind", "fixed_asset").eq("condition", "damaged"),
      c.from("items").select("id", { count: "exact", head: true }).eq("kind", "fixed_asset").eq("condition", "missing"),
    ]);
    expect(got.low_stock).toBe(low.count);
    expect(got.out_of_stock).toBe(out.count);
    expect(got.damaged).toBe(damaged.count);
    expect(got.missing).toBe(missing.count);
  });

  it("low stock and out of stock go up when a shelf is counted low or empty", async () => {
    const c = await asRole("centre_admin");
    const before = await counters(c);
    await newConsumable(c, 3); // at or below minimum 5: low
    await newConsumable(c, 0); // out
    await newConsumable(c, 9); // fine
    const after = await counters(c);
    expect(after.low_stock - before.low_stock).toBe(2);
    expect(after.out_of_stock - before.out_of_stock).toBe(1);
  });

  it("damaged and missing go up when an asset is reported", async () => {
    const c = await asRole("centre_admin");
    const a = await newAsset(c);
    const b = await newAsset(c);
    const before = await counters(c);
    for (const [item, kind] of [[a, "damage"], [b, "missing"]] as const) {
      const { error } = await c.from("asset_events").insert({ item_id: item.id, kind, ...note });
      if (error) throw error;
    }
    const after = await counters(c);
    expect(after.damaged - before.damaged).toBe(1);
    expect(after.missing - before.missing).toBe(1);
  });
});

describe("home page counters: waiting for you", () => {
  it("your own stock correction is not counted for you, but is for another admin", async () => {
    const me = await asRole("centre_admin");
    const other = await secondCentreAdmin();
    const { item, count } = await newConsumable(me, 7);
    const [mine0, other0] = [await counters(me), await counters(other)];
    const { error } = await me
      .from("stock_movements")
      .insert({ item_id: item.id, kind: "adjustment", corrects_id: count.id, quantity: 6, reason: "Test: typed the wrong number" });
    if (error) throw error;
    const [mine1, other1] = [await counters(me), await counters(other)];
    expect(mine1.corrections_for_me - mine0.corrections_for_me).toBe(0);
    expect(other1.corrections_for_me - other0.corrections_for_me).toBe(1);
  });

  it("your own disposal request is not counted for you, but is for another admin", async () => {
    const me = await asRole("centre_admin");
    const other = await secondCentreAdmin();
    const asset = await newAsset(me);
    const [mine0, other0] = [await counters(me), await counters(other)];
    const { error } = await me.from("asset_events").insert({ item_id: asset.id, kind: "disposal", disposal_route: "thrown_away", ...note });
    if (error) throw error;
    const [mine1, other1] = [await counters(me), await counters(other)];
    expect(mine1.disposals_for_me - mine0.disposals_for_me).toBe(0);
    expect(other1.disposals_for_me - other0.disposals_for_me).toBe(1);
  });

  it("stocktake differences count only for an admin who took no part in it", async () => {
    const starter = await asRole("centre_admin");
    const scanner = await secondCentreAdmin();
    const outsider = await asRole("super_admin");

    // A made-up room with one asset that will not be scanned (missing) and
    // one shelf counted at a different number.
    const add = async (name: string, kind: string, parent_id: string) => {
      const { data, error } = await starter.from("locations").insert({ name: testName(name), kind, parent_id }).select("id").single();
      if (error) throw error;
      return data.id as string;
    };
    const room = await add("counter room", "room", await idOf("locations", "Test Building A"));
    const shelf = await add("counter shelf", "shelf", await add("counter store room", "store_room", room));
    await newAsset(starter, { location_id: room });
    const { data: cons, error: ce } = await starter.from("items").insert(await consumableFields({ location_id: shelf })).select().single();
    if (ce) throw ce;
    await starter.from("stock_movements").insert({ item_id: cons.id, kind: "count", quantity: 10 });

    const { data: st, error: se } = await starter.from("stocktakes").insert({ location_id: room }).select().single();
    if (se) throw se;
    const sc = await scanner.from("stocktake_scans").insert({ stocktake_id: st.id, label_serial: cons.label_serial, found_quantity: 4 });
    if (sc.error) throw sc.error;

    const before = await Promise.all([starter, scanner, outsider].map(counters));
    const sent = await starter.rpc("submit_stocktake", { p_stocktake_id: st.id });
    if (sent.error) throw sent.error;
    const after = await Promise.all([starter, scanner, outsider].map(counters));

    expect(after[0].stocktake_diffs_for_me - before[0].stocktake_diffs_for_me).toBe(0); // started and sent it
    expect(after[1].stocktake_diffs_for_me - before[1].stocktake_diffs_for_me).toBe(0); // scanned in it
    expect(after[2].stocktake_diffs_for_me - before[2].stocktake_diffs_for_me).toBe(2); // took no part
  });
});
