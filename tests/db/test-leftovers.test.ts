// The tidy-up after a test run (scripts/test-leftovers.mts): made-up "Test run"
// places, people and training types are switched off, never deleted. A test place that still
// holds made-up items is emptied first with ordinary entries: chairs are moved
// to the "Test storage room", bin bags are counted down to zero. A place with
// a disposal waiting for approval is left alone. Nothing else is touched.
import { describe, expect, it } from "vitest";
import { STORAGE_ROOM, switchOffTestLeftovers } from "../../scripts/test-leftovers.mts";
import { asRole, masterKeyClient } from "./clients";
import { consumableFields, newFixedAsset, newLabel } from "./items-helpers";

async function listId(table: "person_roles" | "sections", name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

describe("tidy-up after a test run", () => {
  it("empties and switches off this run's places, and switches off its people", async () => {
    // One unique name start, so only what this test made is tidied.
    const prefix = `Test run tidy ${Date.now()} ${Math.random().toString(36).slice(2, 7)} `;
    const admin = await asRole("centre_admin");
    const add = async (row: Record<string, unknown>) => {
      const { data, error } = await admin.from("locations").insert(row).select("id").single();
      if (error) throw error;
      return data.id as string;
    };
    const building = await add({ name: `${prefix}building`, kind: "building" });
    const room = await add({ name: `${prefix}room`, kind: "room", parent_id: building });
    const store = await add({ name: `${prefix}store room`, kind: "store_room", parent_id: room });
    const shelf = await add({ name: `${prefix}shelf`, kind: "shelf", parent_id: store });

    // Made-up things left inside: a chair in the room, a chair reported
    // missing, bin bags never counted and bin bags counted at 7.
    const chair = await newFixedAsset("centre_admin", { location_id: room });
    const lost = await newFixedAsset("centre_admin", { location_id: room });
    const report = await admin
      .from("asset_events")
      .insert({ item_id: lost.id, kind: "missing", note: "Test: not found", reported_by: "Test volunteer" });
    if (report.error) throw report.error;
    const bags = async (counted?: number) => {
      const { data, error } = await admin.from("items").insert(await consumableFields({ location_id: shelf })).select("id").single();
      if (error) throw error;
      if (counted !== undefined) {
        const m = await admin.from("stock_movements").insert({ item_id: data.id, kind: "count", quantity: counted });
        if (m.error) throw m.error;
      }
      return data.id as string;
    };
    const neverCounted = await bags();
    const counted = await bags(7);

    const person = await admin
      .from("people")
      .insert({
        full_name: `${prefix}person`,
        person_role_id: await listId("person_roles", "Volunteer"),
        section_id: await listId("sections", "Volunteers"),
      })
      .select("id")
      .single();
    if (person.error) throw person.error;
    const course = await admin.from("training_types").insert({ name: `${prefix}course`, usual_years: 1 }).select("id").single();
    if (course.error) throw course.error;
    const slot = await admin.from("rota_slot_types").insert({ name: `${prefix}car park`, slot_group: "shift" }).select("id").single();
    if (slot.error) throw slot.error;
    const template = await masterKeyClient().from("rota_templates").insert({ name: `${prefix}template`, kind: "week" }).select("id").single();
    if (template.error) throw template.error;
    const policy = await admin.from("policies").insert({ title: `${prefix}policy`, owner_person_id: person.data.id }).select("id").single();
    if (policy.error) throw policy.error;
    const van = await newFixedAsset("centre_admin", { name: `${prefix}van` });
    const vehicle = await admin.from("vehicles").insert({ item_id: van.id, registration: `TR-${Date.now().toString(36).toUpperCase()}` }).select("id").single();
    if (vehicle.error) throw vehicle.error;
    const renewal = await admin.from("renewals").insert({ title: `${prefix}insurance`, category: "Insurance" }).select("id").single();
    if (renewal.error) throw renewal.error;
    const warranty = await newFixedAsset("centre_admin", { name: `${prefix}kettle`, purchase_date: "2026-01-01", warranty_end: "2027-01-01" });
    const book = await admin.from("library_books").insert({ title: `${prefix}book`, language: "en" }).select("id").single();
    if (book.error) throw book.error;
    // P4.4: a test borrower who still has a book out.
    const copy = await admin.from("library_copies").insert({ book_id: book.data.id, label_serial: await newLabel() }).select("id").single();
    if (copy.error) throw copy.error;
    const borrower = await admin
      .from("library_borrowers")
      .insert({ full_name: `${prefix}borrower`, contact_kind: "phone", contact: "+353 00 000 9990" })
      .select("id")
      .single();
    if (borrower.error) throw borrower.error;
    const lent = await admin.rpc("lend_copy", { p_copy_id: copy.data.id, p_borrower_id: borrower.data.id, p_due_on: null });
    if (lent.error) throw lent.error;

    const result = await switchOffTestLeftovers(masterKeyClient(), prefix);
    expect(result).toEqual({
      books: 1,
      borrowers: 1,
      people: 1,
      trainingTypes: 1,
      slotTypes: 1,
      rotaTemplates: 1,
      policies: 1,
      vehicles: 1,
      renewals: 1,
      warrantiesCleared: 1,
      places: 4,
      placesLeftOn: 0,
      chairsMoved: 2,
      stockCounted: 2,
    });
    expect((await admin.from("renewals").select("active").eq("id", renewal.data.id).single()).data?.active).toBe(false);
    expect((await admin.from("library_books").select("active").eq("id", book.data.id).single()).data?.active).toBe(false);
    // The borrower's book was returned first (an ordinary return entry), then they were switched off.
    expect((await admin.from("library_borrowers").select("active").eq("id", borrower.data.id).single()).data?.active).toBe(false);
    expect((await admin.from("library_loan_status").select("is_open").eq("id", lent.data).single()).data?.is_open).toBe(false);
    expect((await admin.from("rota_slot_types").select("active").eq("id", slot.data.id).single()).data?.active).toBe(false);
    expect((await masterKeyClient().from("rota_templates").select("active").eq("id", template.data.id).single()).data?.active).toBe(false);
    expect((await admin.from("items").select("warranty_end").eq("id", warranty.id).single()).data?.warranty_end).toBeNull();

    const db = masterKeyClient();
    const { data: places } = await db.from("locations").select("active").in("id", [building, room, store, shelf]);
    expect(places?.map((p) => p.active)).toEqual([false, false, false, false]);

    // The chairs are in the storage room, each with a "move" entry.
    const { data: storage } = await db.from("locations").select("id, active").eq("name", STORAGE_ROOM).single();
    expect(storage?.active).toBe(true);
    const { data: chairs } = await db.from("items").select("location_id, condition").in("id", [chair.id, lost.id]).order("condition");
    expect(chairs).toEqual([
      { location_id: storage!.id, condition: "good" },
      { location_id: storage!.id, condition: "missing" },
    ]);
    const { count: moves } = await db
      .from("asset_events")
      .select("id", { count: "exact", head: true })
      .eq("kind", "move")
      .in("item_id", [chair.id, lost.id]);
    expect(moves).toBe(2);

    // The bin bags now count zero; the earlier count of 7 is still there.
    const { data: levels } = await db.from("stock_levels").select("item_id, quantity").in("item_id", [neverCounted, counted]);
    expect(levels?.map((l) => l.quantity)).toEqual([0, 0]);
    const { count: entries } = await db.from("stock_movements").select("id", { count: "exact", head: true }).eq("item_id", counted);
    expect(entries).toBe(2);

    const { data: p } = await db.from("people").select("active").eq("id", person.data.id).single();
    expect(p?.active).toBe(false);
    const { data: t } = await db.from("training_types").select("active").eq("id", course.data.id).single();
    expect(t?.active).toBe(false);
  });

  it("leaves a place on while a disposal there waits for approval", async () => {
    const prefix = `Test run tidy ${Date.now()} ${Math.random().toString(36).slice(2, 7)} `;
    const admin = await asRole("centre_admin");
    const { data: building, error } = await admin.from("locations").insert({ name: `${prefix}building`, kind: "building" }).select("id").single();
    if (error) throw error;
    const chair = await newFixedAsset("centre_admin", { location_id: building.id });
    const disposal = await admin
      .from("asset_events")
      .insert({ item_id: chair.id, kind: "disposal", note: "Test: broken", reported_by: "Test volunteer" });
    if (disposal.error) throw disposal.error;

    const result = await switchOffTestLeftovers(masterKeyClient(), prefix);
    expect(result).toMatchObject({ places: 0, placesLeftOn: 1, chairsMoved: 0 });
    const { data } = await masterKeyClient().from("items").select("location_id").eq("id", chair.id).single();
    expect(data?.location_id).toBe(building.id);
  });

  it("refuses to touch anything not named \"Test run ...\"", async () => {
    await expect(switchOffTestLeftovers(masterKeyClient(), "Test Room")).rejects.toThrow(/Test run/);
  });
});
