// Slice 4: items, labels, categories, photos and item history.
// Who can do what, and the rules the database enforces on every item.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName } from "./clients";
import {
  consumableFields,
  fixedAssetFields,
  idOf,
  newFixedAsset,
  newLabel,
  testPhotoPath,
  TINY_PNG,
} from "./items-helpers";

const BUCKET = "item-photos";

/** Everyone who must see and change nothing in the inventory. */
const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const admins = ["super_admin", "centre_admin"];

describe("who can see the inventory", () => {
  for (const who of noAccess) {
    it(`${who.label} sees no items, labels or categories`, async () => {
      const c = await who.client();
      for (const table of ["items", "labels", "item_categories"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
    });
  }

  for (const role of admins) {
    it(`${role} sees the 200+ seeded items, the labels and the categories`, async () => {
      const c = await asRole(role);
      const items = await c.from("items").select("id", { count: "exact", head: true }).like("name", "Test %");
      expect(items.count).toBeGreaterThanOrEqual(200);
      const labels = await c.from("labels").select("serial").eq("serial", "ICCI-000001");
      expect(labels.data).toHaveLength(1);
      const cats = await c.from("item_categories").select("name");
      expect(cats.data!.map((x) => x.name)).toEqual(expect.arrayContaining(["Furniture", "Cleaning supplies", "Other"]));
    });
  }
});

describe("who can register and change items", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot register an item`, async () => {
      const fields = await fixedAssetFields();
      const { error } = await (await who.client()).from("items").insert(fields);
      expect(error).not.toBeNull();
    });

    it(`${who.label} cannot change an item`, async () => {
      const item = await newFixedAsset();
      const { data } = await (await who.client()).from("items").update({ name: "Changed" }).eq("id", item.id).select();
      expect(data ?? []).toHaveLength(0);
      const still = await masterKeyClient().from("items").select("name").eq("id", item.id).single();
      expect(still.data!.name).toBe(item.name);
    });

    it(`${who.label} cannot add a label`, async () => {
      const { error } = await (await who.client()).from("labels").insert({ serial: "ICCI-999998" });
      expect(error).not.toBeNull();
    });
  }

  for (const role of admins) {
    it(`${role} can register a fixed asset and edit its details`, async () => {
      const item = await newFixedAsset(role, { value_cents: 12550, purchase_date: "2026-01-10", warranty_end: "2028-01-10" });
      expect(item.kind).toBe("fixed_asset");
      const c = await asRole(role);
      const edited = await c
        .from("items")
        .update({ name: item.name + " (blue)", notes: "Test note", value_cents: 9900 })
        .eq("id", item.id)
        .select()
        .single();
      expect(edited.error).toBeNull();
      expect(edited.data).toMatchObject({ name: item.name + " (blue)", notes: "Test note", value_cents: 9900 });
    });

    it(`${role} can register a consumable on a shelf`, async () => {
      const { data, error } = await (await asRole(role)).from("items").insert(await consumableFields()).select().single();
      expect(error).toBeNull();
      expect(data).toMatchObject({ kind: "consumable", unit: "roll", minimum_level: 5, condition: null });
    });
  }

  it("a label cannot be changed once printed, by anyone", async () => {
    const serial = await newLabel();
    const { data } = await (await asRole("super_admin")).from("labels").update({ serial: "ICCI-999997" }).eq("serial", serial).select();
    expect(data ?? []).toHaveLength(0);
  });
});

describe("the rules for every item", () => {
  const c = () => asRole("centre_admin");

  it("a label can be on only one item", async () => {
    const first = await newFixedAsset();
    const { error } = await (await c()).from("items").insert(await fixedAssetFields({ label_serial: first.label_serial }));
    expect(error?.message).toMatch(/already on another item/i);
  });

  it("the label must be one that was printed", async () => {
    const { error } = await (await c()).from("items").insert(await fixedAssetFields({ label_serial: "ICCI-999999" }));
    expect(error).not.toBeNull();
  });

  it("label numbers must look like ICCI-000123", async () => {
    for (const serial of ["ICCI-12", "XYZ-000001", "icci-000001", "ICCI-0000012"]) {
      // The master key skips the access rules, so this proves the format rule itself.
      const { error } = await masterKeyClient().from("labels").insert({ serial });
      expect(error, serial).not.toBeNull();
    }
  });

  it("the kind of item cannot be changed", async () => {
    const item = await newFixedAsset();
    const { error } = await (await c()).from("items").update({ kind: "consumable" }).eq("id", item.id);
    expect(error?.message).toMatch(/kind of item cannot be changed/i);
  });

  it("the label on an item cannot be swapped", async () => {
    const item = await newFixedAsset();
    const other = await newLabel();
    const { error } = await (await c()).from("items").update({ label_serial: other }).eq("id", item.id);
    expect(error?.message).toMatch(/label on an item cannot be changed/i);
  });

  it("location and condition cannot be changed by editing (that is Move / Report on the item page)", async () => {
    const item = await newFixedAsset();
    const moved = await (await c()).from("items").update({ location_id: await idOf("locations", "Test Room A2") }).eq("id", item.id);
    expect(moved.error?.message).toMatch(/move/i);
    const damaged = await (await c()).from("items").update({ condition: "damaged" }).eq("id", item.id);
    expect(damaged.error?.message).toMatch(/report/i);
  });

  it("a consumable must be in a store room or on a shelf", async () => {
    const { error } = await (await c())
      .from("items")
      .insert(await consumableFields({ location_id: await idOf("locations", "Test Room A1") }));
    expect(error?.message).toMatch(/store room or on a shelf/i);
  });

  it("a consumable needs a unit and a minimum level, and has no condition or value", async () => {
    const noUnit = await (await c()).from("items").insert(await consumableFields({ unit: null }));
    expect(noUnit.error).not.toBeNull();
    const withValue = await (await c()).from("items").insert(await consumableFields({ value_cents: 100 }));
    expect(withValue.error).not.toBeNull();
    const negative = await (await c()).from("items").insert(await consumableFields({ minimum_level: -1 }));
    expect(negative.error).not.toBeNull();
  });

  it("a fixed asset needs a condition and has no unit or minimum level", async () => {
    const noCondition = await (await c()).from("items").insert(await fixedAssetFields({ condition: null }));
    expect(noCondition.error).not.toBeNull();
    const withUnit = await (await c()).from("items").insert(await fixedAssetFields({ unit: "box" }));
    expect(withUnit.error).not.toBeNull();
    const badCondition = await (await c()).from("items").insert(await fixedAssetFields({ condition: "broken" }));
    expect(badCondition.error).not.toBeNull();
  });

  it("a value cannot be negative and a warranty cannot end before the purchase", async () => {
    const negative = await (await c()).from("items").insert(await fixedAssetFields({ value_cents: -1 }));
    expect(negative.error).not.toBeNull();
    const backwards = await (await c())
      .from("items")
      .insert(await fixedAssetFields({ purchase_date: "2026-05-01", warranty_end: "2026-04-01" }));
    expect(backwards.error).not.toBeNull();
  });

  it("an item cannot be registered in a switched-off location", async () => {
    const m = masterKeyClient();
    const off = await m.from("locations").insert({ name: testName("closed building"), kind: "building", active: false }).select().single();
    const { error } = await (await c()).from("items").insert(await fixedAssetFields({ location_id: off.data!.id }));
    expect(error?.message).toMatch(/switched off/i);
  });

  it("two consumables with the same name cannot share one shelf", async () => {
    const first = await consumableFields();
    expect((await (await c()).from("items").insert(first)).error).toBeNull();
    const second = await consumableFields({ name: first.name.toUpperCase() });
    expect((await (await c()).from("items").insert(second)).error).not.toBeNull();
  });

  it("names accept Arabic", async () => {
    const name = `${testName("x")} سجادة`;
    const { data, error } = await (await c()).from("items").insert(await fixedAssetFields({ name })).select("name").single();
    expect(error).toBeNull();
    expect(data!.name).toBe(name);
  });

  it("items and labels cannot be deleted, even with the master key", async () => {
    const item = await newFixedAsset();
    for (const client of [await asRole("super_admin"), masterKeyClient()]) {
      await client.from("items").delete().eq("id", item.id);
      await client.from("labels").delete().eq("serial", item.label_serial);
    }
    const still = await masterKeyClient().from("items").select("id").eq("id", item.id);
    expect(still.data).toHaveLength(1);
    const label = await masterKeyClient().from("labels").select("serial").eq("serial", item.label_serial);
    expect(label.data).toHaveLength(1);
  });
});

describe("item history", () => {
  it("shows the registration and every change, with who made it and the old and new values", async () => {
    const item = await newFixedAsset("centre_admin");
    await (await asRole("super_admin")).from("items").update({ name: item.name + " v2" }).eq("id", item.id);

    const { data, error } = await (await asRole("centre_admin")).rpc("item_history", { p_item_id: item.id });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    expect(data[0]).toMatchObject({ action: "insert", changed_by_name: "Test Centre Admin" });
    expect(data[0].new_values.name).toBe(item.name);
    expect(data[1]).toMatchObject({ action: "update", changed_by_name: "Test Super Admin" });
    expect(data[1].old_values.name).toBe(item.name);
    expect(data[1].new_values.name).toBe(item.name + " v2");
  });

  it("a centre admin can see an item's history but still not the audit log itself", async () => {
    const { data } = await (await asRole("centre_admin")).from("audit_log").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot be used to read the history of anything that is not an item", async () => {
    const location = await idOf("locations", "Test Room A1");
    const { data } = await (await asRole("centre_admin")).rpc("item_history", { p_item_id: location });
    expect(data ?? []).toHaveLength(0);
  });

  for (const who of noAccess) {
    it(`${who.label} cannot read an item's history`, async () => {
      const item = await newFixedAsset();
      const { data } = await (await who.client()).rpc("item_history", { p_item_id: item.id });
      expect(data ?? []).toHaveLength(0);
    });
  }
});

