// Small helpers for the item and label tests. Everything they create is
// obviously fictional ("Test run ..." names; labels come from the next
// numbers after the seed's, like a real printed sheet).
import { asRole, masterKeyClient, testName } from "./clients";

const ids = new Map<string, string>();

/** The id of a seeded category or location, looked up once by name. */
export async function idOf(table: "item_categories" | "locations", name: string): Promise<string> {
  const key = `${table}:${name}`;
  const known = ids.get(key);
  if (known) return known;
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw new Error(`No ${table} row named ${name}: ${error.message}`);
  ids.set(key, data.id);
  return data.id;
}

/** A new, unassigned test label, handed out by the database like a printed one. */
export async function newLabel(): Promise<string> {
  const { data, error } = await (await asRole("centre_admin")).rpc("print_new_labels", { p_count: 1 });
  if (error) throw error;
  return `ICCI-${String((data as { first_number: number }).first_number).padStart(6, "0")}`;
}

export async function fixedAssetFields(extra: Record<string, unknown> = {}) {
  return {
    label_serial: await newLabel(),
    kind: "fixed_asset",
    name: testName("chair"),
    category_id: await idOf("item_categories", "Other furniture"),
    location_id: await idOf("locations", "Test Room A1"),
    condition: "good",
    ...extra,
  };
}

export async function consumableFields(extra: Record<string, unknown> = {}) {
  return {
    label_serial: await newLabel(),
    kind: "consumable",
    name: testName("bin bags"),
    category_id: await idOf("item_categories", "Cleaning supplies"),
    location_id: await idOf("locations", "Test Shelf A1-1-1"),
    unit: "roll",
    minimum_level: 5,
    ...extra,
  };
}

/** Registers a fixed asset as the given role and returns the saved row. */
export async function newFixedAsset(role = "centre_admin", extra: Record<string, unknown> = {}) {
  const { data, error } = await (await asRole(role)).from("items").insert(await fixedAssetFields(extra)).select().single();
  if (error) throw error;
  return data;
}

/** A tiny, blank 1 x 1 pixel PNG picture: obviously not a real photo. */
export const TINY_PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0),
);

export function testPhotoPath() {
  return `test-run/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
}
