// Slices P5.2 to P5.4 (docs/PHASE-5.md sections 6 and 14; owner approved
// every recommended answer, 25 Nov 2026): expense claims, receipts,
// decisions, repayments and corrections, all enforced by the database.
//   * Super Admin, Centre Admin and Finance enter and read claims; the
//     Library Operator, a switched-off account, a password-only sign-in and
//     a signed-out visitor get nothing.
//   * A claim has a receipt (1 to 3 files, added in the same step) or a
//     reason it is lost. It never changes. It can be withdrawn by whoever
//     entered it, and entered again (once) with the same receipt.
//   * Nobody approves their own entry or money they paid; an approver must
//     be linked to People; above €500 (or €50 without a receipt) a third
//     person gives a second approval.
//   * Repayments: never to yourself, never by whoever entered the claim or
//     its correction (migration 0053), only approved claims of one person's
//     own money, never twice; withdrawn once with a reason.
//   * Corrections: only of an approved claim, one at a time, same approval
//     rules, the amount rule on the corrected total; not decided by whoever
//     entered the claim (0053). A repaid claim corrected to less shows money
//     to get back (0053).
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";
import type { SupabaseClient } from "@supabase/supabase-js";

const email = (prefix: string) => SEED_ADMINS.find((a) => a.email.startsWith(prefix))!.email;
const superA = () => asRole("super_admin"); // not linked
const superB = () => signedInClient(email("super.two")); // linked
const centre = () => asRole("centre_admin"); // linked
const centreB = () => signedInClient(email("second.admin")); // linked
const financeA = () => asRole("finance"); // not linked
const financeB = () => signedInClient(email("finance.two")); // linked

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "the Library Operator", client: () => asRole("library_operator") },
  { label: "a switched-off account", client: () => signedInClient(seedAdmin("centre_admin", false).email) },
  { label: "a password-only sign-in", client: () => passwordOnlyClient(email("finance.two")) },
];

const TABLES = ["expense_claims", "expense_files", "expense_decisions", "expense_repayments", "expense_repayment_claims", "expense_entries", "expense_claim_list"];

// A tiny real PNG (1 by 1 pixel).
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="),
  (ch) => ch.charCodeAt(0),
);

let lists: { other: string; repairs: string; unrestricted: string; zakat: string } | null = null;
async function ids() {
  if (lists) return lists;
  const m = masterKeyClient();
  const cats = (await m.from("expense_categories").select("id, name")).data!;
  const funds = (await m.from("expense_funds").select("id, name")).data!;
  lists = {
    other: cats.find((c) => c.name === "Other")!.id,
    repairs: cats.find((c) => c.name === "Repairs and maintenance")!.id,
    unrestricted: funds.find((f) => f.name === "Unrestricted")!.id,
    zakat: funds.find((f) => f.name === "Zakat")!.id,
  };
  return lists;
}

/** The person record linked to a seed account. */
async function personOf(accountEmail: string): Promise<string> {
  const { data } = await masterKeyClient().from("people").select("id").eq("app_user_id", userIdOf(accountEmail)).single();
  return data!.id;
}

/** A switched-on seed person with no admin account (someone who paid). */
let payerIds: string[] | null = null;
async function payer(n = 0): Promise<string> {
  if (!payerIds) {
    const { data } = await masterKeyClient().from("people").select("id").eq("active", true).is("app_user_id", null).like("full_name", "Test %").not("full_name", "like", "Test run%").order("full_name").limit(5);
    payerIds = data!.map((p) => p.id);
  }
  return payerIds[n];
}

async function upload(c: SupabaseClient): Promise<string> {
  const path = `claims/test/${crypto.randomUUID()}.png`;
  const { error } = await c.storage.from("expense-receipts").upload(path, PNG, { contentType: "image/png" });
  if (error) throw error;
  return path;
}

type Claim = {
  amount?: number;
  payment?: "centre_direct" | "centre_card" | "personal";
  paidBy?: string | null;
  lost?: string | null;
  files?: string[] | null;
  date?: string;
  vat?: number | null;
  category?: string;
  copiedFrom?: number | null;
};

