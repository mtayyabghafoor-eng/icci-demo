// Slice P1.14: how items leave (migration 0040). Every new disposal picks a
// route; a sale needs its details; charity and returned-to-owner need a
// name; the route can never change afterwards; a different admin still
// approves. Enforced by the database itself, so tested against it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient } from "./clients";
import { newFixedAsset } from "./items-helpers";

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
const base = { note: "Test note: made-up disposal", reported_by: "Test volunteer (fictional)" };
const sale = { sale_price_cents: 2500, sale_buyer: "Test Buyer (fictional)", sale_date: "2026-11-01", sale_money_taken_by: "Test Treasurer (fictional)" };

async function dispose(c: SupabaseClient, extra: Record<string, unknown>) {
  const item = await newFixedAsset();
  return c.from("asset_events").insert({ item_id: item.id, kind: "disposal", ...base, ...extra }).select().single();
}

describe("every new disposal says how the item left", () => {
  it.each([
    [{ disposal_route: "recycled" }],
    [{ disposal_route: "shredded" }],
    [{ disposal_route: "thrown_away" }],
    [{ disposal_route: "religious_texts" }],
    [{ disposal_route: "charity", disposal_recipient: "Test Charity (fictional)" }],
    [{ disposal_route: "returned_to_owner", disposal_recipient: "Test Owner (fictional)" }],
    [{ disposal_route: "sold", ...sale }],
  ])("accepts %o", async (extra) => {
    const { data, error } = await dispose(await asRole("centre_admin"), extra);
    expect(error).toBeNull();
    expect(data).toMatchObject({ status: "pending", ...extra });
  });

  it.each([
    [{}, /Choose how the item is leaving/],
    [{ disposal_route: "burnt" }, /disposal_route/],
    [{ disposal_route: "charity" }, /name of the charity/],
    [{ disposal_route: "returned_to_owner", disposal_recipient: "  " }, /owner's name/],
    [{ disposal_route: "sold", ...sale, sale_price_cents: null }, /price/],
    [{ disposal_route: "sold", ...sale, sale_buyer: "" }, /buyer/],
    [{ disposal_route: "sold", ...sale, sale_date: null }, /date of the sale/],
    [{ disposal_route: "sold", ...sale, sale_date: "2099-01-01" }, /future/],
    [{ disposal_route: "sold", ...sale, sale_money_taken_by: null }, /who took the money/],
    [{ disposal_route: "sold", ...sale, sale_price_cents: -1 }, /sale_price_cents/],
    [{ disposal_route: "recycled", ...sale }, /only for an item that was sold/],
    [{ disposal_route: "shredded", disposal_recipient: "Test Someone" }, /only kept for a charity or an owner/],
  ])("refuses %o", async (extra, message) => {
    const { error } = await dispose(await asRole("centre_admin"), extra);
    expect(error?.message).toMatch(message);
  });

  it("only a disposal has a route or sale details", async () => {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    for (const extra of [{ disposal_route: "recycled" }, { sale_buyer: "Test Buyer" }, { disposal_recipient: "Test Charity" }]) {
      const { error } = await c.from("asset_events").insert({ item_id: item.id, kind: "damage", ...base, ...extra });
      expect(error?.message, JSON.stringify(extra)).toMatch(/Only a disposal says how the item left/);
    }
  });
});

describe("the route cannot change, and a different admin still decides", () => {
  it("the approver cannot change the route or the sale while deciding", async () => {
    const { data: ev } = await dispose(await asRole("centre_admin"), { disposal_route: "sold", ...sale });
    const second = await secondCentreAdmin();
    for (const change of [{ disposal_route: "recycled" }, { sale_price_cents: 1 }, { sale_buyer: "Someone else" }, { disposal_recipient: "Test" }]) {
      const { error } = await second.from("asset_events").update({ status: "approved", ...change }).eq("id", ev!.id);
      expect(error?.message, JSON.stringify(change)).toMatch(/cannot be changed/);
    }
    // Not even the master key can change it.
    const { error } = await masterKeyClient().from("asset_events").update({ sale_price_cents: 1 }).eq("id", ev!.id);
    expect(error?.message).toMatch(/cannot be changed|Only the decision|can only be approved or rejected/);
  });

  it("a different admin approves a sale; the sender cannot", async () => {
    const me = await signedInClient(seedAdmin("centre_admin").email);
    const { data: ev } = await dispose(me, { disposal_route: "sold", ...sale });
    const own = await me.from("asset_events").update({ status: "approved" }).eq("id", ev!.id).select();
    expect(own.error?.message ?? (own.data?.length === 0 ? "no row" : "")).toMatch(/different admin|no row/);
    const ok = await (await secondCentreAdmin()).from("asset_events").update({ status: "approved" }).eq("id", ev!.id).select().single();
    expect(ok.error).toBeNull();
    expect(ok.data).toMatchObject({ status: "approved", disposal_route: "sold", sale_price_cents: 2500 });
  });
});

describe("nobody without access can record a disposal route", () => {
  for (const [label, client] of [
    ["a signed-out visitor", async () => signedOutClient()],
    ["finance", () => asRole("finance")],
    ["library_operator", () => asRole("library_operator")],
    ["a deactivated account", () => asRole("centre_admin", false)],
    ["a password-only sign-in", () => passwordOnlyClient(seedAdmin("centre_admin").email)],
  ] as [string, () => Promise<SupabaseClient>][]) {
    it(`${label} cannot`, async () => {
      const { error } = await dispose(await client(), { disposal_route: "sold", ...sale });
      expect(error).not.toBeNull();
    });
  }
});
