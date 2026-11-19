// Slice 5: stock counts, restocks and adjustments (PLAN.md 5.1).
// Who can do what, the stock arithmetic, and the approval rules. All of it is
// enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient } from "./clients";
import { consumableFields, newFixedAsset } from "./items-helpers";

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const admins = ["super_admin", "centre_admin"];

type Movement = { id: number; item_id: string; kind: string; quantity: number; status: string; corrects_id: number | null };

async function newConsumable(role = "centre_admin", extra: Record<string, unknown> = {}) {
  const { data, error } = await (await asRole(role)).from("items").insert(await consumableFields(extra)).select().single();
  if (error) throw error;
  return data as { id: string; minimum_level: number };
}

async function record(
  client: SupabaseClient,
  item_id: string,
  kind: "count" | "restock",
  quantity: number,
): Promise<Movement> {
  const { data, error } = await client.from("stock_movements").insert({ item_id, kind, quantity }).select().single();
  if (error) throw error;
  return data as Movement;
}

async function askToCorrect(client: SupabaseClient, entry: Movement, quantity: number, reason = "Typed the wrong number") {
  const { data, error } = await client
    .from("stock_movements")
    .insert({ item_id: entry.item_id, kind: "adjustment", corrects_id: entry.id, quantity, reason })
    .select()
    .single();
  if (error) throw error;
  return data as Movement;
}

function decide(client: SupabaseClient, adjustment: Movement, status: "approved" | "rejected", decision_note?: string) {
  return client
    .from("stock_movements")
    .update({ status, ...(decision_note ? { decision_note } : {}) })
    .eq("id", adjustment.id)
    .select();
}

type Level = {
  quantity: number | null;
  status: string;
  usage_since_previous_count: number | null;
  last_counted_at: string | null;
};

async function level(itemId: string): Promise<Level> {
  const { data, error } = await masterKeyClient().from("stock_levels").select("*").eq("item_id", itemId).single();
  if (error) throw error;
  return data as Level;
}

