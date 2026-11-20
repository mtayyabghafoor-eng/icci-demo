// Slice 6: fixed assets: move, report damage, mark missing, mark found or
// repaired, and disposal (which a DIFFERENT admin must approve).
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName } from "./clients";
import { consumableFields, idOf, newFixedAsset } from "./items-helpers";

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const admins = ["super_admin", "centre_admin"];

type AssetEvent = {
  id: number;
  item_id: string;
  kind: string;
  status: string;
  from_location_id: string;
  to_location_id: string | null;
  from_condition: string;
  to_condition: string | null;
  created_by: string;
  decided_by: string | null;
};

const base = { note: "Test note: made-up event", reported_by: "Test volunteer (fictional)" };

async function report(client: SupabaseClient, item_id: string, kind: string, extra: Record<string, unknown> = {}) {
  return client
    .from("asset_events")
    .insert({ item_id, kind, ...base, ...(kind === "disposal" ? { disposal_route: "thrown_away" } : {}), ...extra })
    .select()
    .single<AssetEvent>();
}

async function mustReport(client: SupabaseClient, item_id: string, kind: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await report(client, item_id, kind, extra);
  if (error) throw error;
  return data!;
}

function decide(client: SupabaseClient, event: AssetEvent, status: "approved" | "rejected", decision_note?: string) {
  return client
    .from("asset_events")
    .update({ status, ...(decision_note ? { decision_note } : {}) })
    .eq("id", event.id)
    .select();
}

async function itemNow(id: string) {
  const { data, error } = await masterKeyClient().from("items").select("location_id, condition").eq("id", id).single();
  if (error) throw error;
  return data as { location_id: string; condition: string };
}

// ---------------------------------------------------------------------------
describe("who can see and record asset events", () => {
  for (const who of noAccess) {
    it(`${who.label} sees no asset events`, async () => {
      await mustReport(await asRole("centre_admin"), (await newFixedAsset()).id, "damage");
      const { data } = await (await who.client()).from("asset_events").select("*").limit(5);
      expect(data ?? []).toHaveLength(0);
    });

    it(`${who.label} cannot move, report or dispose of an asset`, async () => {
      const item = await newFixedAsset();
      const c = await who.client();
      const room = await idOf("locations", "Test Room A2");
      for (const [kind, extra] of [
        ["move", { to_location_id: room }],
        ["damage", {}],
        ["missing", {}],
        ["disposal", {}],
      ] as [string, Record<string, unknown>][]) {
        const { error } = await report(c, item.id, kind, extra);
        expect(error, kind).not.toBeNull();
      }
      expect(await itemNow(item.id)).toMatchObject({ condition: "good", location_id: item.location_id });
    });

    it(`${who.label} cannot approve a disposal`, async () => {
      const item = await newFixedAsset();
      const disposal = await mustReport(await asRole("centre_admin"), item.id, "disposal");
      const { data } = await decide(await who.client(), disposal, "approved");
      expect(data ?? []).toHaveLength(0);
      const still = await masterKeyClient().from("asset_events").select("status").eq("id", disposal.id).single();
      expect(still.data!.status).toBe("pending");
      expect((await itemNow(item.id)).condition).toBe("good");
    });
  }

  for (const role of admins) {
    it(`${role} can move an asset and report damage`, async () => {
      const item = await newFixedAsset(role);
      const c = await asRole(role);
      const room = await idOf("locations", "Test Room A2");
      await mustReport(c, item.id, "move", { to_location_id: room });
      await mustReport(c, item.id, "damage");
      expect(await itemNow(item.id)).toEqual({ location_id: room, condition: "damaged" });
      const { data } = await c.from("asset_events").select("kind").eq("item_id", item.id).order("id");
      expect(data!.map((e) => e.kind)).toEqual(["move", "damage"]);
    });
  }
});

