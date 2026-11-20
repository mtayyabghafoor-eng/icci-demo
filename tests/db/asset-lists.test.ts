// Finishing Phase 1 (PLAN.md 5.1 screens): "Not seen in 12 months" and the
// asset register. Owner's choices, 15 Nov 2026:
//   * "Seen" means a hands-on event: registered, moved, reported damaged,
//     marked repaired or found, or scanned in a stocktake. Opening its page,
//     editing details at a desk, a "missing" report or a disposal request do
//     not count. Disposed assets are left out.
//   * Super Admin and Centre Admin only (Finance not yet).
// The database works out "last seen" itself (the asset_last_seen view), so
// it can never be typed over. These tests talk to the database directly.
//
// Every date is stamped by the database, so nothing made today can be a year
// old. The tests ask the same question with "seen before just now" instead.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName } from "./clients";
import { consumableFields, idOf, newFixedAsset } from "./items-helpers";

type Seen = { item_id: string; last_seen_at: string; last_seen_how: string };

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
const base = { note: "Test note: made-up event", reported_by: "Test volunteer (fictional)" };

async function report(client: SupabaseClient, item_id: string, kind: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await client.from("asset_events").insert({ item_id, kind, ...base, ...(kind === "disposal" ? { disposal_route: "thrown_away" } : {}), ...extra }).select().single();
  if (error) throw error;
  return data as { id: number };
}

async function seen(item_id: string): Promise<Seen | null> {
  const { data, error } = await (await asRole("centre_admin"))
    .from("asset_last_seen")
    .select("item_id, last_seen_at, last_seen_how")
    .eq("item_id", item_id)
    .maybeSingle<Seen>();
  if (error) throw error;
  return data;
}

describe("last seen: who can read it", () => {
  const refused = [
    { label: "a signed-out visitor", client: async () => signedOutClient() },
    { label: "finance", client: () => asRole("finance") },
    { label: "library_operator", client: () => asRole("library_operator") },
    { label: "a deactivated account", client: () => asRole("centre_admin", false) },
    { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
  ];
  for (const r of refused) {
    it(`${r.label} sees nothing`, async () => {
      await newFixedAsset();
      const { data } = await (await r.client()).from("asset_last_seen").select("item_id").limit(5);
      expect(data ?? []).toEqual([]);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can read it`, async () => {
      const item = await newFixedAsset();
      const { data, error } = await (await asRole(role)).from("asset_last_seen").select("item_id").eq("item_id", item.id);
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    });
  }

  it("nobody can write to it, not even a Super Admin or the master key", async () => {
    const item = await newFixedAsset();
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      const { error } = await c.from("asset_last_seen").update({ last_seen_at: "2020-01-01T00:00:00Z" }).eq("item_id", item.id);
      expect(error).not.toBeNull();
    }
    expect((await seen(item.id))!.last_seen_how).toBe("registered");
  });
});

describe("last seen: what counts", () => {
  it("a new asset was last seen when it was registered", async () => {
    const item = await newFixedAsset();
    const s = (await seen(item.id))!;
    expect(s.last_seen_how).toBe("registered");
    expect(Date.parse(s.last_seen_at)).toBe(Date.parse(item.created_at));
  });

  it("moving it, reporting damage and marking it repaired each count", async () => {
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    const before = Date.parse((await seen(item.id))!.last_seen_at);

    await report(c, item.id, "move", { to_location_id: await idOf("locations", "Test Room A2") });
    const moved = (await seen(item.id))!;
    expect(moved.last_seen_how).toBe("move");
    expect(Date.parse(moved.last_seen_at)).toBeGreaterThan(before);

    await report(c, item.id, "damage");
    const damaged = (await seen(item.id))!;
    expect(damaged.last_seen_how).toBe("damage");
    expect(Date.parse(damaged.last_seen_at)).toBeGreaterThan(Date.parse(moved.last_seen_at));

    await report(c, item.id, "back_in_use", { to_condition: "good" });
    expect((await seen(item.id))!.last_seen_how).toBe("back_in_use");
  });

  it("a 'missing' report does not count, but marking it found does", async () => {
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    const registered = (await seen(item.id))!;
    await report(c, item.id, "missing");
    expect(await seen(item.id)).toEqual(registered);
    await report(c, item.id, "back_in_use", { to_condition: "fair" });
    expect((await seen(item.id))!.last_seen_how).toBe("back_in_use");
  });

  it("editing its details at a desk does not count", async () => {
    const item = await newFixedAsset();
    const registered = (await seen(item.id))!;
    const { error } = await (await asRole("centre_admin")).from("items").update({ notes: "Test note: edited (fictional)" }).eq("id", item.id);
    expect(error).toBeNull();
    expect(await seen(item.id)).toEqual(registered);
  });

  it("being scanned in a stocktake counts", async () => {
    const c = await asRole("centre_admin");
    const { data: room, error } = await c
      .from("locations")
      .insert({ name: testName("last seen room"), kind: "room", parent_id: await idOf("locations", "Test Building A") })
      .select("id")
      .single();
    if (error) throw error;
    const item = await newFixedAsset("centre_admin", { location_id: room.id });
    const st = await c.from("stocktakes").insert({ location_id: room.id }).select("id").single();
    if (st.error) throw st.error;
    const sc = await c.from("stocktake_scans").insert({ stocktake_id: st.data.id, label_serial: item.label_serial }).select().single();
    if (sc.error) throw sc.error;
    const s = (await seen(item.id))!;
    expect(s.last_seen_how).toBe("stocktake_scan");
    expect(Date.parse(s.last_seen_at)).toBe(Date.parse(sc.data.created_at));
  });

  it("a disposal request does not count, and a disposed asset drops off the list", async () => {
    const item = await newFixedAsset();
    const registered = (await seen(item.id))!;
    const disposal = await report(await asRole("centre_admin"), item.id, "disposal");
    expect(await seen(item.id)).toEqual(registered);
    const { error } = await (await secondCentreAdmin()).from("asset_events").update({ status: "approved" }).eq("id", disposal.id);
    expect(error).toBeNull();
    expect(await seen(item.id)).toBeNull();
  });

  it("consumables are not on it (they are counted, not 'seen')", async () => {
    const { data, error } = await (await asRole("centre_admin")).from("items").insert(await consumableFields()).select("id").single();
    if (error) throw error;
    expect(await seen(data.id)).toBeNull();
  });
});

describe("the 'not seen since' question the screen asks", () => {
  it("finds an asset not seen since a cut-off date, and not one seen after it", async () => {
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    const ask = (cutoff: Date) =>
      c.from("asset_last_seen").select("item_id").eq("item_id", item.id).lt("last_seen_at", cutoff.toISOString());

    // A year ago: it was seen today, so it is not on the list.
    const yearAgo = new Date();
    yearAgo.setFullYear(yearAgo.getFullYear() - 1);
    expect((await ask(yearAgo)).data).toEqual([]);

    // A minute from now: it has not been seen since, so it is on the list.
    expect((await ask(new Date(Date.now() + 60_000))).data).toHaveLength(1);
  });
});
