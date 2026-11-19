// The database hands back at most 1,000 rows per request (supabase/config.toml,
// max_rows). Lists the screens load in full (every place, every admin's name)
// must still get every row once there are more than that. Found 15 Nov 2026
// when the development database passed 1,000 places and the newest rooms
// vanished from the drop-down lists.
import { describe, expect, it } from "vitest";
import { adminNames } from "@/app/(app)/stock/data";
import { loadLookups } from "@/app/(app)/items/data";
import { asRole, masterKeyClient, testName } from "./clients";

async function countOf(table: "locations" | "app_users") {
  const { count, error } = await masterKeyClient().from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

describe("lists loaded in full", () => {
  it("every place is loaded, even past 1,000 of them", async () => {
    // Make sure there are more than 1,000 (made-up, switched-off buildings).
    const short = 1001 - (await countOf("locations"));
    if (short > 0) {
      const rows = Array.from({ length: short }, () => ({ name: testName("filler building"), kind: "building", active: false }));
      const { error } = await masterKeyClient().from("locations").insert(rows);
      if (error) throw error;
    }
    const newest = await (await asRole("centre_admin"))
      .from("locations")
      .insert({ name: testName("newest building"), kind: "building" })
      .select("id")
      .single();
    if (newest.error) throw newest.error;

    const { locations, locationName } = await loadLookups(await asRole("centre_admin"));
    expect(locations.length).toBe(await countOf("locations"));
    expect(locations.length).toBeGreaterThan(1000);
    expect(locationName.has(newest.data.id)).toBe(true);
    expect(new Set(locations.map((l) => l.id)).size).toBe(locations.length);
  });

  it("every admin's name is loaded", async () => {
    const nameOf = await adminNames(await asRole("centre_admin"));
    const { data } = await masterKeyClient().from("app_users").select("id, display_name");
    for (const u of data ?? []) expect(nameOf(u.id)).toBe(u.display_name);
  });
});