// ---------------------------------------------------------------------------
describe("moving an asset", () => {
  it("records where it was and where it went, and the item's location follows", async () => {
    const item = await newFixedAsset();
    const room = await idOf("locations", "Test Room B1");
    const ev = await mustReport(await asRole("centre_admin"), item.id, "move", { to_location_id: room });
    expect(ev).toMatchObject({ status: "recorded", from_location_id: item.location_id, to_location_id: room, from_condition: "good" });
    expect((await itemNow(item.id)).location_id).toBe(room);
  });

  it("needs a place to go, which is different from where it is now", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const none = await report(c, item.id, "move");
    expect(none.error?.message).toMatch(/where/i);
    const same = await report(c, item.id, "move", { to_location_id: item.location_id });
    expect(same.error?.message).toMatch(/already/i);
  });

  it("cannot move to a switched-off location", async () => {
    const c = await asRole("centre_admin");
    const { data: loc, error } = await c
      .from("locations")
      .insert({ name: testName("closed room"), kind: "room", parent_id: await idOf("locations", "Test Building A") })
      .select("id")
      .single();
    if (error) throw error;
    await c.from("locations").update({ active: false }).eq("id", loc.id);
    const item = await newFixedAsset();
    const moved = await report(c, item.id, "move", { to_location_id: loc.id });
    expect(moved.error?.message).toMatch(/switched off/i);
  });

  it("only a move has a place to go", async () => {
    const item = await newFixedAsset();
    const { error } = await report(await asRole("centre_admin"), item.id, "damage", {
      to_location_id: await idOf("locations", "Test Room A2"),
    });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("damage, missing, found and repaired", () => {
  it("damage and missing change the condition; the event remembers the condition before", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const dmg = await mustReport(c, item.id, "damage");
    expect(dmg).toMatchObject({ from_condition: "good", to_condition: "damaged" });
    const gone = await mustReport(c, item.id, "missing");
    expect(gone).toMatchObject({ from_condition: "damaged", to_condition: "missing" });
    expect((await itemNow(item.id)).condition).toBe("missing");
  });

  it("a missing asset can be marked found, and a damaged one repaired, as good or fair", async () => {
    const c = await asRole("centre_admin");
    const lost = await newFixedAsset();
    await mustReport(c, lost.id, "missing");
    await mustReport(c, lost.id, "back_in_use", { to_condition: "fair" });
    expect((await itemNow(lost.id)).condition).toBe("fair");

    const broken = await newFixedAsset();
    await mustReport(c, broken.id, "damage");
    await mustReport(c, broken.id, "back_in_use", { to_condition: "good" });
    expect((await itemNow(broken.id)).condition).toBe("good");
  });

  it("found or repaired must say good or fair, nothing else", async () => {
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    await mustReport(c, item.id, "damage");
    for (const to_condition of [undefined, "missing", "disposed", "damaged"]) {
      const { error } = await report(c, item.id, "back_in_use", to_condition ? { to_condition } : {});
      expect(error, String(to_condition)).not.toBeNull();
    }
  });

  it("refuses reports that do not fit the condition now", async () => {
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    const notBroken = await report(c, item.id, "back_in_use", { to_condition: "good" });
    expect(notBroken.error?.message).toMatch(/only a damaged or missing/i);
    await mustReport(c, item.id, "damage");
    const again = await report(c, item.id, "damage");
    expect(again.error?.message).toMatch(/already/i);
    await mustReport(c, item.id, "missing");
    const missingAgain = await report(c, item.id, "missing");
    expect(missingAgain.error?.message).toMatch(/already/i);
  });

  it("the person entering cannot choose the condition for damage or missing", async () => {
    const item = await newFixedAsset();
    const { error } = await report(await asRole("centre_admin"), item.id, "damage", { to_condition: "good" });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("every event", () => {
  it("needs a note and who reported it", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    for (const extra of [{ note: "" }, { note: "   " }, { reported_by: "" }, { reported_by: "  " }]) {
      const { error } = await report(c, item.id, "damage", extra);
      expect(error, JSON.stringify(extra)).not.toBeNull();
    }
    const noNote = await c.from("asset_events").insert({ item_id: item.id, kind: "damage", reported_by: "Test person" });
    expect(noNote.error).not.toBeNull();
  });

  it("is only for fixed assets, not consumables", async () => {
    const { data: item, error } = await (await asRole("centre_admin")).from("items").insert(await consumableFields()).select().single();
    if (error) throw error;
    const c = await asRole("centre_admin");
    const damaged = await report(c, item.id, "damage");
    expect(damaged.error?.message).toMatch(/fixed assets/i);
    const moved = await report(c, item.id, "move", { to_location_id: await idOf("locations", "Test Shelf A1-1-2") });
    expect(moved.error?.message).toMatch(/fixed assets/i);
  });

  it("who, when, the place and condition before are filled in by the database and cannot be faked", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const other = (await masterKeyClient().from("app_users").select("id").eq("role", "finance").limit(1).single()).data!.id;
    const ev = await mustReport(c, item.id, "damage", {
      created_by: other,
      created_at: "2020-01-01T00:00:00Z",
      from_condition: "fair",
      from_location_id: await idOf("locations", "Test Room B1"),
      status: "recorded",
    });
    const me = (await c.auth.getUser()).data.user!.id;
    expect(ev).toMatchObject({ created_by: me, from_condition: "good", from_location_id: item.location_id });
    expect((ev as unknown as { created_at: string }).created_at.startsWith("2020")).toBe(false);
  });

  it("cannot be entered with a decision already made", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    for (const extra of [{ status: "approved" }, { decided_by: (await c.auth.getUser()).data.user!.id }, { decision_note: "x" }]) {
      const { error } = await report(c, item.id, "disposal", extra);
      expect(error, JSON.stringify(extra)).not.toBeNull();
    }
  });

  it("can never be changed, even by the master key", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "damage");
    for (const c of [await asRole("super_admin"), await asRole("centre_admin")]) {
      const { data } = await c.from("asset_events").update({ note: "Changed" }).eq("id", ev.id).select();
      expect(data ?? []).toHaveLength(0);
    }
    const master = await masterKeyClient().from("asset_events").update({ note: "Changed" }).eq("id", ev.id);
    expect(master.error).not.toBeNull();
  });

  it("can never be deleted, even by the master key", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "damage");
    await (await asRole("super_admin")).from("asset_events").delete().eq("id", ev.id);
    const master = await masterKeyClient().from("asset_events").delete().eq("id", ev.id);
    expect(master.error).not.toBeNull();
    const still = await masterKeyClient().from("asset_events").select("id").eq("id", ev.id);
    expect(still.data).toHaveLength(1);
  });

  it("is written to the audit log, and so is the change to the item", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "missing");
    const db = masterKeyClient();
    const events = await db.from("audit_log").select("action").eq("table_name", "asset_events").eq("record_id", String(ev.id));
    expect(events.data).toEqual([{ action: "insert" }]);
    const items = await db.from("audit_log").select("new_values").eq("table_name", "items").eq("record_id", item.id).eq("action", "update");
    expect(items.data!.map((r) => (r.new_values as { condition: string }).condition)).toEqual(["missing"]);
  });

  it("the item's location and condition still cannot be typed over, even with the master key", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const moved = await c.from("items").update({ location_id: await idOf("locations", "Test Room A2") }).eq("id", item.id);
    expect(moved.error?.message).toMatch(/move/i);
    const fixed = await masterKeyClient().from("items").update({ condition: "good" }).eq("id", item.id);
    const master = await masterKeyClient().from("items").update({ condition: "disposed" }).eq("id", item.id);
    expect(fixed.error).toBeNull(); // no change: allowed
    expect(master.error).not.toBeNull();
    expect((await itemNow(item.id)).condition).toBe("good");
  });

  it("a new item cannot be registered as already disposed (disposal needs approval)", async () => {
    await expect(newFixedAsset("centre_admin", { condition: "disposed" })).rejects.toThrow(/disposed/i);
  });

  it("a photo path must look like a stored file", async () => {
    const item = await newFixedAsset();
    const { error } = await report(await asRole("centre_admin"), item.id, "damage", { photo_path: "../../secret file" });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("disposal (a different admin must approve)", () => {
  it("waits for approval and changes nothing until then", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "disposal");
    expect(ev).toMatchObject({ status: "pending", to_condition: "disposed" });
    expect((await itemNow(item.id)).condition).toBe("good");
  });

  it("nobody can approve or reject their own disposal", async () => {
    const item = await newFixedAsset();
    const me = await asRole("centre_admin");
    const ev = await mustReport(me, item.id, "disposal");
    const approve = await decide(me, ev, "approved");
    expect(approve.error?.message ?? "refused").toMatch(/different admin|refused/i);
    const reject = await decide(me, ev, "rejected", "Changed my mind");
    expect(reject.error?.message ?? "refused").toMatch(/different admin|refused/i);
    const still = await masterKeyClient().from("asset_events").select("status").eq("id", ev.id).single();
    expect(still.data!.status).toBe("pending");
  });

  it("once a different admin approves, the asset is disposed; the approver and time are filled in", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "disposal");
    const approver = await secondCentreAdmin();
    const { data, error } = await approver
      .from("asset_events")
      .update({ status: "approved", decided_by: ev.created_by })
      .eq("id", ev.id)
      .select()
      .single();
    expect(error).toBeNull();
    expect(data!.decided_by).toBe((await approver.auth.getUser()).data.user!.id);
    expect(data!.decided_at).not.toBeNull();
    expect((await itemNow(item.id)).condition).toBe("disposed");
  });

  it("a super admin can approve a centre admin's disposal", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "disposal");
    const { error } = await decide(await asRole("super_admin"), ev, "approved");
    expect(error).toBeNull();
    expect((await itemNow(item.id)).condition).toBe("disposed");
  });

  it("rejecting needs a reason, and leaves the asset as it was", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    await mustReport(c, item.id, "damage");
    const ev = await mustReport(c, item.id, "disposal");
    const other = await secondCentreAdmin();
    const noReason = await decide(other, ev, "rejected");
    expect(noReason.error?.message).toMatch(/reason/i);
    const ok = await decide(other, ev, "rejected", "It can still be repaired");
    expect(ok.error).toBeNull();
    expect((await itemNow(item.id)).condition).toBe("damaged");
  });

  it("a decision is final", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "disposal");
    const other = await secondCentreAdmin();
    await decide(other, ev, "rejected", "Not yet");
    const again = await decide(await asRole("super_admin"), ev, "approved");
    expect(again.data ?? []).toHaveLength(0);
    expect((await itemNow(item.id)).condition).toBe("good");
  });

  it("only the decision can be filled in, and only approved or rejected", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "disposal");
    const other = await secondCentreAdmin();
    const sneaky = await other.from("asset_events").update({ status: "approved", note: "Edited" }).eq("id", ev.id);
    expect(sneaky.error).not.toBeNull();
    const odd = await other.from("asset_events").update({ status: "recorded" }).eq("id", ev.id);
    expect(odd.error).not.toBeNull();
  });

  it("while a disposal waits, nothing else can be recorded for that asset", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    await mustReport(c, item.id, "disposal");
    for (const [kind, extra] of [
      ["disposal", {}],
      ["damage", {}],
      ["move", { to_location_id: await idOf("locations", "Test Room A2") }],
    ] as [string, Record<string, unknown>][]) {
      const { error } = await report(c, item.id, kind, extra);
      expect(error?.message, kind).toMatch(/waiting for approval/i);
    }
  });

  it("a disposed asset is final: it cannot be moved, reported, found or disposed again", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "disposal");
    await decide(await secondCentreAdmin(), ev, "approved");
    const c = await asRole("centre_admin");
    for (const [kind, extra] of [
      ["move", { to_location_id: await idOf("locations", "Test Room A2") }],
      ["damage", {}],
      ["missing", {}],
      ["back_in_use", { to_condition: "good" }],
      ["disposal", {}],
    ] as [string, Record<string, unknown>][]) {
      const { error } = await report(c, item.id, kind, extra);
      expect(error?.message, kind).toMatch(/disposed/i);
    }
  });

  it("only a disposal can be decided on", async () => {
    const item = await newFixedAsset();
    const ev = await mustReport(await asRole("centre_admin"), item.id, "damage");
    const { data } = await decide(await secondCentreAdmin(), ev, "approved");
    expect(data ?? []).toHaveLength(0);
  });
});
