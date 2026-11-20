// Slice 8: stocktake (PLAN.md 5.1): scan everything in one room, list what was
// expected but not found, and turn differences into entries that a DIFFERENT
// admin approves one by one (owner's choice, 15 Nov 2026).
// All of it is enforced by the database itself, so these tests talk to it directly.
//
// Every test builds its own made-up room (with a store room and a shelf), so
// other test runs' items never get in the way.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";
import { consumableFields, fixedAssetFields, idOf, newLabel } from "./items-helpers";

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

type Stocktake = { id: number; location_id: string; status: string; created_by: string; submitted_by: string | null };
type Difference = {
  id: number;
  stocktake_id: number;
  item_id: string;
  kind: "missing" | "move_here" | "quantity" | "found";
  expected_location_id: string | null;
  expected_quantity: number | null;
  found_quantity: number | null;
  status: string;
};

/** A new made-up room with one store room and one shelf inside it. */
async function newRoom() {
  const c = await asRole("centre_admin");
  const add = async (name: string, kind: string, parent_id: string) => {
    const { data, error } = await c.from("locations").insert({ name: testName(name), kind, parent_id }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };
  const room = await add("stocktake room", "room", await idOf("locations", "Test Building A"));
  const storeRoom = await add("stocktake store room", "store_room", room);
  const shelf = await add("stocktake shelf", "shelf", storeRoom);
  return { room, storeRoom, shelf };
}

async function newAsset(location_id: string) {
  const { data, error } = await (await asRole("centre_admin")).from("items").insert(await fixedAssetFields({ location_id })).select().single();
  if (error) throw error;
  return data as { id: string; label_serial: string; location_id: string };
}

async function newConsumable(location_id: string, counted?: number) {
  const c = await asRole("centre_admin");
  const { data, error } = await c.from("items").insert(await consumableFields({ location_id })).select().single();
  if (error) throw error;
  if (counted !== undefined) {
    const m = await c.from("stock_movements").insert({ item_id: data.id, kind: "count", quantity: counted });
    if (m.error) throw m.error;
  }
  return data as { id: string; label_serial: string };
}

async function start(client: SupabaseClient, location_id: string) {
  return client.from("stocktakes").insert({ location_id }).select().single<Stocktake>();
}
async function mustStart(client: SupabaseClient, location_id: string) {
  const { data, error } = await start(client, location_id);
  if (error) throw error;
  return data!;
}

async function scan(client: SupabaseClient, stocktake_id: number, label_serial: string, found_quantity?: number) {
  return client
    .from("stocktake_scans")
    .insert({ stocktake_id, label_serial, ...(found_quantity === undefined ? {} : { found_quantity }) })
    .select()
    .single();
}
async function mustScan(client: SupabaseClient, stocktake_id: number, label_serial: string, found_quantity?: number) {
  const { data, error } = await scan(client, stocktake_id, label_serial, found_quantity);
  if (error) throw error;
  return data!;
}

async function submit(client: SupabaseClient, stocktake_id: number) {
  return client.rpc("submit_stocktake", { p_stocktake_id: stocktake_id });
}

async function differences(stocktake_id: number): Promise<Difference[]> {
  const { data, error } = await masterKeyClient().from("stocktake_differences").select("*").eq("stocktake_id", stocktake_id).order("id");
  if (error) throw error;
  return data as Difference[];
}

function decide(
  client: SupabaseClient,
  d: Difference,
  status: "approved" | "rejected",
  decision_note?: string,
  found_condition?: "good" | "fair" | "damaged",
) {
  return client
    .from("stocktake_differences")
    .update({ status, ...(decision_note ? { decision_note } : {}), ...(found_condition ? { found_condition } : {}) })
    .eq("id", d.id)
    .select();
}

async function markMissing(item_id: string) {
  const { error } = await (await asRole("centre_admin"))
    .from("asset_events")
    .insert({ item_id, kind: "missing", note: "Test: made-up report", reported_by: "Test volunteer (fictional)" });
  if (error) throw error;
}

async function itemNow(id: string) {
  const { data, error } = await masterKeyClient().from("items").select("location_id, condition").eq("id", id).single();
  if (error) throw error;
  return data as { location_id: string; condition: string };
}

async function stockNow(item_id: string) {
  const { data, error } = await masterKeyClient().from("stock_levels").select("quantity").eq("item_id", item_id).single();
  if (error) throw error;
  return data.quantity as number | null;
}

/** A room with one asset that is seen, one that is not, and a shelf counted wrong. */
async function submittedStocktake(by = "centre_admin") {
  const { room, shelf } = await newRoom();
  const seen = await newAsset(room);
  const notSeen = await newAsset(room);
  const shelfItem = await newConsumable(shelf, 10);
  const c = await asRole(by);
  const st = await mustStart(c, room);
  await mustScan(c, st.id, seen.label_serial);
  await mustScan(c, st.id, shelfItem.label_serial, 7);
  const { error } = await submit(c, st.id);
  if (error) throw error;
  return { room, shelf, seen, notSeen, shelfItem, st, diffs: await differences(st.id) };
}

// ---------------------------------------------------------------------------
describe("who can see and run a stocktake", () => {
  for (const who of noAccess) {
    it(`${who.label} sees no stocktakes, scans or differences`, async () => {
      await submittedStocktake();
      const c = await who.client();
      for (const table of ["stocktakes", "stocktake_scans", "stocktake_differences"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
    });

    it(`${who.label} cannot start, scan, finish or approve a stocktake`, async () => {
      const { room } = await newRoom();
      const asset = await newAsset(room);
      const c = await who.client();
      expect((await start(c, room)).error).not.toBeNull();

      const st = await mustStart(await asRole("centre_admin"), room);
      expect((await scan(c, st.id, asset.label_serial)).error).not.toBeNull();
      expect((await submit(c, st.id)).error).not.toBeNull();

      const done = await submittedStocktake();
      for (const d of done.diffs) {
        const { data } = await decide(c, d, "approved");
        expect(data ?? []).toHaveLength(0);
      }
      expect((await differences(done.st.id)).every((d) => d.status === "pending")).toBe(true);
      expect((await itemNow(done.notSeen.id)).condition).toBe("good");
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can start a stocktake, scan and send it for approval`, async () => {
      const { diffs, st } = await submittedStocktake(role);
      const { data } = await (await asRole(role)).from("stocktakes").select("status, submitted_by").eq("id", st.id).single();
      expect(data).toEqual({ status: "submitted", submitted_by: userIdOf(seedAdmin(role).email) });
      expect(diffs.map((d) => d.kind).sort()).toEqual(["missing", "quantity"]);
    });
  }
});

// ---------------------------------------------------------------------------
describe("starting and pausing a stocktake", () => {
  it("is for a room only, not a building, store room or shelf", async () => {
    const { storeRoom, shelf } = await newRoom();
    const c = await asRole("centre_admin");
    for (const loc of [await idOf("locations", "Test Building A"), storeRoom, shelf]) {
      expect((await start(c, loc)).error?.message).toMatch(/room/i);
    }
  });

  it("allows only one unfinished stocktake per room, which can be picked up again later", async () => {
    const { room } = await newRoom();
    const asset = await newAsset(room);
    const st = await mustStart(await asRole("centre_admin"), room);
    const again = await start(await secondCentreAdmin(), room);
    expect(again.error?.message).toMatch(/already/i);
    // Another admin can carry on scanning the same one.
    await mustScan(await secondCentreAdmin(), st.id, asset.label_serial);
  });

  it("cannot be marked finished by typing over it, only by sending it for approval", async () => {
    const { room } = await newRoom();
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    const { data } = await c.from("stocktakes").update({ status: "submitted" }).eq("id", st.id).select();
    expect(data ?? []).toHaveLength(0);
    const m = await masterKeyClient().from("stocktakes").update({ status: "submitted" }).eq("id", st.id);
    expect(m.error).not.toBeNull();
  });

  it("cannot be sent for approval with nothing scanned (that would mark everything missing)", async () => {
    const { room } = await newRoom();
    await newAsset(room);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    expect((await submit(c, st.id)).error?.message).toMatch(/nothing.*scanned|scan/i);
  });

  it("takes no more scans and cannot be sent twice once it is sent", async () => {
    const { st, seen } = await submittedStocktake();
    const c = await asRole("centre_admin");
    expect((await scan(c, st.id, seen.label_serial)).error?.message).toMatch(/sent|finished/i);
    expect((await submit(c, st.id)).error?.message).toMatch(/sent|finished/i);
  });

  it("starts with no decision and cannot be started already finished", async () => {
    const { room } = await newRoom();
    const c = await asRole("centre_admin");
    const { error } = await c.from("stocktakes").insert({ location_id: room, status: "submitted" });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("scanning", () => {
  it("fills in the item from the label, so it cannot be faked", async () => {
    const { room } = await newRoom();
    const asset = await newAsset(room);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    const other = await newAsset(room);
    const { data, error } = await c
      .from("stocktake_scans")
      .insert({ stocktake_id: st.id, label_serial: asset.label_serial, item_id: other.id })
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.item_id).toBe(asset.id);
  });

  it("a shelf needs the quantity found; an asset must not have one", async () => {
    const { room, shelf } = await newRoom();
    const asset = await newAsset(room);
    const item = await newConsumable(shelf);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    expect((await scan(c, st.id, item.label_serial)).error?.message).toMatch(/quantity|how many/i);
    expect((await scan(c, st.id, item.label_serial, -1)).error).not.toBeNull();
    expect((await scan(c, st.id, asset.label_serial, 3)).error).not.toBeNull();
  });

  it("refuses a shelf from another room (consumables are not moved)", async () => {
    const { room } = await newRoom();
    const elsewhere = await newRoom();
    const item = await newConsumable(elsewhere.shelf);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    expect((await scan(c, st.id, item.label_serial, 4)).error?.message).toMatch(/another room|not moved/i);
  });

  it("refuses a disposed asset and a number that is not an ICCI label", async () => {
    const { room } = await newRoom();
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    expect((await scan(c, st.id, "ICCI-999998")).error).not.toBeNull();
    expect((await scan(c, st.id, "not a label")).error).not.toBeNull();
  });

  it("records a label with no item on it as 'unknown label found', with no item", async () => {
    const { room } = await newRoom();
    const label = await newLabel();
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    const s = await mustScan(c, st.id, label);
    expect(s.item_id).toBeNull();
  });

  it("scans cannot be changed or deleted, even with the master key", async () => {
    const { room } = await newRoom();
    const asset = await newAsset(room);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    const s = await mustScan(c, st.id, asset.label_serial);
    const m = masterKeyClient();
    expect((await m.from("stocktake_scans").update({ found_quantity: 3 }).eq("id", s.id)).error).not.toBeNull();
    expect((await m.from("stocktake_scans").delete().eq("id", s.id)).error).not.toBeNull();
    expect((await m.from("stocktakes").delete().eq("id", st.id)).error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("finding the differences", () => {
  it("lists assets expected in the room (or its store rooms and shelves) but not scanned as missing", async () => {
    const { room, storeRoom } = await newRoom();
    const seen = await newAsset(room);
    const notSeen = await newAsset(storeRoom);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, seen.label_serial);
    expect((await submit(c, st.id)).error).toBeNull();
    const diffs = await differences(st.id);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ kind: "missing", item_id: notSeen.id, expected_location_id: storeRoom, status: "pending" });
    // Nothing changes until a different admin approves.
    expect((await itemNow(notSeen.id)).condition).toBe("good");
  });

  it("an asset found here that belongs elsewhere becomes 'move here'", async () => {
    const { room } = await newRoom();
    const elsewhere = await newRoom();
    const stray = await newAsset(elsewhere.room);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, stray.label_serial);
    await submit(c, st.id);
    const diffs = await differences(st.id);
    expect(diffs).toEqual([expect.objectContaining({ kind: "move_here", item_id: stray.id, expected_location_id: elsewhere.room })]);
    expect((await itemNow(stray.id)).location_id).toBe(elsewhere.room);
  });

  it("a shelf counted at a different number becomes a quantity difference; a matching one does not", async () => {
    const { room, shelf } = await newRoom();
    const wrong = await newConsumable(shelf, 10);
    const right = await newConsumable(shelf, 4);
    const never = await newConsumable(shelf);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, wrong.label_serial, 6);
    await mustScan(c, st.id, right.label_serial, 4);
    await mustScan(c, st.id, never.label_serial, 9);
    await submit(c, st.id);
    const diffs = await differences(st.id);
    expect(diffs).toHaveLength(2);
    expect(diffs).toContainEqual(expect.objectContaining({ kind: "quantity", item_id: wrong.id, expected_quantity: 10, found_quantity: 6 }));
    expect(diffs).toContainEqual(expect.objectContaining({ kind: "quantity", item_id: never.id, expected_quantity: null, found_quantity: 9 }));
    expect(await stockNow(wrong.id)).toBe(10);
  });

  it("when a shelf is scanned twice, the latest number counts", async () => {
    const { room, shelf } = await newRoom();
    const item = await newConsumable(shelf, 10);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, item.label_serial, 3);
    await mustScan(c, st.id, item.label_serial, 10);
    await submit(c, st.id);
    expect(await differences(st.id)).toHaveLength(0);
  });

  it("an asset already marked missing, or disposed, is not listed as missing again", async () => {
    const { room } = await newRoom();
    const seen = await newAsset(room);
    const gone = await newAsset(room);
    const c = await asRole("centre_admin");
    const ev = await c.from("asset_events").insert({ item_id: gone.id, kind: "missing", note: "Test: made up", reported_by: "Test volunteer" });
    if (ev.error) throw ev.error;
    const st = await mustStart(c, room);
    await mustScan(c, st.id, seen.label_serial);
    await submit(c, st.id);
    expect(await differences(st.id)).toHaveLength(0);
  });

  it("the preview before sending lists exactly what sending saves, and changes nothing", async () => {
    const { room, shelf } = await newRoom();
    const seen = await newAsset(room);
    const notSeen = await newAsset(room);
    const item = await newConsumable(shelf, 10);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, seen.label_serial);
    await mustScan(c, st.id, item.label_serial, 8);
    const { data: preview, error } = await c.rpc("stocktake_preview", { p_stocktake_id: st.id });
    expect(error).toBeNull();
    expect(await differences(st.id)).toHaveLength(0);
    const { data: still } = await c.from("stocktakes").select("status").eq("id", st.id).single();
    expect(still!.status).toBe("open");
    await submit(c, st.id);
    const key = (r: { item_id: string; kind: string }) => `${r.kind}:${r.item_id}`;
    expect((preview as Difference[]).map(key).sort()).toEqual((await differences(st.id)).map(key).sort());
    expect((preview as Difference[]).map(key)).toContain(`missing:${notSeen.id}`);
  });

  it("only admins can see the preview", async () => {
    const { room } = await newRoom();
    const asset = await newAsset(room);
    const st = await mustStart(await asRole("centre_admin"), room);
    await mustScan(await asRole("centre_admin"), st.id, asset.label_serial);
    for (const who of noAccess) {
      const { data, error } = await (await who.client()).rpc("stocktake_preview", { p_stocktake_id: st.id });
      expect(error ?? (data as unknown[]).length === 0 ? "refused" : "shown", who.label).toBe("refused");
    }
  });

  it("differences cannot be added or changed by hand, even with the master key", async () => {
    const { diffs, st, seen } = await submittedStocktake();
    const c = await asRole("centre_admin");
    const add = await c.from("stocktake_differences").insert({ stocktake_id: st.id, item_id: seen.id, kind: "missing" });
    expect(add.error).not.toBeNull();
    const m = masterKeyClient();
    expect((await m.from("stocktake_differences").update({ found_quantity: 1 }).eq("id", diffs[0].id)).error).not.toBeNull();
    expect((await m.from("stocktake_differences").delete().eq("id", diffs[0].id)).error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("approving the differences", () => {
  it("nobody can approve or reject a difference from their own stocktake", async () => {
    const { diffs } = await submittedStocktake("centre_admin");
    const c = await asRole("centre_admin");
    for (const d of diffs) {
      const { error, data } = await decide(c, d, "approved");
      expect(error?.message ?? (data?.length === 0 ? "no rows" : "")).toMatch(/different admin|no rows/i);
    }
    const rej = await decide(c, diffs[0], "rejected", "Test reason");
    expect(rej.error?.message).toMatch(/different admin/i);
    expect((await differences(diffs[0].stocktake_id)).every((d) => d.status === "pending")).toBe(true);
  });

  it("someone who scanned in the stocktake cannot approve it either", async () => {
    const { room } = await newRoom();
    const a = await newAsset(room);
    const b = await newAsset(room);
    await newAsset(room); // never scanned: missing
    const st = await mustStart(await asRole("centre_admin"), room);
    await mustScan(await asRole("centre_admin"), st.id, a.label_serial);
    await mustScan(await secondCentreAdmin(), st.id, b.label_serial);
    await submit(await asRole("centre_admin"), st.id);
    const [d] = await differences(st.id);
    const { error } = await decide(await secondCentreAdmin(), d, "approved");
    expect(error?.message).toMatch(/different admin/i);
    expect((await decide(await asRole("super_admin"), d, "approved")).error).toBeNull();
  });

  it("approving 'missing' marks the asset missing, with an entry in its history", async () => {
    const { diffs, notSeen } = await submittedStocktake();
    const d = diffs.find((x) => x.kind === "missing")!;
    const { error } = await decide(await secondCentreAdmin(), d, "approved");
    expect(error).toBeNull();
    expect((await itemNow(notSeen.id)).condition).toBe("missing");
    const { data } = await masterKeyClient().from("asset_events").select("kind, stocktake_difference_id").eq("item_id", notSeen.id);
    expect(data).toEqual([{ kind: "missing", stocktake_difference_id: d.id }]);
  });

  it("approving 'move here' moves the asset into the stocktake's room", async () => {
    const { room } = await newRoom();
    const elsewhere = await newRoom();
    const stray = await newAsset(elsewhere.room);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, stray.label_serial);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    expect((await decide(await secondCentreAdmin(), d, "approved")).error).toBeNull();
    expect((await itemNow(stray.id)).location_id).toBe(room);
  });

  it("rejecting needs a reason and changes nothing", async () => {
    const { diffs, notSeen, shelfItem } = await submittedStocktake();
    const approver = await secondCentreAdmin();
    for (const d of diffs) {
      expect((await decide(approver, d, "rejected")).error?.message).toMatch(/reason/i);
      expect((await decide(approver, d, "rejected", "Test: it was in the car park")).error).toBeNull();
    }
    expect((await itemNow(notSeen.id)).condition).toBe("good");
    expect(await stockNow(shelfItem.id)).toBe(10);
  });

  it("each difference is decided on its own, and a decision is final", async () => {
    const { diffs, notSeen, shelfItem } = await submittedStocktake();
    const approver = await secondCentreAdmin();
    const missing = diffs.find((d) => d.kind === "missing")!;
    const qty = diffs.find((d) => d.kind === "quantity")!;
    expect((await decide(approver, missing, "rejected", "Test: found it later")).error).toBeNull();
    expect((await decide(approver, qty, "approved")).error).toBeNull();
    expect((await itemNow(notSeen.id)).condition).toBe("good");
    expect(await stockNow(shelfItem.id)).toBe(7);
    // Already decided: no change either way.
    const again = await decide(await asRole("super_admin"), missing, "approved");
    expect(again.data ?? []).toHaveLength(0);
    expect((await itemNow(notSeen.id)).condition).toBe("good");
  });

  it("the master key cannot approve without a signed-in admin", async () => {
    const { diffs } = await submittedStocktake();
    const { error } = await masterKeyClient().from("stocktake_differences").update({ status: "approved" }).eq("id", diffs[0].id);
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Audit fix 1 (15 Nov 2026): an asset marked missing that turns up in a
// stocktake was ignored. It now becomes a "found" difference.
describe("an asset marked missing that is scanned in a stocktake", () => {
  it("becomes a 'found' difference, in the preview and when sent", async () => {
    const { room } = await newRoom();
    const lost = await newAsset(room);
    await markMissing(lost.id);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, lost.label_serial);
    const { data: preview } = await c.rpc("stocktake_preview", { p_stocktake_id: st.id });
    expect(preview).toEqual([expect.objectContaining({ kind: "found", item_id: lost.id, expected_location_id: room })]);
    expect((await submit(c, st.id)).error).toBeNull();
    expect(await differences(st.id)).toEqual([
      expect.objectContaining({ kind: "found", item_id: lost.id, expected_location_id: room, status: "pending" }),
    ]);
    expect((await itemNow(lost.id)).condition).toBe("missing");
  });

  it("approving it needs the condition it is in now (good or fair), then brings it back", async () => {
    const { room } = await newRoom();
    const lost = await newAsset(room);
    await markMissing(lost.id);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, lost.label_serial);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    const approver = await secondCentreAdmin();
    expect((await decide(approver, d, "approved")).error?.message).toMatch(/good or fair/i);
    expect((await decide(approver, d, "approved", undefined, "damaged")).error).not.toBeNull();
    expect((await decide(approver, d, "approved", undefined, "fair")).error).toBeNull();
    expect(await itemNow(lost.id)).toEqual({ location_id: room, condition: "fair" });
    const { data } = await masterKeyClient()
      .from("asset_events")
      .select("kind, to_condition, stocktake_difference_id")
      .eq("item_id", lost.id)
      .order("id");
    expect(data!.at(-1)).toEqual({ kind: "back_in_use", to_condition: "fair", stocktake_difference_id: d.id });
  });

  it("found in a different room: approving brings it back and moves it here", async () => {
    const { room } = await newRoom();
    const elsewhere = await newRoom();
    const lost = await newAsset(elsewhere.room);
    await markMissing(lost.id);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, lost.label_serial);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    expect(d).toMatchObject({ kind: "found", expected_location_id: elsewhere.room });
    expect((await decide(await secondCentreAdmin(), d, "approved", undefined, "good")).error).toBeNull();
    expect(await itemNow(lost.id)).toEqual({ location_id: room, condition: "good" });
    const { data } = await masterKeyClient().from("asset_events").select("kind").eq("stocktake_difference_id", d.id).order("id");
    expect(data!.map((e) => e.kind)).toEqual(["back_in_use", "move"]);
  });

  it("rejecting needs a reason and leaves it missing; other kinds take no condition", async () => {
    const { room } = await newRoom();
    const lost = await newAsset(room);
    await markMissing(lost.id);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, lost.label_serial);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    expect((await decide(await secondCentreAdmin(), d, "rejected", "Test: label was moved to a spare chair")).error).toBeNull();
    expect((await itemNow(lost.id)).condition).toBe("missing");

    const other = await submittedStocktake();
    const missing = other.diffs.find((x) => x.kind === "missing")!;
    expect((await decide(await secondCentreAdmin(), missing, "approved", undefined, "good")).error?.message).toMatch(/only.*found/i);
  });
});

// ---------------------------------------------------------------------------
// Audit fix 2 (15 Nov 2026): a difference approved late could act on facts
// that changed after the stocktake was sent. Approving is now refused, with
// a sentence saying why; rejecting still works.
describe("a difference that is out of date by the time it is approved", () => {
  it("'missing' is refused if the asset was moved or reported after the stocktake was sent", async () => {
    const { diffs, notSeen } = await submittedStocktake();
    const d = diffs.find((x) => x.kind === "missing")!;
    const elsewhere = await newRoom();
    const moved = await (await asRole("super_admin"))
      .from("asset_events")
      .insert({ item_id: notSeen.id, kind: "move", to_location_id: elsewhere.room, note: "Test: moved", reported_by: "Test volunteer" });
    if (moved.error) throw moved.error;
    const approver = await secondCentreAdmin();
    expect((await decide(approver, d, "approved")).error?.message).toMatch(/changed since the stocktake was sent/i);
    expect(await itemNow(notSeen.id)).toEqual({ location_id: elsewhere.room, condition: "good" });
    expect((await decide(approver, d, "rejected", "Test: it had been moved")).error).toBeNull();
  });

  it("'move here' is refused if the asset was moved somewhere else in the meantime", async () => {
    const { room } = await newRoom();
    const elsewhere = await newRoom();
    const third = await newRoom();
    const stray = await newAsset(elsewhere.room);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, stray.label_serial);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    const moved = await c
      .from("asset_events")
      .insert({ item_id: stray.id, kind: "move", to_location_id: third.room, note: "Test: moved", reported_by: "Test volunteer" });
    if (moved.error) throw moved.error;
    expect((await decide(await secondCentreAdmin(), d, "approved")).error?.message).toMatch(/changed since the stocktake was sent/i);
    expect((await itemNow(stray.id)).location_id).toBe(third.room);
  });

  it("is refused while a disposal of the asset waits for approval", async () => {
    const { diffs, notSeen } = await submittedStocktake();
    const d = diffs.find((x) => x.kind === "missing")!;
    const disposal = await (await asRole("super_admin"))
      .from("asset_events")
      .insert({ item_id: notSeen.id, kind: "disposal", note: "Test: broken", reported_by: "Test volunteer", disposal_route: "thrown_away" });
    if (disposal.error) throw disposal.error;
    expect((await decide(await secondCentreAdmin(), d, "approved")).error?.message).toMatch(/disposal.*waiting/i);
    expect((await itemNow(notSeen.id)).condition).toBe("good");
  });

  it("'found' is refused if the asset was already found another way", async () => {
    const { room } = await newRoom();
    const lost = await newAsset(room);
    await markMissing(lost.id);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, lost.label_serial);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    const back = await (await asRole("super_admin"))
      .from("asset_events")
      .insert({ item_id: lost.id, kind: "back_in_use", to_condition: "good", note: "Test: found", reported_by: "Test volunteer" });
    if (back.error) throw back.error;
    expect((await decide(await secondCentreAdmin(), d, "approved", undefined, "fair")).error?.message).toMatch(
      /changed since the stocktake was sent/i,
    );
    expect((await itemNow(lost.id)).condition).toBe("good");
  });
});

// ---------------------------------------------------------------------------
describe("stock arithmetic for approved differences", () => {
  async function oneShelf(counted: number | undefined, found: number) {
    const { room, shelf } = await newRoom();
    const item = await newConsumable(shelf, counted);
    const c = await asRole("centre_admin");
    const st = await mustStart(c, room);
    await mustScan(c, st.id, item.label_serial, found);
    await submit(c, st.id);
    const [d] = await differences(st.id);
    return { item, d, c };
  }

  it("approving sets the stock to the number found", async () => {
    const { item, d } = await oneShelf(10, 7);
    expect((await decide(await secondCentreAdmin(), d, "approved")).error).toBeNull();
    expect(await stockNow(item.id)).toBe(7);
    const { data } = await masterKeyClient()
      .from("stock_movements")
      .select("kind, quantity, stocktake_difference_id")
      .eq("item_id", item.id)
      .order("id");
    expect(data!.at(-1)).toEqual({ kind: "count", quantity: 7, stocktake_difference_id: d.id });
  });

  it("stock added between the scan and the approval is kept (the difference is applied, not the old number)", async () => {
    const { item, d, c } = await oneShelf(10, 7); // three short
    const r = await c.from("stock_movements").insert({ item_id: item.id, kind: "restock", quantity: 5 });
    if (r.error) throw r.error;
    expect(await stockNow(item.id)).toBe(15);
    await decide(await secondCentreAdmin(), d, "approved");
    expect(await stockNow(item.id)).toBe(12);
  });

  it("finding more than expected adds the extra", async () => {
    const { item, d } = await oneShelf(4, 9);
    await decide(await secondCentreAdmin(), d, "approved");
    expect(await stockNow(item.id)).toBe(9);
  });

  it("never goes below zero", async () => {
    const { item, d, c } = await oneShelf(10, 2); // eight short
    const m = await c.from("stock_movements").insert({ item_id: item.id, kind: "count", quantity: 3 });
    if (m.error) throw m.error;
    await decide(await secondCentreAdmin(), d, "approved");
    expect(await stockNow(item.id)).toBe(0);
  });

  it("a shelf never counted before takes the number found", async () => {
    const { item, d } = await oneShelf(undefined, 6);
    expect(await stockNow(item.id)).toBeNull();
    await decide(await secondCentreAdmin(), d, "approved");
    expect(await stockNow(item.id)).toBe(6);
  });

  it("even the master key cannot make an entry that pretends to come from an approved difference", async () => {
    const { d, item } = await oneShelf(10, 7);
    expect((await decide(await secondCentreAdmin(), d, "approved")).error).toBeNull();
    const m = masterKeyClient();
    const fake = await m.from("stock_movements").insert({ item_id: item.id, kind: "count", quantity: 99, stocktake_difference_id: d.id });
    expect(fake.error?.message).toMatch(/approved stocktake difference/i);
    expect(await stockNow(item.id)).toBe(7);
  });

  it("a stock entry or asset entry cannot pretend to come from a stocktake", async () => {
    const { d, item } = await oneShelf(10, 7);
    const c = await asRole("centre_admin");
    const m = await c.from("stock_movements").insert({ item_id: item.id, kind: "count", quantity: 1, stocktake_difference_id: d.id });
    expect(m.error).not.toBeNull();
    const { room } = await newRoom();
    const a = await newAsset(room);
    const e = await c
      .from("asset_events")
      .insert({ item_id: a.id, kind: "missing", note: "Test", reported_by: "Test", stocktake_difference_id: d.id });
    expect(e.error).not.toBeNull();
  });
});
