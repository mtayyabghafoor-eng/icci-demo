// Fixes from the fresh-eyes security review (15 Nov 2026), on top of the audit
// fixes tested in accounts, locations, stocktake and safeguards tests.
// Owner's choice: a place that still holds items, or overlaps a stocktake
// under way, can be neither switched off nor moved. Empty places can.
// Everything here is enforced by the database itself.
import { describe, expect, it } from "vitest";
import { asRole, masterKeyClient, testName } from "./clients";
import { consumableFields, fixedAssetFields, newFixedAsset } from "./items-helpers";

// ---------------------------------------------------------------------------
describe("the automatic security report", () => {
  it("every table refuses a change to its record number", async () => {
    const { data, error } = await masterKeyClient().rpc("security_report");
    expect(error).toBeNull();
    for (const t of data as { table_name: string; key_locked: boolean }[]) {
      if (t.table_name !== "audit_log") expect(t, t.table_name).toMatchObject({ key_locked: true });
    }
  });
});

describe("record numbers cannot be changed (it would cut a record off from its history)", () => {
  const newId = () => crypto.randomUUID();

  it("not an item's, a location's or a category's, even by a Super Admin", async () => {
    const c = await asRole("super_admin");
    const item = await newFixedAsset("super_admin");
    const loc = await c.from("locations").insert({ name: testName("renumber"), kind: "building" }).select("id").single();
    const cat = await c.from("item_categories").insert({ name: testName("renumber") }).select("id").single();
    if (loc.error || cat.error) throw loc.error ?? cat.error;
    for (const [table, id] of [["items", item.id], ["locations", loc.data.id], ["item_categories", cat.data.id]] as const) {
      const { error } = await c.from(table).update({ id: newId() }).eq("id", id);
      expect(error?.message, table).toMatch(/record number cannot be changed/i);
    }
  });

  it("not a role's code, and not even with the master key", async () => {
    expect((await (await asRole("super_admin")).from("roles").update({ code: "renamed_role" }).eq("code", "finance")).error?.message).toMatch(
      /record number cannot be changed/i,
    );
    const m = masterKeyClient();
    const loc = await m.from("locations").insert({ name: testName("renumber-master"), kind: "building" }).select("id").single();
    if (loc.error) throw loc.error;
    expect((await m.from("locations").update({ id: newId() }).eq("id", loc.data.id)).error?.message).toMatch(/record number cannot be changed/i);
  });
});

// ---------------------------------------------------------------------------
// Audit fix 7: locations that still hold something.
async function newRoomWith(kind: "nothing" | "asset" | "consumable") {
  const c = await asRole("centre_admin");
  const add = async (name: string, k: string, parent_id: string | null) => {
    const { data, error } = await c.from("locations").insert({ name: testName(name), kind: k, parent_id }).select("id").single();
    if (error) throw error;
    return data.id as string;
  };
  const building = await add("holding building", "building", null);
  const room = await add("holding room", "room", building);
  const storeRoom = await add("holding store room", "store_room", room);
  const shelf = await add("holding shelf", "shelf", storeRoom);
  let itemId: string | null = null;
  if (kind === "asset") {
    const { data, error } = await c.from("items").insert(await fixedAssetFields({ location_id: room })).select("id").single();
    if (error) throw error;
    itemId = data.id;
  } else if (kind === "consumable") {
    const { data, error } = await c.from("items").insert(await consumableFields({ location_id: shelf })).select("id").single();
    if (error) throw error;
    itemId = data.id;
  }
  return { building, room, storeRoom, shelf, itemId };
}

describe("a location that still holds items", () => {
  for (const role of ["super_admin", "centre_admin"]) {
    it(`cannot be switched off by ${role}, nor can the building around it`, async () => {
      const { building, room } = await newRoomWith("asset");
      const c = await asRole(role);
      for (const id of [room, building]) {
        const { error } = await c.from("locations").update({ active: false }).eq("id", id);
        expect(error?.message).toMatch(/still holds/i);
      }
    });
  }

  it("cannot be moved into another room (its items would move without a 'Move' entry)", async () => {
    const { storeRoom } = await newRoomWith("consumable");
    const other = await newRoomWith("nothing");
    const { error } = await (await asRole("centre_admin")).from("locations").update({ parent_id: other.room }).eq("id", storeRoom);
    expect(error?.message).toMatch(/still holds/i);
  });

  it("an empty location can still be switched off or moved", async () => {
    const a = await newRoomWith("nothing");
    const b = await newRoomWith("nothing");
    const c = await asRole("centre_admin");
    expect((await c.from("locations").update({ parent_id: b.room }).eq("id", a.storeRoom)).error).toBeNull();
    expect((await c.from("locations").update({ active: false }).eq("id", a.room)).error).toBeNull();
    // Renaming one that holds items is still fine.
    const full = await newRoomWith("asset");
    expect((await c.from("locations").update({ name: testName("renamed room") }).eq("id", full.room)).error).toBeNull();
  });

  it("a room with a stocktake under way cannot be switched off or moved, nor can a shelf inside it", async () => {
    const { room, shelf } = await newRoomWith("nothing");
    const other = await newRoomWith("nothing");
    const c = await asRole("centre_admin");
    const st = await c.from("stocktakes").insert({ location_id: room }).select("id").single();
    if (st.error) throw st.error;
    expect((await c.from("locations").update({ active: false }).eq("id", room)).error?.message).toMatch(/stocktake/i);
    expect((await c.from("locations").update({ active: false }).eq("id", shelf)).error?.message).toMatch(/stocktake/i);
    expect((await c.from("locations").update({ parent_id: other.building }).eq("id", room)).error?.message).toMatch(/stocktake/i);
  });
});
