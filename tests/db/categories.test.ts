// Slice P1.17: categories in two levels (owner approved 21 Nov 2026).
// About nine main categories, each with sub-categories and an "Other ..."
// sub-category, plus a main category "Other". Items sit in a sub-category
// only. Super Admins and Centre Admins add, rename, move and switch off
// categories; nobody deletes one, and everyone else sees and changes nothing.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName } from "./clients";
import { fixedAssetFields, idOf, newFixedAsset } from "./items-helpers";

type Cat = { id: string; name: string; parent_id: string | null; active: boolean };

const MAIN = [
  "Furniture and furnishings",
  "Electronics, IT and sound",
  "Heating, cooling and water",
  "Building systems and security",
  "Kitchen and catering",
  "Garden, tools and cleaning equipment",
  "Vehicles",
  "Prayer and funeral items",
  "Supplies (used up)",
  "Other",
];

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

async function allCategories(): Promise<Cat[]> {
  const { data, error } = await masterKeyClient().from("item_categories").select("id, name, parent_id, active");
  if (error) throw error;
  return data as Cat[];
}

/** A new main category with one sub-category, as a Centre Admin. */
async function newMainWithSub(label: string) {
  const c = await asRole("centre_admin");
  const main = await c.from("item_categories").insert({ name: testName(`${label} main`) }).select().single();
  if (main.error) throw main.error;
  const sub = await c.from("item_categories").insert({ name: testName(`${label} sub`), parent_id: main.data.id }).select().single();
  if (sub.error) throw sub.error;
  return { main: main.data as Cat, sub: sub.data as Cat };
}

describe("the starting list", () => {
  it("has the ten main categories, each with sub-categories", async () => {
    const all = await allCategories();
    for (const name of MAIN) {
      const main = all.find((c) => c.name === name);
      expect(main, name).toBeDefined();
      expect(main!.parent_id, name).toBeNull();
      expect(all.filter((c) => c.parent_id === main!.id).length, name).toBeGreaterThanOrEqual(1);
    }
  });

  it('every main category has an "Other" sub-category for things that fit nowhere else', async () => {
    const all = await allCategories();
    for (const name of MAIN) {
      const main = all.find((c) => c.name === name)!;
      expect(all.some((c) => c.parent_id === main.id && /^Other\b/.test(c.name)), name).toBe(true);
    }
  });

  it("puts lawnmowers, air conditioners and automatic gates where an admin would look", async () => {
    const all = await allCategories();
    const parentOf = (sub: string) => all.find((c) => c.id === all.find((x) => x.name === sub)?.parent_id)?.name;
    expect(parentOf("Lawnmowers")).toBe("Garden, tools and cleaning equipment");
    expect(parentOf("Air conditioners")).toBe("Heating, cooling and water");
    expect(parentOf("Automatic gates and barriers")).toBe("Building systems and security");
    expect(parentOf("Sound system")).toBe("Electronics, IT and sound");
  });

  it("keeps today's categories, moved in under their new main category (nothing lost)", async () => {
    const all = await allCategories();
    const parentOf = (sub: string) => all.find((c) => c.id === all.find((x) => x.name === sub)?.parent_id)?.name;
    expect(parentOf("Other furniture")).toBe("Furniture and furnishings");
    expect(parentOf("Carpets and rugs")).toBe("Furniture and furnishings");
    expect(parentOf("Other electronics")).toBe("Electronics, IT and sound");
    expect(parentOf("Other kitchen equipment")).toBe("Kitchen and catering");
    expect(parentOf("Cleaning supplies")).toBe("Supplies (used up)");
    expect(parentOf("Stationery")).toBe("Supplies (used up)");
    expect(parentOf("Other tools and equipment")).toBe("Garden, tools and cleaning equipment");
    expect(parentOf("Other prayer items")).toBe("Prayer and funeral items");
    expect(parentOf("Cars and vans")).toBe("Vehicles");
    expect(parentOf("Other items")).toBe("Other");
  });

  it("no main category holds an item directly", async () => {
    const all = await allCategories();
    const mains = all.filter((c) => c.parent_id === null).map((c) => c.id);
    const { count } = await masterKeyClient().from("items").select("id", { count: "exact", head: true }).in("category_id", mains);
    expect(count).toBe(0);
  });
});

