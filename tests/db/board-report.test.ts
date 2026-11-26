// Slice P5.6 (docs/PHASE-5.md section 8; owner approved 25 Nov 2026): the
// monthly Board report. Counts and totals only, never a person's name.
// Spend is what was approved in the month, with corrections as the new
// line in and the old line out. A final copy is made only for a month that
// is over, only by the database, never changes and is never deleted.
// Signed-out visitors, the Library Operator, a switched-off account and a
// password-only sign-in get nothing.
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName } from "./clients";
import type { SupabaseClient } from "@supabase/supabase-js";

const email = (prefix: string) => SEED_ADMINS.find((a) => a.email.startsWith(prefix))!.email;
const centre = () => asRole("centre_admin");
const centreB = () => signedInClient(email("second.admin"));

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "the Library Operator", client: () => asRole("library_operator") },
  { label: "a switched-off account", client: () => signedInClient(seedAdmin("centre_admin", false).email) },
  { label: "a password-only sign-in", client: () => passwordOnlyClient(email("finance.two")) },
];

const thisMonth = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" }).slice(0, 7);
const lastMonth = () => {
  const [y, m] = thisMonth().split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};

type Report = { month: string; during: Record<string, unknown> & { spend_cents: number; by_fund: { name: string; cents: number }[]; by_category: { name: string; cents: number }[] }; as_at: Record<string, number> };

async function report(c: SupabaseClient, month = thisMonth()): Promise<Report> {
  const { data, error } = await c.rpc("board_report", { p_month: month });
  if (error) throw error;
  return data as Report;
}

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="), (ch) => ch.charCodeAt(0));

async function approvedClaim(amount: number, fundName = "Unrestricted") {
  const c = await centre();
  const m = masterKeyClient();
  const other = (await m.from("expense_categories").select("id").eq("name", "Other").single()).data!.id;
  const fund = (await m.from("expense_funds").select("id").eq("name", fundName).single()).data!.id;
  const path = `claims/test/${crypto.randomUUID()}.png`;
  await c.storage.from("expense-receipts").upload(path, PNG, { contentType: "image/png" });
  const { data: id, error } = await c.rpc("enter_expense_claim", {
    p_amount_cents: amount,
    p_receipt_date: new Date().toISOString().slice(0, 10),
    p_category_id: other,
    p_description: testName("board claim"),
    p_payment: "centre_direct",
    p_files: [path],
  });
  if (error) throw error;
  const d = await (await centreB()).from("expense_decisions").insert({ claim_id: id, kind: "approved", fund_id: fund });
  if (d.error) throw d.error;
  return { id: id as number, other, fund };
}

const fundCents = (r: Report, name: string) => r.during.by_fund.find((f) => f.name === name)?.cents ?? 0;

describe("who can see the Board report", () => {
  for (const who of noAccess) {
    it(`${who.label} gets nothing`, async () => {
      const c = await who.client();
      expect((await c.rpc("board_report", { p_month: thisMonth() })).error).not.toBeNull();
      expect((await c.rpc("make_board_report_copy", { p_month: lastMonth() })).error).not.toBeNull();
      expect((await c.from("board_report_copies").select("*").limit(1)).data ?? []).toHaveLength(0);
    });
  }

  for (const role of ["super_admin", "centre_admin", "finance"]) {
    it(`${role} reads it: counts and totals only, no names of people`, async () => {
      const r = await report(await asRole(role));
      expect(r.month).toBe(thisMonth());
      for (const key of ["spend_cents", "tickets_opened", "items_registered", "loans", "copies_lost"]) expect(typeof r.during[key], key).toBe("number");
      for (const key of ["claims_waiting", "owed_cents", "assets_value_cents", "vetting_expired", "books_overdue"]) expect(typeof r.as_at[key], key).toBe("number");
      const { data: people } = await masterKeyClient().from("people").select("full_name").limit(1000);
      const text = JSON.stringify(r);
      for (const p of people ?? []) expect(text.includes(p.full_name), p.full_name).toBe(false);
    });
  }

  it("refuses a month that is not a month", async () => {
    expect((await (await centre()).rpc("board_report", { p_month: "2026-13" })).error?.message).toMatch(/choose a month/i);
  });
});

