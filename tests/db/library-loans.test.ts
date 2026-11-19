// Phase 4, slice P4.4: borrowers, lend and return (PLAN.md 5.4; docs/PHASE-4.md).
// Owner's choices, 19 Nov 2026 (all recommended):
//   * A borrower is a name and ONE contact detail (phone or email), kept
//     apart from the People directory. Adults only.
//   * 21 days by default, at most 3 books out per borrower, no fines.
//   * A loan is never changed or deleted. Returning it, moving its due date
//     and "returned by mistake" are new entries linked to the loan.
//   * A copy can never be on loan twice, even with two phones at once.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";
import { newLabel } from "./items-helpers";

const USERS = [
  { label: "super_admin", client: () => asRole("super_admin") },
  { label: "centre_admin", client: () => asRole("centre_admin") },
  { label: "library_operator", client: () => asRole("library_operator") },
];

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "a switched-off admin", client: () => asRole("centre_admin", false) },
  { label: "a switched-off Library Operator", client: () => asRole("library_operator", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

/** Today in Dublin, and a day counted from it, as YYYY-MM-DD. */
function dublinDay(offset = 0): string {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

async function op() {
  return asRole("library_operator");
}

/** A new made-up book with one copy; returns the copy's id. */
async function newCopy(): Promise<string> {
  const { data, error } = await (await op()).rpc("add_book_and_copy", {
    p_label: await newLabel(),
    p_title: testName("loan book"),
    p_author: null,
    p_isbn: null,
    p_publisher: null,
    p_year: null,
    p_language: "en",
    p_copy_note: null,
  });
  if (error) throw error;
  return (data as { copy_id: string }).copy_id;
}

function borrowerFields(extra: Record<string, unknown> = {}) {
  return { full_name: testName("borrower"), contact_kind: "phone", contact: "+353 00 000 9999", ...extra };
}

async function newBorrower(extra: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await (await op()).from("library_borrowers").insert(borrowerFields(extra)).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function lend(c: SupabaseClient, copy: string, borrower: string, due: string | null = null) {
  return c.rpc("lend_copy", { p_copy_id: copy, p_borrower_id: borrower, p_due_on: due });
}

async function newLoan(due: string | null = null): Promise<{ copy: string; borrower: string; loan: number }> {
  const copy = await newCopy();
  const borrower = await newBorrower();
  const { data, error } = await lend(await op(), copy, borrower, due);
  if (error) throw error;
  return { copy, borrower, loan: data as number };
}

async function loanRow(loan: number) {
  const { data, error } = await masterKeyClient().from("library_loan_status").select("*").eq("id", loan).single();
  if (error) throw error;
  return data as { is_open: boolean; due_on: string; first_due_on: string; lent_on: string; returned_on: string | null; days_overdue: number };
}

// ---------------------------------------------------------------------------
describe("borrowers", () => {
  for (const u of USERS) {
    it(`${u.label} can add, read and correct a borrower`, async () => {
      const c = await u.client();
      const { data, error } = await c.from("library_borrowers").insert(borrowerFields()).select("id, active, created_by").single();
      expect(error).toBeNull();
      expect(data!.active).toBe(true);
      expect(data!.created_by).toBe(userIdOf(seedAdmin(u.label).email));
      const fixed = await c
        .from("library_borrowers")
        .update({ contact_kind: "email", contact: "Test.Borrower@icci-prototype.test" })
        .eq("id", data!.id)
        .select("contact_kind, contact");
      expect(fixed.error).toBeNull();
      expect(fixed.data).toEqual([{ contact_kind: "email", contact: "test.borrower@icci-prototype.test" }]);
    });
  }

  for (const u of noAccess) {
    it(`${u.label} cannot add, read or change a borrower`, async () => {
      const id = await newBorrower();
      const c = await u.client();
      expect((await c.from("library_borrowers").insert(borrowerFields())).error).not.toBeNull();
      for (const table of ["library_borrowers", "library_loans", "library_loan_entries", "library_loan_status"]) {
        const { data } = await c.from(table).select("*").limit(3);
        expect(data ?? [], table).toHaveLength(0);
      }
      const { data } = await c.from("library_borrowers").update({ full_name: "Test Hacked" }).eq("id", id).select();
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("needs a name and exactly one contact detail of a known kind", async () => {
    const c = await op();
    expect((await c.from("library_borrowers").insert(borrowerFields({ full_name: "   " }))).error).not.toBeNull();
    expect((await c.from("library_borrowers").insert(borrowerFields({ contact: "" }))).error).not.toBeNull();
    expect((await c.from("library_borrowers").insert(borrowerFields({ contact_kind: "address" }))).error).not.toBeNull();
  });

  it("checks the phone number and the email address", async () => {
    const c = await op();
    expect((await c.from("library_borrowers").insert(borrowerFields({ contact: "call me" }))).error?.message).toMatch(/phone/i);
    expect((await c.from("library_borrowers").insert(borrowerFields({ contact: "12" }))).error?.message).toMatch(/phone/i);
    expect((await c.from("library_borrowers").insert(borrowerFields({ contact_kind: "email", contact: "not-an-email" }))).error?.message).toMatch(/email/i);
    expect((await c.from("library_borrowers").insert(borrowerFields({ contact: "(00) 000-1234" }))).error).toBeNull();
  });

  it("has no other personal details (no address, no notes box)", async () => {
    const { error } = await (await op()).from("library_borrowers").insert(borrowerFields({ address: "Test street" }));
    expect(error).not.toBeNull();
  });

  it("a correction is in the audit log", async () => {
    const id = await newBorrower();
    await (await op()).from("library_borrowers").update({ full_name: "Test Corrected Borrower" }).eq("id", id);
    const { data } = await (await asRole("super_admin"))
      .from("audit_log")
      .select("action, old_values, new_values")
      .eq("table_name", "library_borrowers")
      .eq("record_id", id)
      .order("id");
    expect(data!.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(data![1].new_values.full_name).toBe("Test Corrected Borrower");
  });

  it("can be switched off only with nothing on loan, and back on", async () => {
    const { borrower, copy } = await newLoan();
    const c = await op();
    expect((await c.from("library_borrowers").update({ active: false }).eq("id", borrower)).error?.message).toMatch(/on loan/);
    expect((await c.rpc("return_copy", { p_copy_id: copy })).error).toBeNull();
    expect((await c.from("library_borrowers").update({ active: false }).eq("id", borrower)).error).toBeNull();
    expect((await c.from("library_borrowers").update({ active: true }).eq("id", borrower)).error).toBeNull();
  });

  it("the Library Operator still cannot see the People directory", async () => {
    const { data } = await (await op()).from("people").select("id").limit(3);
    expect(data ?? []).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe("lending", () => {
  for (const u of USERS) {
    it(`${u.label} can lend a copy; it is due in 21 days unless another date is given`, async () => {
      const copy = await newCopy();
      const borrower = await newBorrower();
      const { data, error } = await lend(await u.client(), copy, borrower);
      expect(error).toBeNull();
      const row = await loanRow(data as number);
      expect(row).toMatchObject({ is_open: true, lent_on: dublinDay(), first_due_on: dublinDay(21), due_on: dublinDay(21), returned_on: null, days_overdue: 0 });
      const { data: loan } = await masterKeyClient().from("library_loans").select("created_by").eq("id", data).single();
      expect(loan!.created_by).toBe(userIdOf(seedAdmin(u.label).email));
    });
  }

  for (const u of noAccess) {
    it(`${u.label} cannot lend, return or move a due date`, async () => {
      const copy = await newCopy();
      const borrower = await newBorrower();
      const c = await u.client();
      expect((await lend(c, copy, borrower)).error).not.toBeNull();
      expect((await c.from("library_loans").insert({ copy_id: copy, borrower_id: borrower, first_due_on: dublinDay(5) })).error).not.toBeNull();
      const { loan, copy: lentCopy } = await newLoan();
      expect((await c.rpc("return_copy", { p_copy_id: lentCopy })).error).not.toBeNull();
      expect((await c.rpc("move_due_date", { p_loan_id: loan, p_due_on: dublinDay(30) })).error).not.toBeNull();
      expect((await loanRow(loan)).is_open).toBe(true);
    });
  }

  it("a chosen due date is kept; it cannot be in the past or more than a year away", async () => {
    const c = await op();
    const ok = await lend(c, await newCopy(), await newBorrower(), dublinDay(7));
    expect(ok.error).toBeNull();
    expect((await loanRow(ok.data as number)).due_on).toBe(dublinDay(7));
    expect((await lend(c, await newCopy(), await newBorrower(), dublinDay(-1))).error?.message).toMatch(/past/);
    expect((await lend(c, await newCopy(), await newBorrower(), dublinDay(400))).error?.message).toMatch(/year/);
  });

  it("a copy already on loan cannot be lent again", async () => {
    const { copy } = await newLoan();
    const { error } = await lend(await op(), copy, await newBorrower());
    expect(error?.message).toMatch(/already on loan/);
  });

  it("two phones lending the same copy at the same moment: only one succeeds", async () => {
    const copy = await newCopy();
    const [a, b] = await Promise.all([newBorrower(), newBorrower()]);
    const [c1, c2] = await Promise.all([asRole("library_operator"), asRole("centre_admin")]);
    const results = await Promise.all([lend(c1, copy, a), lend(c2, copy, b)]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    const { data } = await masterKeyClient().from("library_loan_status").select("id").eq("copy_id", copy).eq("is_open", true);
    expect(data).toHaveLength(1);
  });

  it("at most 3 books out per borrower", async () => {
    const borrower = await newBorrower();
    const c = await op();
    for (let i = 0; i < 3; i++) expect((await lend(c, await newCopy(), borrower)).error).toBeNull();
    expect((await lend(c, await newCopy(), borrower)).error?.message).toMatch(/3 books/);
  });

  it("the limit holds with several phones at once too", async () => {
    const borrower = await newBorrower();
    const copies = await Promise.all([newCopy(), newCopy(), newCopy(), newCopy(), newCopy()]);
    const clients = await Promise.all(copies.map((_, i) => asRole(i % 2 ? "centre_admin" : "library_operator")));
    const results = await Promise.all(copies.map((copy, i) => lend(clients[i], copy, borrower)));
    expect(results.filter((r) => r.error === null)).toHaveLength(3);
  });

  it("a switched-off borrower cannot borrow", async () => {
    const borrower = await newBorrower();
    await (await op()).from("library_borrowers").update({ active: false }).eq("id", borrower);
    expect((await lend(await op(), await newCopy(), borrower)).error?.message).toMatch(/switched off/);
  });

  it("a copy of a switched-off book cannot be lent", async () => {
    const copy = await newCopy();
    const { data } = await masterKeyClient().from("library_copies").select("book_id").eq("id", copy).single();
    await (await asRole("centre_admin")).from("library_books").update({ active: false }).eq("id", data!.book_id);
    expect((await lend(await op(), copy, await newBorrower())).error?.message).toMatch(/switched off/);
  });

  it("lending to a new borrower saves both, or neither", async () => {
    const c = await op();
    const name = testName("new borrower");
    const { data, error } = await c.rpc("lend_copy_to_new_borrower", {
      p_copy_id: await newCopy(),
      p_full_name: name,
      p_contact_kind: "email",
      p_contact: "new.borrower@icci-prototype.test",
      p_due_on: null,
    });
    expect(error).toBeNull();
    const made = data as { loan_id: number; borrower_id: string };
    expect((await loanRow(made.loan_id)).is_open).toBe(true);

    const { copy } = await newLoan();
    const refusedName = testName("refused borrower");
    const refused = await c.rpc("lend_copy_to_new_borrower", {
      p_copy_id: copy,
      p_full_name: refusedName,
      p_contact_kind: "phone",
      p_contact: "+353 00 000 9998",
      p_due_on: null,
    });
    expect(refused.error?.message).toMatch(/already on loan/);
    const { data: left } = await masterKeyClient().from("library_borrowers").select("id").eq("full_name", refusedName);
    expect(left).toEqual([]);
  });

  it("a person cannot type their own lend date: it is always today", async () => {
    const { data, error } = await (await op())
      .from("library_loans")
      .insert({ copy_id: await newCopy(), borrower_id: await newBorrower(), lent_on: dublinDay(-30), first_due_on: dublinDay(5) })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await loanRow(data!.id)).lent_on).toBe(dublinDay());
  });
});

// ---------------------------------------------------------------------------
describe("returning", () => {
  for (const u of USERS) {
    it(`${u.label} can return a copy with one step, and lend it again`, async () => {
      const { copy, loan } = await newLoan();
      const c = await u.client();
      const { data, error } = await c.rpc("return_copy", { p_copy_id: copy });
      expect(error).toBeNull();
      expect(data).toEqual({ loan_id: loan, days_late: 0 });
      const row = await loanRow(loan);
      expect(row.is_open).toBe(false);
      expect(row.returned_on).toBe(dublinDay());
      expect((await lend(c, copy, await newBorrower())).error).toBeNull();
    });
  }

  it("a copy that is not on loan cannot be returned", async () => {
    const { error } = await (await op()).rpc("return_copy", { p_copy_id: await newCopy() });
    expect(error?.message).toMatch(/not on loan/);
  });

  it("an overdue return says how many days late (for information only)", async () => {
    // Made with the master key: only the seed and tests can put a loan in the past.
    const db = masterKeyClient();
    const copy = await newCopy();
    const borrower = await newBorrower();
    const { data: loan, error } = await db
      .from("library_loans")
      .insert({ copy_id: copy, borrower_id: borrower, lent_on: dublinDay(-25), first_due_on: dublinDay(-4) })
      .select("id")
      .single();
    expect(error).toBeNull();
    expect((await loanRow(loan!.id)).days_overdue).toBe(4);
    const { data } = await (await op()).rpc("return_copy", { p_copy_id: copy });
    expect(data).toEqual({ loan_id: loan!.id, days_late: 4 });
  });

  it("two phones returning at once: one return entry only", async () => {
    const { copy, loan } = await newLoan();
    const [c1, c2] = await Promise.all([asRole("library_operator"), asRole("centre_admin")]);
    const results = await Promise.all([c1.rpc("return_copy", { p_copy_id: copy }), c2.rpc("return_copy", { p_copy_id: copy })]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    const { data } = await masterKeyClient().from("library_loan_entries").select("id").eq("loan_id", loan).eq("kind", "returned");
    expect(data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("moving the due date", () => {
  it("is a new entry; the first due date stays in the loan", async () => {
    const { loan } = await newLoan();
    const c = await op();
    expect((await c.rpc("move_due_date", { p_loan_id: loan, p_due_on: dublinDay(30) })).error).toBeNull();
    expect((await c.rpc("move_due_date", { p_loan_id: loan, p_due_on: dublinDay(35) })).error).toBeNull();
    const row = await loanRow(loan);
    expect(row.first_due_on).toBe(dublinDay(21));
    expect(row.due_on).toBe(dublinDay(35));
  });

  it("not into the past, not more than a year away, not on a returned loan", async () => {
    const { loan, copy } = await newLoan();
    const c = await op();
    expect((await c.rpc("move_due_date", { p_loan_id: loan, p_due_on: dublinDay(-1) })).error?.message).toMatch(/past/);
    expect((await c.rpc("move_due_date", { p_loan_id: loan, p_due_on: dublinDay(400) })).error?.message).toMatch(/year/);
    await c.rpc("return_copy", { p_copy_id: copy });
    expect((await c.rpc("move_due_date", { p_loan_id: loan, p_due_on: dublinDay(10) })).error?.message).toMatch(/returned/);
  });
});

// ---------------------------------------------------------------------------
describe("returned by mistake", () => {
  it("puts the loan back on, linked to the wrong return; the return stays in the history", async () => {
    const { loan, copy } = await newLoan();
    const c = await op();
    await c.rpc("return_copy", { p_copy_id: copy });
    expect((await c.rpc("undo_return", { p_loan_id: loan })).error).toBeNull();
    expect((await loanRow(loan)).is_open).toBe(true);
    const { data } = await masterKeyClient().from("library_loan_entries").select("id, kind, undoes_entry_id").eq("loan_id", loan).order("id");
    expect(data!.map((e) => e.kind)).toEqual(["returned", "return_undone"]);
    expect(data![1].undoes_entry_id).toBe(data![0].id);
    // And it can be returned properly afterwards.
    expect((await c.rpc("return_copy", { p_copy_id: copy })).error).toBeNull();
  });

  it("only a returned loan, and not once the copy is lent to someone else", async () => {
    const { loan, copy } = await newLoan();
    const c = await op();
    expect((await c.rpc("undo_return", { p_loan_id: loan })).error?.message).toMatch(/not been returned/);
    await c.rpc("return_copy", { p_copy_id: copy });
    expect((await lend(c, copy, await newBorrower())).error).toBeNull();
    expect((await c.rpc("undo_return", { p_loan_id: loan })).error?.message).toMatch(/lent again/);
  });

  it("an entry cannot point at another loan's return", async () => {
    const one = await newLoan();
    const two = await newLoan();
    const c = await op();
    await c.rpc("return_copy", { p_copy_id: one.copy });
    const { data: ret } = await masterKeyClient().from("library_loan_entries").select("id").eq("loan_id", one.loan).single();
    const { error } = await c.from("library_loan_entries").insert({ loan_id: two.loan, kind: "return_undone", undoes_entry_id: ret!.id });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("history is never changed or deleted", () => {
  it("a loan and its entries cannot be changed, even with the master key", async () => {
    const { loan, copy } = await newLoan();
    await (await op()).rpc("return_copy", { p_copy_id: copy });
    const db = masterKeyClient();
    expect((await db.from("library_loans").update({ first_due_on: dublinDay(60) }).eq("id", loan)).error).not.toBeNull();
    expect((await db.from("library_loan_entries").update({ kind: "due_moved" }).eq("loan_id", loan)).error).not.toBeNull();
    const { data } = await (await asRole("super_admin")).from("library_loans").update({ first_due_on: dublinDay(60) }).eq("id", loan).select();
    expect(data ?? []).toHaveLength(0);
  });

  it("nothing can be deleted, even with the master key", async () => {
    const { loan, borrower } = await newLoan();
    const db = masterKeyClient();
    expect((await db.from("library_loans").delete().eq("id", loan)).error).not.toBeNull();
    expect((await db.from("library_borrowers").delete().eq("id", borrower)).error).not.toBeNull();
    await (await asRole("super_admin")).from("library_borrowers").delete().eq("id", borrower);
    expect((await db.from("library_borrowers").select("id").eq("id", borrower)).data).toHaveLength(1);
  });

  it("every loan and entry is in the audit log", async () => {
    const { loan, copy } = await newLoan();
    await (await op()).rpc("return_copy", { p_copy_id: copy });
    const admin = await asRole("super_admin");
    const { data: l } = await admin.from("audit_log").select("action").eq("table_name", "library_loans").eq("record_id", String(loan));
    expect(l).toEqual([{ action: "insert" }]);
    const { data: entry } = await masterKeyClient().from("library_loan_entries").select("id").eq("loan_id", loan).single();
    const { data: e } = await admin.from("audit_log").select("action, new_values").eq("table_name", "library_loan_entries").eq("record_id", String(entry!.id));
    expect(e).toHaveLength(1);
    expect(e![0].new_values.kind).toBe("returned");
  });
});