// ---------------------------------------------------------------------------
describe("who can see and enter stock", () => {
  for (const who of noAccess) {
    it(`${who.label} sees no stock entries or stock levels`, async () => {
      const c = await who.client();
      for (const table of ["stock_movements", "stock_levels"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
    });

    it(`${who.label} cannot count, restock or adjust`, async () => {
      const item = await newConsumable();
      const admin = await asRole("centre_admin");
      const restock = await record(admin, item.id, "restock", 4);
      const c = await who.client();
      for (const row of [
        { item_id: item.id, kind: "count", quantity: 3 },
        { item_id: item.id, kind: "restock", quantity: 3 },
        { item_id: item.id, kind: "adjustment", corrects_id: restock.id, quantity: 6, reason: "Test" },
      ] as Record<string, unknown>[]) {
        const { error } = await c.from("stock_movements").insert(row);
        expect(error, String(row.kind)).not.toBeNull();
      }
    });

    it(`${who.label} cannot approve an adjustment`, async () => {
      const item = await newConsumable();
      const entry = await record(await asRole("centre_admin"), item.id, "count", 10);
      const adj = await askToCorrect(await asRole("centre_admin"), entry, 12);
      const { data } = await decide(await who.client(), adj, "approved");
      expect(data ?? []).toHaveLength(0);
      const still = await masterKeyClient().from("stock_movements").select("status").eq("id", adj.id).single();
      expect(still.data!.status).toBe("pending");
    });
  }

  for (const role of admins) {
    it(`${role} can count and restock, and sees the stock level`, async () => {
      const item = await newConsumable(role);
      const c = await asRole(role);
      await record(c, item.id, "count", 7);
      await record(c, item.id, "restock", 3);
      const { data } = await c.from("stock_levels").select("quantity").eq("item_id", item.id).single();
      expect(data!.quantity).toBe(10);
    });
  }

  it("who made an entry, and when, is filled in by the database and cannot be faked", async () => {
    const item = await newConsumable();
    const c = await asRole("centre_admin");
    const { data, error } = await c
      .from("stock_movements")
      .insert({
        item_id: item.id,
        kind: "count",
        quantity: 5,
        created_by: (await masterKeyClient().from("app_users").select("id").neq("role", "centre_admin").limit(1).single()).data!.id,
        created_at: "2020-01-01T00:00:00Z",
      })
      .select()
      .single();
    expect(error).toBeNull();
    const me = (await c.auth.getUser()).data.user!.id;
    expect(data!.created_by).toBe(me);
    expect(data!.created_at.startsWith("2020")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe("entries can never be changed or deleted", () => {
  for (const role of admins) {
    it(`${role} cannot change a count or a restock`, async () => {
      const item = await newConsumable();
      const c = await asRole(role);
      const entry = await record(await asRole("centre_admin"), item.id, "count", 10);
      // Refused: either an error, or no row changed.
      const { data } = await c.from("stock_movements").update({ quantity: 99 }).eq("id", entry.id).select();
      expect(data ?? []).toHaveLength(0);
      expect((await level(item.id)).quantity).toBe(10);
    });
  }

  it("nobody can delete a stock entry, even with the master key", async () => {
    const item = await newConsumable();
    const entry = await record(await asRole("centre_admin"), item.id, "count", 10);
    const admin = await (await asRole("super_admin")).from("stock_movements").delete().eq("id", entry.id);
    const master = await masterKeyClient().from("stock_movements").delete().eq("id", entry.id);
    expect(master.error).not.toBeNull();
    expect(admin.error ?? master.error).not.toBeNull();
    const still = await masterKeyClient().from("stock_movements").select("id").eq("id", entry.id);
    expect(still.data).toHaveLength(1);
  });

  it("the master key cannot change an entry either", async () => {
    const item = await newConsumable();
    const entry = await record(await asRole("centre_admin"), item.id, "restock", 4);
    const { error } = await masterKeyClient().from("stock_movements").update({ quantity: 40 }).eq("id", entry.id);
    expect(error).not.toBeNull();
  });

  it("every stock entry is written to the audit log", async () => {
    const item = await newConsumable();
    const entry = await record(await asRole("centre_admin"), item.id, "count", 2);
    const { data } = await masterKeyClient()
      .from("audit_log")
      .select("action")
      .eq("table_name", "stock_movements")
      .eq("record_id", String(entry.id));
    expect(data).toEqual([{ action: "insert" }]);
  });
});

// ---------------------------------------------------------------------------
describe("the rules for every stock entry", () => {
  it("only consumables have stock", async () => {
    const asset = await newFixedAsset();
    const { error } = await (await asRole("centre_admin"))
      .from("stock_movements")
      .insert({ item_id: asset.id, kind: "count", quantity: 1 });
    expect(error?.message).toMatch(/only consumables/i);
  });

  it("a count cannot be negative", async () => {
    const item = await newConsumable();
    const { error } = await (await asRole("centre_admin")).from("stock_movements").insert({ item_id: item.id, kind: "count", quantity: -1 });
    expect(error).not.toBeNull();
  });

  it("a restock must add at least one", async () => {
    const item = await newConsumable();
    const c = await asRole("centre_admin");
    for (const quantity of [0, -3]) {
      const { error } = await c.from("stock_movements").insert({ item_id: item.id, kind: "restock", quantity });
      expect(error, String(quantity)).not.toBeNull();
    }
  });

  it("a count or restock cannot carry a reason, a link or a decision", async () => {
    const item = await newConsumable();
    const c = await asRole("centre_admin");
    const first = await record(c, item.id, "count", 3);
    for (const extra of [{ corrects_id: first.id }, { status: "approved" }, { reason: "x" }]) {
      const { error } = await c.from("stock_movements").insert({ item_id: item.id, kind: "restock", quantity: 2, ...extra });
      expect(error, JSON.stringify(extra)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe("stock arithmetic (quantities are worked out, never stored)", () => {
  it("is 'Not counted yet' with no quantity before the first count, even after a restock", async () => {
    const item = await newConsumable();
    expect(await level(item.id)).toMatchObject({ quantity: null, status: "not_counted", last_counted_at: null });
    await record(await asRole("centre_admin"), item.id, "restock", 10);
    expect(await level(item.id)).toMatchObject({ quantity: null, status: "not_counted" });
  });

  it("is the latest count plus the restocks since", async () => {
    const item = await newConsumable("centre_admin", { minimum_level: 5 });
    const c = await asRole("centre_admin");
    await record(c, item.id, "restock", 100); // before any count: replaced by the count
    await record(c, item.id, "count", 10);
    expect(await level(item.id)).toMatchObject({ quantity: 10, status: "in_stock", usage_since_previous_count: null });
    await record(c, item.id, "restock", 5);
    await record(c, item.id, "restock", 2);
    expect((await level(item.id)).quantity).toBe(17);
  });

  it("works out usage since the count before: previous count + restocks between − latest count", async () => {
    const item = await newConsumable();
    const c = await asRole("centre_admin");
    await record(c, item.id, "count", 10);
    await record(c, item.id, "restock", 5);
    await record(c, item.id, "count", 12);
    expect(await level(item.id)).toMatchObject({ quantity: 12, usage_since_previous_count: 3 });
    await record(c, item.id, "count", 4);
    expect(await level(item.id)).toMatchObject({ quantity: 4, usage_since_previous_count: 8 });
  });

  it("shows negative usage when more is found than expected", async () => {
    const item = await newConsumable();
    const c = await asRole("centre_admin");
    await record(c, item.id, "count", 5);
    await record(c, item.id, "count", 7);
    expect((await level(item.id)).usage_since_previous_count).toBe(-2);
  });

  it("is Low at or below the minimum, and Out at zero", async () => {
    const item = await newConsumable("centre_admin", { minimum_level: 5 });
    const c = await asRole("centre_admin");
    await record(c, item.id, "count", 6);
    expect((await level(item.id)).status).toBe("in_stock");
    await record(c, item.id, "count", 5);
    expect((await level(item.id)).status).toBe("low");
    await record(c, item.id, "count", 0);
    expect((await level(item.id)).status).toBe("out");
  });

  it("follows a change to the minimum level straight away", async () => {
    const item = await newConsumable("centre_admin", { minimum_level: 2 });
    const c = await asRole("centre_admin");
    await record(c, item.id, "count", 4);
    expect((await level(item.id)).status).toBe("in_stock");
    await c.from("items").update({ minimum_level: 10 }).eq("id", item.id);
    expect((await level(item.id)).status).toBe("low");
  });
});

// ---------------------------------------------------------------------------
describe("adjustments (corrections of an earlier entry)", () => {
  it("a pending adjustment changes nothing; once a different admin approves, it replaces the wrong number", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    await record(me, item.id, "count", 10);
    const restock = await record(me, item.id, "restock", 5);
    await record(me, item.id, "count", 12);
    await record(me, item.id, "restock", 4);
    expect(await level(item.id)).toMatchObject({ quantity: 16, usage_since_previous_count: 3 });

    // The first restock was really 8, not 5: usage between counts was 6, not 3.
    const adj = await askToCorrect(me, restock, 8);
    expect(adj.status).toBe("pending");
    expect(await level(item.id)).toMatchObject({ quantity: 16, usage_since_previous_count: 3 });

    const { data, error } = await decide(await secondCentreAdmin(), adj, "approved");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(await level(item.id)).toMatchObject({ quantity: 16, usage_since_previous_count: 6 });

    // The original entry is untouched.
    const original = await masterKeyClient().from("stock_movements").select("quantity").eq("id", restock.id).single();
    expect(original.data!.quantity).toBe(5);
  });

  it("correcting the latest count changes the quantity now", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    await record(me, item.id, "restock", 2);
    const adj = await askToCorrect(me, count, 15, "Counted only the front row");
    await decide(await asRole("super_admin"), adj, "approved");
    expect((await level(item.id)).quantity).toBe(17);
  });

  it("the approver and the time of approval are filled in by the database", async () => {
    const item = await newConsumable();
    const entry = await record(await asRole("centre_admin"), item.id, "count", 5);
    const adj = await askToCorrect(await asRole("centre_admin"), entry, 6);
    const approver = await asRole("super_admin");
    const { data } = await approver
      .from("stock_movements")
      .update({ status: "approved", decided_by: (await (await asRole("centre_admin")).auth.getUser()).data.user!.id })
      .eq("id", adj.id)
      .select()
      .single();
    expect(data!.decided_by).toBe((await approver.auth.getUser()).data.user!.id);
    expect(data!.decided_at).not.toBeNull();
  });

  it("a rejected adjustment changes nothing, and rejecting needs a reason", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 9);
    const adj = await askToCorrect(me, count, 90);
    const other = await secondCentreAdmin();
    const noReason = await decide(other, adj, "rejected");
    expect(noReason.error?.message).toMatch(/reason/i);
    const ok = await decide(other, adj, "rejected", "Shelf was checked again: 9 is right");
    expect(ok.error).toBeNull();
    expect((await level(item.id)).quantity).toBe(9);
  });

  it("the latest approved correction wins when an entry is corrected twice", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    const other = await secondCentreAdmin();
    await decide(other, await askToCorrect(me, count, 6), "approved");
    await decide(other, await askToCorrect(me, count, 7), "approved");
    expect((await level(item.id)).quantity).toBe(7);
  });

  it("an adjustment needs a reason and a link to the entry it corrects", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    for (const row of [
      { item_id: item.id, kind: "adjustment", corrects_id: count.id, quantity: 6 },
      { item_id: item.id, kind: "adjustment", corrects_id: count.id, quantity: 6, reason: "   " },
      { item_id: item.id, kind: "adjustment", quantity: 6, reason: "No link" },
    ] as Record<string, unknown>[]) {
      const { error } = await me.from("stock_movements").insert(row);
      expect(error, JSON.stringify(row)).not.toBeNull();
    }
  });

  it("must correct a count or restock of the same item, and must change the number", async () => {
    const a = await newConsumable();
    const b = await newConsumable();
    const me = await asRole("centre_admin");
    const countA = await record(me, a.id, "count", 5);
    const adj = await askToCorrect(me, countA, 6);
    for (const row of [
      { item_id: b.id, kind: "adjustment", corrects_id: countA.id, quantity: 6, reason: "Other item" },
      { item_id: a.id, kind: "adjustment", corrects_id: adj.id, quantity: 7, reason: "Correcting a correction" },
    ]) {
      const { error } = await me.from("stock_movements").insert(row);
      expect(error, row.reason).not.toBeNull();
    }
    const countB = await record(me, b.id, "count", 3);
    const same = await me.from("stock_movements").insert({ item_id: b.id, kind: "adjustment", corrects_id: countB.id, quantity: 3, reason: "Same" });
    expect(same.error?.message).toMatch(/already/i);
  });

  it("only one correction of an entry can wait for approval at a time", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    await askToCorrect(me, count, 6);
    const { error } = await me
      .from("stock_movements")
      .insert({ item_id: item.id, kind: "adjustment", corrects_id: count.id, quantity: 7, reason: "Again" });
    expect(error).not.toBeNull();
  });

  it("cannot be entered as already approved", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    const { error } = await me
      .from("stock_movements")
      .insert({ item_id: item.id, kind: "adjustment", corrects_id: count.id, quantity: 6, reason: "Sneaky", status: "approved" });
    expect(error).not.toBeNull();
  });

  it("only the decision can change: not the number, the reason or the entry it corrects", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    const adj = await askToCorrect(me, count, 6);
    const other = await secondCentreAdmin();
    for (const change of [{ quantity: 60 }, { reason: "Changed" }, { status: "approved", quantity: 60 }]) {
      const { error } = await other.from("stock_movements").update(change).eq("id", adj.id);
      expect(error, JSON.stringify(change)).not.toBeNull();
    }
  });

  it("a decision is final", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    const adj = await askToCorrect(me, count, 6);
    const other = await secondCentreAdmin();
    await decide(other, adj, "approved");
    const again = await decide(other, adj, "rejected", "Changed my mind");
    expect(again.data ?? []).toHaveLength(0);
    const back = await other.from("stock_movements").update({ status: "pending" }).eq("id", adj.id).select();
    expect(back.data ?? []).toHaveLength(0);
    const master = await masterKeyClient().from("stock_movements").update({ status: "rejected", decision_note: "x" }).eq("id", adj.id);
    expect(master.error).not.toBeNull();
    const still = await masterKeyClient().from("stock_movements").select("status").eq("id", adj.id).single();
    expect(still.data!.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
describe("nobody approves their own adjustment", () => {
  for (const role of admins) {
    it(`${role} cannot approve or reject an adjustment they entered`, async () => {
      const item = await newConsumable();
      const me = await asRole(role);
      const count = await record(me, item.id, "count", 5);
      const adj = await askToCorrect(me, count, 6);
      const approve = await decide(me, adj, "approved");
      expect(approve.error?.message).toMatch(/different admin/i);
      const reject = await decide(me, adj, "rejected", "Never mind");
      expect(reject.error?.message).toMatch(/different admin/i);
      expect((await level(item.id)).quantity).toBe(5);
    });
  }

  it("the master key (no signed-in person) cannot approve either", async () => {
    const item = await newConsumable();
    const me = await asRole("centre_admin");
    const count = await record(me, item.id, "count", 5);
    const adj = await askToCorrect(me, count, 6);
    const { error } = await decide(masterKeyClient(), adj, "approved");
    expect(error).not.toBeNull();
  });
});