async function enter(c: SupabaseClient, o: Claim = {}) {
  const l = await ids();
  const payment = o.payment ?? "personal";
  const files = o.files === undefined ? (o.lost ? [] : [await upload(c)]) : (o.files ?? []);
  return c.rpc("enter_expense_claim", {
    p_amount_cents: o.amount ?? 4500,
    p_receipt_date: o.date ?? "2026-11-01",
    p_category_id: o.category ?? l.other,
    p_description: testName("claim"),
    p_payment: payment,
    p_paid_by_person_id: o.paidBy !== undefined ? o.paidBy : payment === "centre_direct" ? null : await payer(),
    p_vat_cents: o.vat ?? null,
    p_receipt_lost_reason: o.lost ?? null,
    p_files: files,
    p_copied_from_id: o.copiedFrom ?? null,
  });
}

async function newClaim(c: SupabaseClient, o: Claim = {}): Promise<number> {
  const { data, error } = await enter(c, o);
  if (error) throw error;
  return data as number;
}

const decide = async (c: SupabaseClient, claim: number, kind: string, extra: { fund_id?: string | null; note?: string } = {}) =>
  c.from("expense_decisions").insert({ claim_id: claim, kind, ...extra });

async function approve(c: SupabaseClient, claim: number, fund?: string) {
  const { error } = await decide(c, claim, "approved", { fund_id: fund ?? (await ids()).unrestricted });
  if (error) throw error;
}

async function row(claim: number) {
  const { data } = await masterKeyClient().from("expense_claim_list").select("*").eq("id", claim).single();
  return data!;
}

async function entry(claim: number) {
  const { data } = await masterKeyClient().from("expense_entries").select("*").eq("id", claim).single();
  return data!;
}