describe("item photos (private file storage)", () => {
  for (const role of admins) {
    it(`${role} can add a photo and see it`, async () => {
      const c = await asRole(role);
      const path = testPhotoPath();
      const up = await c.storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png" });
      expect(up.error).toBeNull();
      const down = await c.storage.from(BUCKET).download(path);
      expect(down.error).toBeNull();
    });
  }

  for (const who of noAccess) {
    it(`${who.label} cannot add or see photos`, async () => {
      const path = testPhotoPath();
      await (await asRole("centre_admin")).storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png" });
      const c = await who.client();
      const up = await c.storage.from(BUCKET).upload(testPhotoPath(), TINY_PNG, { contentType: "image/png" });
      expect(up.error).not.toBeNull();
      const down = await c.storage.from(BUCKET).download(path);
      expect(down.error).not.toBeNull();
    });
  }

  it("photos cannot be replaced or deleted by an admin", async () => {
    const c = await asRole("super_admin");
    const path = testPhotoPath();
    await c.storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png" });
    const replaced = await c.storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png", upsert: true });
    expect(replaced.error).not.toBeNull();
    await c.storage.from(BUCKET).remove([path]);
    const still = await masterKeyClient().storage.from(BUCKET).download(path);
    expect(still.error).toBeNull();
  });

  it("only pictures are accepted", async () => {
    const c = await asRole("centre_admin");
    const up = await c.storage
      .from(BUCKET)
      .upload(testPhotoPath().replace(".png", ".txt"), new TextEncoder().encode("not a photo"), { contentType: "text/plain" });
    expect(up.error).not.toBeNull();
  });
});