describe("spend in the month", () => {
  it("adds approved claims; a correction adds the difference; a fund-only correction moves money between funds", async () => {
    const before = await report(await centre());
    const { id, other, fund } = await approvedClaim(1000);
    let r = await report(await centre());
    expect(r.during.spend_cents - before.during.spend_cents).toBe(1000);
    expect(fundCents(r, "Unrestricted") - fundCents(before, "Unrestricted")).toBe(1000);

    // Corrected to €15: the old €10 out, the new €15 in.
    const c = await centre();
    const fix = await c.rpc("enter_expense_claim", {
      p_amount_cents: 1500,
      p_receipt_date: new Date().toISOString().slice(0, 10),
      p_category_id: other,
      p_description: null,
      p_payment: "centre_direct",
      p_suggested_fund_id: fund,
      p_corrects_id: id,
      p_correction_reason: "Test: receipt said €15",
    });
    expect(fix.error).toBeNull();
    await (await centreB()).from("expense_decisions").insert({ claim_id: fix.data, kind: "approved", fund_id: fund });
    r = await report(await centre());
    expect(r.during.spend_cents - before.during.spend_cents).toBe(1500);

    // Moved to Zakat: total unchanged, Unrestricted down, Zakat up.
    const zakat = (await masterKeyClient().from("expense_funds").select("id").eq("name", "Zakat").single()).data!.id;
    const move = await c.rpc("enter_expense_claim", {
      p_amount_cents: 1500,
      p_receipt_date: new Date().toISOString().slice(0, 10),
      p_category_id: other,
      p_description: null,
      p_payment: "centre_direct",
      p_suggested_fund_id: zakat,
      p_corrects_id: id,
      p_correction_reason: "Test: should have been Zakat",
    });
    expect(move.error).toBeNull();
    await (await centreB()).from("expense_decisions").insert({ claim_id: move.data, kind: "approved", fund_id: zakat });
    const after = await report(await centre());
    expect(after.during.spend_cents).toBe(r.during.spend_cents);
    expect(fundCents(after, "Unrestricted") - fundCents(r, "Unrestricted")).toBe(-1500);
    expect(fundCents(after, "Zakat") - fundCents(r, "Zakat")).toBe(1500);
    // By category and by fund always add up to the same total.
    expect(after.during.by_category.reduce((n, x) => n + x.cents, 0)).toBe(after.during.spend_cents);
    expect(after.during.by_fund.reduce((n, x) => n + x.cents, 0)).toBe(after.during.spend_cents);
  });

  it("a ticket's cost is never counted as spending", async () => {
    const before = await report(await centre());
    const c = await centre();
    const { data: place } = await masterKeyClient().from("locations").select("id").eq("active", true).eq("kind", "room").limit(1).single();
    const t = await c.from("maintenance_tickets").insert({ description: testName("ticket with a cost"), location_id: place!.id, reported_by: "Test reporter" }).select("id").single();
    expect(t.error).toBeNull();
    const closed = await c.rpc("close_maintenance_ticket", { p_ticket_id: t.data!.id, p_note: "Fixed", p_cost_cents: 99900, p_repaired_condition: null });
    expect(closed.error).toBeNull();
    const after = await report(await centre());
    expect(after.during.spend_cents).toBe(before.during.spend_cents);
    expect((after.during.tickets_closed as number) - (before.during.tickets_closed as number)).toBe(1);
  });
});

describe("the final copy", () => {
  it("is refused while the month is open, and made by the database once it is over; both copies are kept", async () => {
    const c = await asRole("finance");
    expect((await c.rpc("make_board_report_copy", { p_month: thisMonth() })).error?.message).toMatch(/not over yet/i);
    const first = await c.rpc("make_board_report_copy", { p_month: lastMonth() });
    expect(first.error).toBeNull();
    const second = await (await centre()).rpc("make_board_report_copy", { p_month: lastMonth() });
    expect(second.error).toBeNull();
    const { data } = await c.from("board_report_copies").select("id, month, report").eq("month", lastMonth()).in("id", [first.data, second.data]);
    expect(data).toHaveLength(2);
    expect((data![0].report as Report).month).toBe(lastMonth());
  });

  it("cannot be typed in, changed or deleted, not even with the master key", async () => {
    const fake = { month: lastMonth(), report: { during: { spend_cents: 1 } } };
    expect((await (await asRole("super_admin")).from("board_report_copies").insert(fake)).error).not.toBeNull();
    const m = masterKeyClient();
    expect((await m.from("board_report_copies").insert(fake)).error).not.toBeNull();
    const made = await (await asRole("super_admin")).rpc("make_board_report_copy", { p_month: lastMonth() });
    expect((await m.from("board_report_copies").update({ report: {} }).eq("id", made.data)).error).not.toBeNull();
    expect((await m.from("board_report_copies").delete().eq("id", made.data)).error).not.toBeNull();
  });
});