// ---------------------------------------------------------------------------
describe("who can see and enter expense claims", () => {
  for (const who of noAccess) {
    it(`${who.label} sees nothing, enters nothing and runs none of the look-ups`, async () => {
      const c = await who.client();
      for (const t of TABLES) expect((await c.from(t).select("*").limit(3)).data ?? [], t).toHaveLength(0);
      expect((await enter(c, { files: [], lost: "gone" })).error).not.toBeNull();
      expect((await c.storage.from("expense-receipts").upload(`claims/test/${crypto.randomUUID()}.png`, PNG, { contentType: "image/png" })).error).not.toBeNull();
      for (const fn of ["expense_people", "expense_companies", "expense_tickets"]) {
        const r = await c.rpc(fn);
        expect(r.error !== null || (r.data as unknown[]).length === 0, fn).toBe(true);
      }
      expect((await c.rpc("expense_counters")).error).not.toBeNull();
      expect((await c.rpc("record_expense_repayment", { p_claim_ids: [1], p_paid_on: "2026-11-01", p_method: "cash" })).error).not.toBeNull();
    });
  }

  for (const [label, client] of [["Super Admin", superA], ["Centre Admin", centre], ["Finance", financeA]] as const) {
    it(`${label} enters a claim with a receipt photo, and reads it and its file`, async () => {
      const c = await client();
      const id = await newClaim(c);
      const r = await row(id);
      expect(r.state).toBe("waiting");
      expect(r.file_count).toBe(1);
      const seen = await c.from("expense_claim_list").select("id, state").eq("id", id).single();
      expect(seen.data).toEqual({ id, state: "waiting" });
      const file = await c.from("expense_files").select("file_path").eq("claim_id", id).single();
      expect((await c.storage.from("expense-receipts").download(file.data!.file_path)).error).toBeNull();
    });
  }

  it("the narrow look-ups give Finance names only, and say which person is linked to an account", async () => {
    const f = await financeA();
    expect((await f.from("people").select("id").limit(1)).data ?? []).toHaveLength(0);
    const people = (await f.rpc("expense_people")).data as { id: string; full_name: string; has_account: boolean; is_me: boolean }[];
    expect(people.length).toBeGreaterThan(30);
    expect(Object.keys(people[0]).sort()).toEqual(["active", "full_name", "has_account", "id", "is_me"]);
    expect(people.find((p) => p.full_name === "Test Centre Admin")!.has_account).toBe(true);
    expect(people.some((p) => p.is_me)).toBe(false);
    const mine = ((await (await financeB()).rpc("expense_people")).data as { full_name: string; is_me: boolean }[]).filter((p) => p.is_me);
    expect(mine.map((p) => p.full_name)).toEqual(["Test Second Finance Officer"]);
    expect(((await f.rpc("expense_tickets")).data as unknown[]).length).toBeGreaterThan(0);
    expect((await f.rpc("expense_companies")).error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("entering a claim", () => {
  it("needs a receipt file or a reason it is lost", async () => {
    const { error } = await enter(await centre(), { files: [] });
    expect(error?.message).toMatch(/receipt lost/i);
    expect((await enter(await centre(), { files: [], lost: "Till receipt blew away" })).error).toBeNull();
    const lost = await row(await newClaim(await centre(), { lost: "Never given one" }));
    expect(lost.file_count).toBe(0);
    expect(lost.receipt_lost_reason).toBe("Never given one");
  });

  it("takes up to three receipt files, each one really in the store", async () => {
    const c = await centre();
    const three = await newClaim(c, { files: [await upload(c), await upload(c), await upload(c)] });
    expect((await row(three)).file_count).toBe(3);
    expect((await enter(c, { files: [await upload(c), await upload(c), await upload(c), await upload(c)] })).error?.message).toMatch(/at most 3/i);
    expect((await enter(c, { files: [`claims/test/${crypto.randomUUID()}.png`] })).error?.message).toMatch(/not found/i);
    expect((await enter(c, { files: [await upload(c)], lost: "and lost too" })).error?.message).toMatch(/receipt lost/i);
  });

  it("one receipt file can only be on one live claim", async () => {
    const c = await centre();
    const path = await upload(c);
    await newClaim(c, { files: [path] });
    expect((await enter(await centreB(), { files: [path] })).error?.message).toMatch(/already on another claim/i);
    const twice = await upload(c);
    expect((await enter(c, { files: [twice, twice] })).error?.message).toMatch(/already on another claim/i);
  });

  it("refuses a future date, VAT above the amount, a switched-off category and the wrong payer shape", async () => {
    const c = await centre();
    expect((await enter(c, { date: "2999-01-01" })).error?.message).toMatch(/future/i);
    expect((await enter(c, { amount: 1000, vat: 1001 })).error).not.toBeNull();
    expect((await enter(c, { amount: 0 })).error).not.toBeNull();
    expect((await enter(c, { amount: 100000001 })).error).not.toBeNull();
    expect((await enter(c, { payment: "centre_direct", paidBy: await payer() })).error).not.toBeNull();
    expect((await enter(c, { payment: "personal", paidBy: null })).error).not.toBeNull();
    const { data: off } = await masterKeyClient().from("expense_categories").insert({ name: testName("off category"), active: false }).select("id").single();
    expect((await enter(c, { category: off!.id })).error?.message).toMatch(/switched off/i);
    const { data: gone } = await masterKeyClient().from("people").select("id").eq("active", false).limit(1).single();
    expect((await enter(c, { paidBy: gone!.id })).error?.message).toMatch(/switched off/i);
    expect((await enter(c, { payment: "centre_direct" })).error).toBeNull();
  });

  it("never changes and is never deleted, and no receipt can be added afterwards", async () => {
    const c = await centre();
    const id = await newClaim(c);
    const { data } = await c.from("expense_claims").update({ amount_cents: 1 }).eq("id", id).select("id");
    expect(data ?? []).toHaveLength(0);
    const m = masterKeyClient();
    expect((await m.from("expense_claims").update({ amount_cents: 1 }).eq("id", id)).error?.message).toMatch(/never changes/i);
    expect((await m.from("expense_claims").delete().eq("id", id)).error).not.toBeNull();
    expect((await m.from("expense_files").delete().eq("claim_id", id)).error).not.toBeNull();
    expect((await c.from("expense_files").insert({ claim_id: id, position: 2, file_path: await upload(c) })).error?.message).toMatch(/when the claim is entered/i);
    expect((await row(id)).amount_cents).toBe(4500);
  });

  it("is withdrawn only by whoever entered it, with a reason, while still waiting", async () => {
    const c = await centre();
    const id = await newClaim(c);
    expect((await decide(await centreB(), id, "withdrawn", { note: "not mine" })).error?.message).toMatch(/only the person who entered/i);
    expect((await decide(c, id, "withdrawn")).error?.message).toMatch(/say why/i);
    expect((await decide(c, id, "withdrawn", { note: "Typed the wrong amount" })).error).toBeNull();
    expect((await row(id)).state).toBe("withdrawn");
    expect((await decide(await centreB(), id, "approved", { fund_id: (await ids()).unrestricted })).error?.message).toMatch(/already been decided/i);

    const approved = await newClaim(c);
    await approve(await centreB(), approved);
    expect((await decide(c, approved, "withdrawn", { note: "too late" })).error?.message).toMatch(/still waiting/i);
  });

  it("'Enter again' copies a withdrawn or rejected claim once, with the same receipt files", async () => {
    const c = await centre();
    const waiting = await newClaim(c);
    expect((await enter(c, { copiedFrom: waiting })).error?.message).toMatch(/withdrawn or rejected/i);

    const id = await newClaim(c);
    await decide(c, id, "withdrawn", { note: "Wrong date" });
    const { data: files } = await c.from("expense_files").select("file_path").eq("claim_id", id);
    const again = await newClaim(c, { copiedFrom: id, files: files!.map((f) => f.file_path), date: "2026-10-31" });
    const copy = await row(again);
    expect(copy.copied_from_id).toBe(id);
    expect(copy.file_count).toBe(1);
    expect((await enter(c, { copiedFrom: id, files: files!.map((f) => f.file_path) })).error).not.toBeNull();

    const rejected = await newClaim(c);
    await decide(await centreB(), rejected, "rejected", { note: "No such purchase" });
    expect((await enter(c, { copiedFrom: rejected })).error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("approving and rejecting", () => {
  it("nobody approves or rejects a claim they entered", async () => {
    const c = await centre();
    const id = await newClaim(c);
    const { error } = await decide(c, id, "approved", { fund_id: (await ids()).unrestricted });
    expect(error?.message).toMatch(/you entered this claim/i);
    expect((await decide(c, id, "rejected", { note: "x" })).error?.message).toMatch(/you entered this claim/i);
    expect((await row(id)).state).toBe("waiting");
  });

  it("nobody approves money they paid themselves", async () => {
    const id = await newClaim(await superB(), { paidBy: await personOf(email("centre.admin")) });
    const { error } = await decide(await centre(), id, "approved", { fund_id: (await ids()).unrestricted });
    expect(error?.message).toMatch(/you paid this money yourself/i);
    await approve(await centreB(), id);
    expect((await row(id)).state).toBe("approved");
  });

  it("an account not linked to People cannot approve or reject (question 2A)", async () => {
    const id = await newClaim(await centre());
    for (const c of [await superA(), await financeA()]) {
      expect((await decide(c, id, "approved", { fund_id: (await ids()).unrestricted })).error?.message).toMatch(/not linked/i);
      expect((await decide(c, id, "rejected", { note: "x" })).error?.message).toMatch(/not linked/i);
    }
  });

  for (const [label, client] of [["Super Admin", superB], ["Finance", financeB], ["Centre Admin", centreB]] as const) {
    it(`a linked ${label} approves a claim under €500 with a fund, in one step`, async () => {
      const id = await newClaim(await centre(), { amount: 50000 });
      const c = await client();
      expect((await decide(c, id, "approved")).error?.message).toMatch(/choose the fund/i);
      await approve(c, id, (await ids()).zakat);
      const r = await row(id);
      expect(r.state).toBe("approved");
      expect(r.fund_id).toBe((await ids()).zakat);
      expect(r.approved_at).not.toBeNull();
    });
  }

  it("rejecting needs a reason and is final", async () => {
    const id = await newClaim(await centre());
    const b = await centreB();
    expect((await decide(b, id, "rejected")).error?.message).toMatch(/needs a reason/i);
    expect((await decide(b, id, "rejected", { note: "Personal shopping" })).error).toBeNull();
    const r = await row(id);
    expect(r.state).toBe("rejected");
    expect(r.closed_note).toBe("Personal shopping");
    expect((await decide(await financeB(), id, "approved", { fund_id: (await ids()).unrestricted })).error?.message).toMatch(/already been decided/i);
  });

  it("above €500 a third person gives a second approval; not whoever entered, paid or gave the first", async () => {
    const id = await newClaim(await centre(), { amount: 50001, paidBy: await personOf(email("finance.two")) });
    await approve(await centreB(), id);
    let r = await row(id);
    expect(r.state).toBe("second");
    expect(r.needs_second).toBe(true);
    expect(r.approved_at).toBeNull();
    expect((await decide(await centreB(), id, "approved", { fund_id: (await ids()).unrestricted })).error?.message).toMatch(/already has its first approval/i);
    expect((await decide(await centreB(), id, "second_approved")).error?.message).toMatch(/first approval/i);
    expect((await decide(await centre(), id, "second_approved")).error?.message).toMatch(/you entered/i);
    expect((await decide(await financeB(), id, "second_approved")).error?.message).toMatch(/paid this money yourself/i);
    expect((await decide(await superB(), id, "second_approved", { fund_id: (await ids()).zakat })).error).toBeNull();
    r = await row(id);
    expect(r.state).toBe("approved");
    expect(r.fund_id).toBe((await ids()).zakat);
    expect(r.second_by).toBe(userIdOf(email("super.two")));
  });

  it("a claim under €500 cannot be given a second approval, and a second approver may reject", async () => {
    const small = await newClaim(await centre());
    await approve(await centreB(), small);
    expect((await decide(await superB(), small, "second_approved")).error?.message).toMatch(/already been decided/i);

    const big = await newClaim(await centre(), { amount: 70000 });
    await approve(await centreB(), big);
    expect((await decide(await superB(), big, "rejected", { note: "Needs Board approval first" })).error).toBeNull();
    expect((await row(big)).state).toBe("rejected");
  });

  it("without a receipt, a second approval is needed above €50", async () => {
    const c = await centre();
    const under = await newClaim(c, { amount: 5000, lost: "Lost on the bus" });
    await approve(await centreB(), under);
    expect((await row(under)).state).toBe("approved");
    const over = await newClaim(c, { amount: 5001, lost: "Lost on the bus" });
    await approve(await centreB(), over);
    expect((await row(over)).state).toBe("second");
  });

  it("two approvals at the same moment: only one is kept", async () => {
    const id = await newClaim(await centre());
    const fund = (await ids()).unrestricted;
    const results = await Promise.all([decide(await centreB(), id, "approved", { fund_id: fund }), decide(await financeB(), id, "approved", { fund_id: fund })]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
  });

  it("a decision never changes and is never deleted, and a switched-off fund cannot be chosen", async () => {
    const id = await newClaim(await centre());
    await approve(await centreB(), id);
    const m = masterKeyClient();
    expect((await m.from("expense_decisions").update({ note: "changed" }).eq("claim_id", id)).error?.message).toMatch(/never changes/i);
    expect((await m.from("expense_decisions").delete().eq("claim_id", id)).error).not.toBeNull();
    const { data: off } = await m.from("expense_funds").insert({ name: testName("off fund"), restricted: false, active: false }).select("id").single();
    const other = await newClaim(await centre());
    expect((await decide(await centreB(), other, "approved", { fund_id: off!.id })).error?.message).toMatch(/switched off/i);
  });

  it("the Home counter counts only the claims this admin may decide", async () => {
    const before = (await (await centreB()).rpc("expense_counters")).data![0];
    await newClaim(await centre()); // centreB may decide
    await newClaim(await centreB()); // their own: not for them
    const after = (await (await centreB()).rpc("expense_counters")).data![0];
    expect(after.for_me - before.for_me).toBe(1);
    expect(after.waiting - before.waiting).toBe(2);
    expect(after.linked).toBe(true);
    const unlinked = (await (await financeA()).rpc("expense_counters")).data![0];
    expect(unlinked).toMatchObject({ for_me: 0, linked: false });
  });
});

// ---------------------------------------------------------------------------
describe("paying people back", () => {
  async function approvedFor(person: string, amount = 2000) {
    const id = await newClaim(await centre(), { paidBy: person, amount });
    await approve(await centreB(), id);
    return id;
  }
  const repay = (c: SupabaseClient, claims: number[], extra: Record<string, unknown> = {}) =>
    c.rpc("record_expense_repayment", { p_claim_ids: claims, p_paid_on: "2026-11-20", p_method: "bank_transfer", p_reference: "TEST-REF", ...extra });

  it("one repayment covers several claims of one person; they are then no longer owed", async () => {
    const p = await payer(1);
    const a = await approvedFor(p, 1200);
    const b = await approvedFor(p, 3400);
    expect((await row(a)).owed_cents).toBe(1200);
    const { data, error } = await repay(await financeA(), [a, b]);
    expect(error).toBeNull();
    const links = await masterKeyClient().from("expense_repayment_claims").select("claim_id, amount_cents").eq("repayment_id", data).order("claim_id");
    expect(links.data).toEqual([{ claim_id: a, amount_cents: 1200 }, { claim_id: b, amount_cents: 3400 }]);
    expect((await row(a)).owed_cents).toBe(0);
    expect((await repay(await financeA(), [a])).error?.message).toMatch(/already been paid back/i);
  });

  it("refuses a repayment to yourself, a waiting claim, a Centre-paid claim and two people at once", async () => {
    const mine = await newClaim(await centre(), { paidBy: await personOf(email("finance.two")) });
    await approve(await centreB(), mine);
    expect((await repay(await financeB(), [mine])).error?.message).toMatch(/to yourself/i);

    const waiting = await newClaim(await centre());
    expect((await repay(await centre(), [waiting])).error?.message).toMatch(/not approved/i);

    const centrePaid = await newClaim(await centre(), { payment: "centre_card", paidBy: await payer(2) });
    await approve(await centreB(), centrePaid);
    expect((await repay(await superA(), [centrePaid])).error?.message).toMatch(/paid by the Centre/i);

    const one = await approvedFor(await payer(1));
    const two = await approvedFor(await payer(3));
    expect((await repay(await superA(), [one, two])).error?.message).toMatch(/same person/i);
    expect((await repay(await superA(), [])).error?.message).toMatch(/at least one/i);
    expect((await repay(await superA(), [one], { p_paid_on: "2999-01-01" })).error?.message).toMatch(/future/i);
    expect((await row(one)).owed_cents).toBe(2000);
  });

  it("a wrong repayment is withdrawn once, with a reason; the claims are owed again", async () => {
    const a = await approvedFor(await payer(4), 900);
    const { data: id } = await repay(await superA(), [a]);
    const f = await financeA();
    const noReason = await f.from("expense_repayments").update({ withdrawn_reason: " " }).eq("id", id);
    expect(noReason.error?.message).toMatch(/say why|check/i);
    expect((await f.from("expense_repayments").update({ paid_on: "2026-11-01" }).eq("id", id)).error?.message).toMatch(/never changes/i);
    expect((await f.from("expense_repayments").update({ withdrawn_reason: "Paid to the wrong person" }).eq("id", id)).error).toBeNull();
    expect((await row(a)).owed_cents).toBe(900);
    expect((await f.from("expense_repayments").update({ withdrawn_reason: "again" }).eq("id", id)).error?.message).toMatch(/already withdrawn/i);
    expect((await masterKeyClient().from("expense_repayments").delete().eq("id", id)).error).not.toBeNull();
    // Claims cannot be slipped into a repayment later.
    expect((await f.from("expense_repayment_claims").insert({ repayment_id: id, claim_id: a, amount_cents: 1 })).error?.message).toMatch(/when it is recorded/i);
  });

  // Security review 26 Nov 2026, finding 3 (migration 0053): someone could
  // enter a claim for a second People record of their own and pay it back
  // themself. Whoever entered a claim (or its approved correction) cannot
  // record or withdraw its repayment.
  it("whoever entered a claim cannot record or withdraw its repayment", async () => {
    const a = await approvedFor(await payer(1), 700); // entered by the Centre Admin
    expect((await repay(await centre(), [a])).error?.message).toMatch(/you entered EXP-\d+.*different admin/i);
    expect((await row(a)).owed_cents).toBe(700);
    const { data: id, error } = await repay(await superA(), [a]);
    expect(error).toBeNull();
    const withdraw = await (await centre()).from("expense_repayments").update({ withdrawn_reason: "Test: wrong" }).eq("id", id);
    expect(withdraw.error?.message).toMatch(/you entered a claim in this repayment/i);
    expect((await row(a)).owed_cents).toBe(0);
    expect((await (await financeA()).from("expense_repayments").update({ withdrawn_reason: "Test: wrong" }).eq("id", id)).error).toBeNull();
    expect((await row(a)).owed_cents).toBe(700);
  });

  it("whoever entered an approved correction of a claim cannot record its repayment", async () => {
    const a = await approvedFor(await payer(2), 1000);
    const { data: fix, error } = await (await financeB()).rpc("enter_expense_claim", {
      p_amount_cents: 1600,
      p_receipt_date: "2026-11-01",
      p_category_id: (await ids()).other,
      p_description: null,
      p_payment: "personal",
      p_paid_by_person_id: await payer(2),
      p_suggested_fund_id: (await ids()).unrestricted,
      p_corrects_id: a,
      p_correction_reason: "Test: the receipt said more",
    });
    expect(error).toBeNull();
    await approve(await centreB(), fix as number);
    expect((await repay(await financeB(), [a])).error?.message).toMatch(/you entered a correction of EXP-\d+/i);
    expect((await repay(await superA(), [a])).error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("correcting an approved claim", () => {
  async function correct(c: SupabaseClient, claim: number, o: { amount?: number; fund?: string; date?: string; category?: string } = {}) {
    const l = await ids();
    const r = await row(claim);
    return c.rpc("enter_expense_claim", {
      p_amount_cents: o.amount ?? r.current_amount_cents,
      p_receipt_date: o.date ?? r.current_receipt_date,
      p_category_id: o.category ?? r.current_category_id,
      p_description: null,
      p_payment: r.payment,
      p_paid_by_person_id: r.paid_by_person_id,
      p_suggested_fund_id: o.fund ?? r.current_fund_id ?? l.unrestricted,
      p_corrects_id: claim,
      p_correction_reason: "Typed the wrong amount",
    });
  }

  it("only an approved claim can be corrected, and something must be different", async () => {
    const c = await centre();
    const waiting = await newClaim(c);
    expect((await correct(c, waiting, { amount: 1 })).error?.message).toMatch(/only an approved claim/i);
    const id = await newClaim(c);
    await approve(await centreB(), id);
    expect((await correct(c, id)).error?.message).toMatch(/nothing is different/i);
  });

  it("an approved correction changes the claim's current values; both entries stay", async () => {
    const c = await centre();
    const id = await newClaim(c, { amount: 4500 });
    await approve(await centreB(), id);
    const { data: fix, error } = await correct(c, id, { amount: 5400, category: (await ids()).repairs });
    expect(error).toBeNull();
    expect((await entry(fix as number)).description).toBe((await row(id)).description);
    expect((await row(id)).current_amount_cents).toBe(4500);
    expect((await correct(c, id, { amount: 6000 })).error?.message).toMatch(/already waiting/i);
    // The same approval rules: not whoever entered the correction.
    expect((await decide(c, fix as number, "approved", { fund_id: (await ids()).unrestricted })).error?.message).toMatch(/you entered/i);
    await approve(await centreB(), fix as number);
    const r = await row(id);
    expect(r.current_amount_cents).toBe(5400);
    expect(r.current_category_id).toBe((await ids()).repairs);
    expect(r.correction_id).toBe(fix);
    expect(r.amount_cents).toBe(4500);
    const f = await entry(fix as number);
    const again = await c.rpc("enter_expense_claim", {
      p_amount_cents: 1,
      p_receipt_date: f.receipt_date,
      p_category_id: f.category_id,
      p_description: null,
      p_payment: f.payment,
      p_paid_by_person_id: f.paid_by_person_id,
      p_suggested_fund_id: (await ids()).unrestricted,
      p_corrects_id: fix,
      p_correction_reason: "Correcting the correction",
    });
    expect(again.error?.message).toMatch(/not a correction/i);
  });

  it("the second-approval amount is checked against the corrected total", async () => {
    const c = await centre();
    const id = await newClaim(c, { amount: 49000 });
    await approve(await centreB(), id);
    const { data: fix } = await correct(c, id, { amount: 51000 });
    await approve(await centreB(), fix as number);
    expect((await entry(fix as number)).state).toBe("second");
    expect((await row(id)).current_amount_cents).toBe(49000);
    await decide(await superB(), fix as number, "second_approved");
    expect((await row(id)).current_amount_cents).toBe(51000);
  });

  it("a fund-only correction moves the claim to the new fund", async () => {
    const c = await centre();
    const id = await newClaim(c);
    await approve(await centreB(), id);
    const { data: fix, error } = await correct(c, id, { fund: (await ids()).zakat });
    expect(error).toBeNull();
    await approve(await centreB(), fix as number, (await ids()).zakat);
    expect((await row(id)).current_fund_id).toBe((await ids()).zakat);
  });

  it("a repaid claim corrected upwards shows what is still owed, and can be paid the difference", async () => {
    const c = await centre();
    const id = await newClaim(c, { amount: 1000, paidBy: await payer(2) });
    await approve(await centreB(), id);
    await (await financeA()).rpc("record_expense_repayment", { p_claim_ids: [id], p_paid_on: "2026-11-20", p_method: "cash" });
    const { data: fix } = await correct(c, id, { amount: 1500 });
    await approve(await centreB(), fix as number);
    expect((await row(id)).owed_cents).toBe(500);
    const { data: rep, error } = await (await financeA()).rpc("record_expense_repayment", { p_claim_ids: [id], p_paid_on: "2026-11-21", p_method: "cash" });
    expect(error).toBeNull();
    const link = await masterKeyClient().from("expense_repayment_claims").select("amount_cents").eq("repayment_id", rep).single();
    expect(link.data!.amount_cents).toBe(500);
    expect((await row(id)).owed_cents).toBe(0);
  });

  // Security review finding 4 (migration 0053): a repaid claim corrected to
  // less shows the money to get back, and the Board report counts it.
  it("a repaid claim corrected downwards shows money to get back, in the list and the Board report", async () => {
    const c = await centre();
    const id = await newClaim(c, { amount: 4000, paidBy: await payer(3) });
    await approve(await centreB(), id);
    await (await financeA()).rpc("record_expense_repayment", { p_claim_ids: [id], p_paid_on: "2026-11-20", p_method: "cash" });
    const { data: fix } = await correct(await superB(), id, { amount: 1000 });
    await approve(await centreB(), fix as number);
    expect((await row(id)).owed_cents).toBe(-3000);
    // Nothing more can be "paid back" on it.
    expect((await (await financeA()).rpc("record_expense_repayment", { p_claim_ids: [id], p_paid_on: "2026-11-21", p_method: "cash" })).error?.message).toMatch(/already been paid back/i);
    // The three roles see it among the claims with money to get back.
    for (const who of [superA, centre, financeA]) {
      const { data } = await (await who()).from("expense_claim_list").select("id").lt("owed_cents", 0);
      expect(data!.map((r) => r.id)).toContain(id);
    }
    const month = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" }).slice(0, 7);
    const { data: report, error } = await (await financeA()).rpc("board_report", { p_month: month });
    expect(error).toBeNull();
    const asAt = (report as { as_at: Record<string, number> }).as_at;
    expect(asAt.overpaid_cents).toBeGreaterThanOrEqual(3000);
    expect(asAt.overpaid_people).toBeGreaterThanOrEqual(1);
    const { data: all } = await masterKeyClient().from("expense_claim_list").select("owed_cents, paid_by_person_id").lt("owed_cents", 0);
    expect(asAt.overpaid_cents).toBe(all!.reduce((n, r) => n - r.owed_cents, 0));
    expect(asAt.overpaid_people).toBe(new Set(all!.map((r) => r.paid_by_person_id)).size);
  });

  // Owner's choice B with the review (migration 0053): whoever entered a
  // claim cannot approve or reject a correction of it.
  it("whoever entered a claim cannot decide on a correction of it", async () => {
    const id = await newClaim(await centre(), { amount: 2500 });
    await approve(await centreB(), id);
    const { data: fix, error } = await correct(await superB(), id, { amount: 2000 });
    expect(error).toBeNull();
    expect((await decide(await centre(), fix as number, "approved", { fund_id: (await ids()).unrestricted })).error?.message).toMatch(
      /you entered the claim this corrects/i,
    );
    expect((await decide(await centre(), fix as number, "rejected", { note: "Test: no" })).error?.message).toMatch(/you entered the claim this corrects/i);
    expect((await entry(fix as number)).state).toBe("waiting");
    await approve(await centreB(), fix as number);
    expect((await row(id)).current_amount_cents).toBe(2000);
  });
});
