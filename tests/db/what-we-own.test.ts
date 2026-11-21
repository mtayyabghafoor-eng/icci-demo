// Slice P1.18: "What we own". The database counts each sub-category: assets
// (disposed left out), working (Good or Fair), not working (Damaged),
// missing, with an open ticket; and stock lines. Optionally in one place.
// Only Super Admins and Centre Admins get any numbers.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, passwordOnlyClient, signedOutClient, testName } from "./clients";
import { idOf, newFixedAsset } from "./items-helpers";

type Row = { category_id: string; total: number; working: number; not_working: number; missing: number; with_open_tickets: number };

async function testSubCategory() {
  const c = await asRole("centre_admin");
  const main = await c.from("item_categories").insert({ name: testName("count main") }).select("id").single();
  if (main.error) throw main.error;
  const sub = await c.from("item_categories").insert({ name: testName("count sub"), parent_id: main.data.id }).select("id").single();
  if (sub.error) throw sub.error;
  return sub.data.id as string;
}

async function report(itemId: string, kind: "damage" | "missing") {
  const c = await asRole("centre_admin");
  const { error } = await c.from("asset_events").insert({ item_id: itemId, kind, note: "Test: made-up report", reported_by: "Test volunteer" });
  if (error) throw error;
}

describe("category_counts", () => {
  it("counts assets, working, not working, missing and open tickets per sub-category, and in one place", async () => {
    const sub = await testSubCategory();
    const roomA1 = await idOf("locations", "Test Room A1");
    const buildingB = await idOf("locations", "Test Building B");
    const good = await newFixedAsset("centre_admin", { category_id: sub, location_id: roomA1 });
    await newFixedAsset("centre_admin", { category_id: sub, location_id: roomA1, condition: "fair" });
    const broken = await newFixedAsset("centre_admin", { category_id: sub, location_id: buildingB });
    const lost = await newFixedAsset("centre_admin", { category_id: sub, location_id: buildingB });
    await report(broken.id, "damage");
    await report(lost.id, "missing");
    const c = await asRole("centre_admin");
    const t = await c.from("maintenance_tickets").insert({ item_id: good.id, description: "Test: makes a noise", reported_by: "Test volunteer" });
    if (t.error) throw t.error;

    const all = await c.rpc("category_counts");
    expect(all.error).toBeNull();
    expect((all.data as Row[]).find((r) => r.category_id === sub)).toMatchObject({
      total: 4,
      working: 2,
      not_working: 1,
      missing: 1,
      with_open_tickets: 1,
    });

    // Only Test Room A1 (and anything inside it).
    const inRoom = await c.rpc("category_counts", { p_place: roomA1 });
    expect((inRoom.data as Row[]).find((r) => r.category_id === sub)).toMatchObject({ total: 2, working: 2, not_working: 0, missing: 0 });
  });

  it("gives the seeded air conditioners: some working, some not", async () => {
    const c = await asRole("super_admin");
    const ac = await idOf("item_categories", "Air conditioners");
    const { data } = await c.rpc("category_counts");
    const row = (data as Row[]).find((r) => r.category_id === ac)!;
    expect(row.total).toBeGreaterThanOrEqual(10);
    expect(row.working).toBeGreaterThan(0);
    expect(row.not_working).toBeGreaterThan(0);
  });

  for (const who of [
    { label: "a signed-out visitor", client: async () => signedOutClient() },
    { label: "finance", client: () => asRole("finance") },
    { label: "library_operator", client: () => asRole("library_operator") },
    { label: "a password-only sign-in", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
  ]) {
    it(`${who.label} gets no numbers`, async () => {
      const { data } = await (await who.client()).rpc("category_counts");
      expect(data ?? []).toHaveLength(0);
    });
  }
});

describe("not seen in 12 months", () => {
  it("now gives each asset's category", async () => {
    const c = await asRole("centre_admin");
    const { data, error } = await c.from("asset_last_seen").select("item_id, category_id").limit(1).single();
    expect(error).toBeNull();
    expect(data!.category_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
