// Locations: building > room > store room > shelf.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_LOCATIONS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, signedOutClient, testName, userIdOf } from "./clients";
import { consumableFields, newFixedAsset } from "./items-helpers";

async function newBuilding(role = "centre_admin") {
  const { data, error } = await (await asRole(role))
    .from("locations")
    .insert({ name: testName("building"), kind: "building" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

const noAccess = [
  { label: "finance", role: "finance", active: true },
  { label: "library_operator", role: "library_operator", active: true },
  { label: "a deactivated account", role: "centre_admin", active: false },
];

describe("who can read locations", () => {
  it("signed-out visitor cannot", async () => {
    const { data } = await signedOutClient().from("locations").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  for (const who of noAccess) {
    it(`${who.label} cannot`, async () => {
      const { data } = await (await asRole(who.role, who.active)).from("locations").select("id");
      expect(data ?? []).toHaveLength(0);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can see all the seeded locations`, async () => {
      const { data } = await (await asRole(role)).from("locations").select("name").like("name", "Test %");
      const names = data!.map((l) => l.name);
      for (const l of SEED_LOCATIONS) expect(names).toContain(l.name);
    });
  }
});

describe("who can add or change locations", () => {
  it("signed-out visitor cannot add one", async () => {
    const { error } = await signedOutClient().from("locations").insert({ name: testName("x"), kind: "building" });
    expect(error).not.toBeNull();
  });

  for (const who of noAccess) {
    it(`${who.label} cannot add one`, async () => {
      const { error } = await (await asRole(who.role, who.active))
        .from("locations")
        .insert({ name: testName("x"), kind: "building" });
      expect(error).not.toBeNull();
    });

    it(`${who.label} cannot change one`, async () => {
      const b = await newBuilding();
      const { data } = await (await asRole(who.role, who.active))
        .from("locations")
        .update({ name: "Changed" })
        .eq("id", b.id)
        .select();
      expect(data ?? []).toHaveLength(0);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add, rename and deactivate a location`, async () => {
      const b = await newBuilding(role);
      const c = await asRole(role);
      const renamed = await c.from("locations").update({ name: b.name + " renamed" }).eq("id", b.id).select("name").single();
      expect(renamed.data?.name).toBe(b.name + " renamed");
      const off = await c.from("locations").update({ active: false }).eq("id", b.id).select("active").single();
      expect(off.data?.active).toBe(false);
    });
  }
});

describe("the tree must be building > room > store room > shelf", () => {
  it("accepts a correct chain", async () => {
    const c = await asRole("centre_admin");
    const b = await newBuilding();
    const room = await c.from("locations").insert({ name: testName("room"), kind: "room", parent_id: b.id }).select().single();
    expect(room.error).toBeNull();
    const store = await c
      .from("locations")
      .insert({ name: testName("store"), kind: "store_room", parent_id: room.data!.id })
      .select()
      .single();
    expect(store.error).toBeNull();
    const shelf = await c
      .from("locations")
      .insert({ name: testName("shelf"), kind: "shelf", parent_id: store.data!.id })
      .select()
      .single();
    expect(shelf.error).toBeNull();
  });

  it("refuses a building inside something else", async () => {
    const b = await newBuilding();
    const { error } = await (await asRole("centre_admin"))
      .from("locations")
      .insert({ name: testName("b"), kind: "building", parent_id: b.id });
    expect(error?.message).toMatch(/building cannot be inside/i);
  });

  it("refuses a shelf placed directly in a building", async () => {
    const b = await newBuilding();
    const { error } = await (await asRole("centre_admin"))
      .from("locations")
      .insert({ name: testName("s"), kind: "shelf", parent_id: b.id });
    expect(error?.message).toMatch(/shelf must be inside a store room/i);
  });

  it("refuses a room with no building", async () => {
    const { error } = await (await asRole("centre_admin")).from("locations").insert({ name: testName("r"), kind: "room" });
    expect(error?.message).toMatch(/room must be inside a building/i);
  });

  it("refuses an unknown kind of location", async () => {
    const { error } = await (await asRole("centre_admin")).from("locations").insert({ name: testName("k"), kind: "cupboard" });
    expect(error).not.toBeNull();
  });

  it("refuses changing what kind of location it is", async () => {
    const b = await newBuilding();
    const { error } = await (await asRole("centre_admin")).from("locations").update({ kind: "room" }).eq("id", b.id);
    expect(error?.message).toMatch(/kind of location cannot be changed/i);
  });

  it("refuses moving a location under the wrong kind of parent", async () => {
    const c = await asRole("centre_admin");
    const b = await newBuilding();
    const room = await c.from("locations").insert({ name: testName("room"), kind: "room", parent_id: b.id }).select().single();
    const other = await newBuilding();
    const ok = await c.from("locations").update({ parent_id: other.id }).eq("id", room.data!.id);
    expect(ok.error).toBeNull();
    const bad = await c.from("locations").update({ parent_id: null }).eq("id", room.data!.id);
    expect(bad.error?.message).toMatch(/room must be inside a building/i);
  });

  it("refuses two locations with the same name in the same place", async () => {
    const b = await newBuilding();
    const { error } = await (await asRole("centre_admin"))
      .from("locations")
      .insert({ name: b.name.toUpperCase(), kind: "building" });
    expect(error).not.toBeNull();
  });
});

// Audit fix 7 (15 Nov 2026): a place could be switched off while things
// were still in it, leaving them somewhere nobody can pick any more.
describe("switching a place off", () => {
  async function chain() {
    const c = await asRole("centre_admin");
    const add = async (name: string, kind: string, parent_id?: string) => {
      const { data, error } = await c.from("locations").insert({ name: testName(name), kind, parent_id }).select("id").single();
      if (error) throw error;
      return data.id as string;
    };
    const building = await add("off building", "building");
    const room = await add("off room", "room", building);
    const storeRoom = await add("off store room", "store_room", room);
    const shelf = await add("off shelf", "shelf", storeRoom);
    return { c, building, room, storeRoom, shelf };
  }
  const off = (c: SupabaseClient, id: string) => c.from("locations").update({ active: false }).eq("id", id).select("active");

  it("is refused while places inside it are still switched on", async () => {
    const { c, building, room, storeRoom, shelf } = await chain();
    expect((await off(c, building)).error?.message).toMatch(/places inside/i);
    for (const id of [shelf, storeRoom, room, building]) expect((await off(c, id)).error, id).toBeNull();
  });

  it("is refused while an asset is still there (a disposed one does not count)", async () => {
    const { c, room, storeRoom, shelf } = await chain();
    const asset = await newFixedAsset("centre_admin", { location_id: room });
    expect((await off(c, shelf)).error).toBeNull();
    expect((await off(c, storeRoom)).error).toBeNull();
    expect((await off(c, room)).error?.message).toMatch(/still holds/i);
    const d = await c
      .from("asset_events")
      .insert({ item_id: asset.id, kind: "disposal", note: "Test: broken", reported_by: "Test volunteer" })
      .select("id")
      .single();
    if (d.error) throw d.error;
    const ok = await (await asRole("super_admin")).from("asset_events").update({ status: "approved" }).eq("id", d.data.id);
    expect(ok.error).toBeNull();
    expect((await off(c, room)).error).toBeNull();
  });

  it("is refused while a shelf still has stock (or has never been counted); allowed once counted to zero", async () => {
    const { c, shelf } = await chain();
    const { data: item, error } = await c.from("items").insert(await consumableFields({ location_id: shelf })).select("id").single();
    if (error) throw error;
    expect((await off(c, shelf)).error?.message).toMatch(/still holds/i);
    await c.from("stock_movements").insert({ item_id: item.id, kind: "count", quantity: 3 });
    expect((await off(c, shelf)).error?.message).toMatch(/still holds/i);
    await c.from("stock_movements").insert({ item_id: item.id, kind: "count", quantity: 0 });
    expect((await off(c, shelf)).error).toBeNull();
  });

  it("is refused while a stocktake of the room is under way", async () => {
    const { c, room, storeRoom, shelf } = await chain();
    expect((await off(c, shelf)).error).toBeNull();
    expect((await off(c, storeRoom)).error).toBeNull();
    const st = await c.from("stocktakes").insert({ location_id: room });
    if (st.error) throw st.error;
    expect((await off(c, room)).error?.message).toMatch(/stocktake/i);
  });

  it("nothing new can be put inside a switched-off place, and it cannot be switched back on inside one", async () => {
    const { c, building, room, storeRoom, shelf } = await chain();
    for (const id of [shelf, storeRoom, room, building]) expect((await off(c, id)).error).toBeNull();
    const inside = await c.from("locations").insert({ name: testName("late room"), kind: "room", parent_id: building });
    expect(inside.error?.message).toMatch(/switched off/i);
    const back = await c.from("locations").update({ active: true }).eq("id", room);
    expect(back.error?.message).toMatch(/switched off/i);
    expect((await c.from("locations").update({ active: true }).eq("id", building)).error).toBeNull();
    expect((await c.from("locations").update({ active: true }).eq("id", room)).error).toBeNull();
  });
});

describe("who and when are filled in by the database", () => {
  it("cannot be faked by the person saving", async () => {
    const centre = seedAdmin("centre_admin");
    const { data } = await (await asRole("centre_admin"))
      .from("locations")
      .insert({
        name: testName("stamp"),
        kind: "building",
        created_by: userIdOf(seedAdmin("super_admin").email),
        created_at: "2000-01-01T00:00:00Z",
      })
      .select()
      .single();
    expect(data!.created_by).toBe(userIdOf(centre.email));
    expect(data!.updated_by).toBe(userIdOf(centre.email));
    expect(new Date(data!.created_at).getFullYear()).toBeGreaterThan(2000);
  });

  it("records who made the latest change, and keeps who created it", async () => {
    const b = await newBuilding("centre_admin");
    const { data } = await (await asRole("super_admin"))
      .from("locations")
      .update({ notes: "Checked", created_by: userIdOf("second.admin@icci-prototype.test") })
      .eq("id", b.id)
      .select()
      .single();
    expect(data!.created_by).toBe(b.created_by);
    expect(data!.updated_by).toBe(userIdOf(seedAdmin("super_admin").email));
  });
});