describe("who can see and change categories", () => {
  for (const who of noAccess) {
    it(`${who.label} sees no categories and cannot add or change one`, async () => {
      const c = await who.client();
      expect((await c.from("item_categories").select("id").limit(5)).data ?? []).toHaveLength(0);
      expect((await c.from("item_categories").insert({ name: testName("sneaky") })).error).not.toBeNull();
      const target = await idOf("item_categories", "Lawnmowers");
      const changed = await c.from("item_categories").update({ name: testName("renamed") }).eq("id", target).select();
      expect(changed.data ?? []).toHaveLength(0);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add a main category and a sub-category inside it`, async () => {
      const c = await asRole(role);
      const main = await c.from("item_categories").insert({ name: testName(`${role} main`) }).select().single();
      expect(main.error).toBeNull();
      const sub = await c.from("item_categories").insert({ name: testName(`${role} sub`), parent_id: main.data!.id }).select().single();
      expect(sub.error).toBeNull();
      expect(sub.data!.parent_id).toBe(main.data!.id);
    });
  }

  it("nobody deletes a category, not even with the master key", async () => {
    const { sub } = await newMainWithSub("delete");
    const { error } = await masterKeyClient().from("item_categories").delete().eq("id", sub.id);
    expect(error).not.toBeNull();
    expect((await masterKeyClient().from("item_categories").select("id").eq("id", sub.id)).data).toHaveLength(1);
  });
});

describe("two levels only", () => {
  it("refuses a sub-category inside a sub-category", async () => {
    const { sub } = await newMainWithSub("third level");
    const c = await asRole("centre_admin");
    const { error } = await c.from("item_categories").insert({ name: testName("too deep"), parent_id: sub.id });
    expect(error?.message).toMatch(/inside a main category/);
  });

  it("a main category cannot become a sub-category, or the other way round", async () => {
    const a = await newMainWithSub("level a");
    const b = await newMainWithSub("level b");
    const c = await asRole("centre_admin");
    const down = await c.from("item_categories").update({ parent_id: b.main.id }).eq("id", a.main.id);
    expect(down.error?.message).toMatch(/cannot become/);
    const up = await c.from("item_categories").update({ parent_id: null }).eq("id", a.sub.id);
    expect(up.error?.message).toMatch(/cannot become/);
  });

  it("a category cannot be inside itself", async () => {
    const { main } = await newMainWithSub("self");
    const c = await asRole("centre_admin");
    const { error } = await c.from("item_categories").update({ parent_id: main.id }).eq("id", main.id);
    expect(error).not.toBeNull();
  });

  it("a sub-category can be moved to another main category, and keeps its items", async () => {
    const a = await newMainWithSub("move from");
    const b = await newMainWithSub("move to");
    const item = await newFixedAsset("centre_admin", { category_id: a.sub.id });
    const c = await asRole("centre_admin");
    const moved = await c.from("item_categories").update({ parent_id: b.main.id }).eq("id", a.sub.id).select().single();
    expect(moved.error).toBeNull();
    expect(moved.data!.parent_id).toBe(b.main.id);
    const still = await c.from("items").select("category_id").eq("id", item.id).single();
    expect(still.data!.category_id).toBe(a.sub.id);
  });

  it("names are unique across the whole list, ignoring capitals and spaces", async () => {
    const c = await asRole("centre_admin");
    const main = await idOf("item_categories", "Other");
    const { error } = await c.from("item_categories").insert({ name: "  lawnmowers ", parent_id: main });
    expect(error).not.toBeNull();
  });
});

describe("items sit in a sub-category only", () => {
  it("an item cannot be registered in a main category", async () => {
    const c = await asRole("centre_admin");
    const fields = await fixedAssetFields({ category_id: await idOf("item_categories", "Furniture and furnishings") });
    const { error } = await c.from("items").insert(fields);
    expect(error?.message).toMatch(/sub-category/);
  });

  it("an item cannot be moved into a main category by editing", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const { error } = await c.from("items").update({ category_id: await idOf("item_categories", "Vehicles") }).eq("id", item.id);
    expect(error?.message).toMatch(/sub-category/);
  });

  it("an item can be put in any switched-on sub-category", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const lawnmowers = await idOf("item_categories", "Lawnmowers");
    const { data, error } = await c.from("items").update({ category_id: lawnmowers }).eq("id", item.id).select("category_id").single();
    expect(error).toBeNull();
    expect(data!.category_id).toBe(lawnmowers);
  });
});

describe("switching off", () => {
  it("a main category can be switched off only once its sub-categories are", async () => {
    const { main, sub } = await newMainWithSub("switch off");
    const c = await asRole("centre_admin");
    const early = await c.from("item_categories").update({ active: false }).eq("id", main.id);
    expect(early.error?.message).toMatch(/sub-categories first/);
    expect((await c.from("item_categories").update({ active: false }).eq("id", sub.id)).error).toBeNull();
    expect((await c.from("item_categories").update({ active: false }).eq("id", main.id)).error).toBeNull();
  });

  it("nothing new goes inside a switched-off main category, and a sub-category there cannot be switched back on", async () => {
    const { main, sub } = await newMainWithSub("switched off main");
    const c = await asRole("centre_admin");
    await c.from("item_categories").update({ active: false }).eq("id", sub.id);
    await c.from("item_categories").update({ active: false }).eq("id", main.id);
    const added = await c.from("item_categories").insert({ name: testName("inside off"), parent_id: main.id });
    expect(added.error?.message).toMatch(/switched off/);
    const back = await c.from("item_categories").update({ active: true }).eq("id", sub.id);
    expect(back.error?.message).toMatch(/switched off/);
  });

  it("a switched-off sub-category keeps its items, but takes no new ones", async () => {
    const { sub } = await newMainWithSub("keeps items");
    const item = await newFixedAsset("centre_admin", { category_id: sub.id });
    const c = await asRole("centre_admin");
    expect((await c.from("item_categories").update({ active: false }).eq("id", sub.id)).error).toBeNull();
    expect((await c.from("items").select("category_id").eq("id", item.id).single()).data!.category_id).toBe(sub.id);
    const fields = await fixedAssetFields({ category_id: sub.id });
    expect((await c.from("items").insert(fields)).error?.message).toMatch(/switched off/);
  });
});
