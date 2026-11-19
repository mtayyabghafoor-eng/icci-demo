// Slice P4.5: lost and withdrawn library copies, the lists and the Home
// counters (PLAN.md 5.4; docs/PHASE-4.md). Owner's choices, 19 Nov 2026:
// the Library Operator may mark a copy lost on their own; nothing is deleted;
// a lost book ends its loan; a withdrawn copy can never come back.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName } from "./clients";
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

const op = () => asRole("library_operator");

async function newCopy(): Promise<string> {
  const { data, error } = await (await op()).rpc("add_book_and_copy", {
    p_label: await newLabel(),
    p_title: testName("lists book"),
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

async function newBorrower(): Promise<string> {
  const { data, error } = await (await op())
    .from("library_borrowers")
    .insert({ full_name: testName("lists borrower"), contact_kind: "phone", contact: "+353 00 000 9998" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function lend(c: SupabaseClient, copy: string, borrower: string) {
  return c.rpc("lend_copy", { p_copy_id: copy, p_borrower_id: borrower, p_due_on: null });
}

async function statusOf(copy: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("library_copy_list").select("status").eq("id", copy).single();
  if (error) throw error;
  return data.status as string;
}

describe("lost, withdrawn and found: who can do it", () => {
  for (const u of USERS) {
    it(`${u.label} can mark a copy lost, then found`, async () => {
      const copy = await newCopy();
      const c = await u.client();
      expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" })).error).toBeNull();
      expect(await statusOf(copy)).toBe("lost");
      expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "found" })).error).toBeNull();
      expect(await statusOf(copy)).toBe("available");
    });

    it(`${u.label} can withdraw a copy`, async () => {
      const copy = await newCopy();
      expect(((await (await u.client()).rpc("mark_copy", { p_copy_id: copy, p_kind: "withdrawn" })).error)).toBeNull();
      expect(await statusOf(copy)).toBe("withdrawn");
    });
  }

  for (const r of noAccess) {
    it(`${r.label} cannot mark a copy, read the entries, the lists or the counters`, async () => {
      const copy = await newCopy();
      const c = await r.client();
      expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" })).error).not.toBeNull();
      expect(await statusOf(copy)).toBe("available");
      expect((await c.from("library_copy_entries").insert({ copy_id: copy, kind: "lost" })).error).not.toBeNull();
      const entries = await c.from("library_copy_entries").select("id");
      expect(entries.data ?? []).toHaveLength(0);
      const list = await c.from("library_copy_list").select("id");
      expect(list.data ?? []).toHaveLength(0);
      expect((await c.rpc("library_counters")).error).not.toBeNull();
      expect((await c.rpc("library_most_borrowed", { p_since: "2020-01-01" })).error).not.toBeNull();
    });
  }
});

describe("lost, withdrawn and found: the rules", () => {
  it("a lost copy cannot be lent until it is found", async () => {
    const copy = await newCopy();
    const borrower = await newBorrower();
    const c = await op();
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    const refused = await lend(c, copy, borrower);
    expect(refused.error?.message).toMatch(/marked lost/);
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "found" });
    expect((await lend(c, copy, borrower)).error).toBeNull();
  });

  it("a withdrawn copy cannot be lent, found or withdrawn again", async () => {
    const copy = await newCopy();
    const borrower = await newBorrower();
    const c = await op();
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "withdrawn" });
    expect((await lend(c, copy, borrower)).error?.message).toMatch(/withdrawn/);
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "found" })).error).not.toBeNull();
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "withdrawn" })).error?.message).toMatch(/already been withdrawn/);
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" })).error).not.toBeNull();
    expect(await statusOf(copy)).toBe("withdrawn");
  });

  it("a copy that is lost twice, or found when not lost, is refused", async () => {
    const copy = await newCopy();
    const c = await op();
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "found" })).error?.message).toMatch(/Only a copy marked lost/);
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" })).error?.message).toMatch(/already marked lost/);
  });

  it("a lost copy can be withdrawn (written off)", async () => {
    const copy = await newCopy();
    const c = await op();
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "withdrawn" })).error).toBeNull();
    expect(await statusOf(copy)).toBe("withdrawn");
  });

  it("marking a lent copy lost ends its loan, so the borrower has one fewer out", async () => {
    const copy = await newCopy();
    const borrower = await newBorrower();
    const c = await op();
    const { data: loan } = await lend(c, copy, borrower);
    expect(await statusOf(copy)).toBe("on_loan");
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" })).error).toBeNull();
    expect(await statusOf(copy)).toBe("lost");
    const { data: row } = await masterKeyClient().from("library_loan_status").select("is_open, lost_on").eq("id", loan as number).single();
    expect(row!.is_open).toBe(false);
    expect(row!.lost_on).not.toBeNull();
    // It cannot be "returned" any more, nor have its return cancelled.
    expect((await c.rpc("return_copy", { p_copy_id: copy })).error).not.toBeNull();
    expect((await c.rpc("undo_return", { p_loan_id: loan as number })).error).not.toBeNull();
    // Found: on the shelf again, the old loan stays closed.
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "found" });
    expect(await statusOf(copy)).toBe("available");
    const { data: after } = await masterKeyClient().from("library_loan_status").select("is_open").eq("id", loan as number).single();
    expect(after!.is_open).toBe(false);
  });

  it("a lent copy cannot be withdrawn: return it, or mark it lost", async () => {
    const copy = await newCopy();
    const c = await op();
    await lend(c, copy, await newBorrower());
    expect((await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "withdrawn" })).error?.message).toMatch(/on loan/);
    expect(await statusOf(copy)).toBe("on_loan");
  });

  it("a return cannot be cancelled once the copy is lost", async () => {
    const copy = await newCopy();
    const c = await op();
    const { data: loan } = await lend(c, copy, await newBorrower());
    await c.rpc("return_copy", { p_copy_id: copy });
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    expect((await c.rpc("undo_return", { p_loan_id: loan as number })).error?.message).toMatch(/lost or withdrawn/);
  });

  it("a wrong kind is refused", async () => {
    const copy = await newCopy();
    expect((await (await op()).rpc("mark_copy", { p_copy_id: copy, p_kind: "stolen" })).error).not.toBeNull();
  });
});

describe("lost, withdrawn and found: history is never changed or deleted", () => {
  it("entries cannot be changed or deleted, even with the master key", async () => {
    const copy = await newCopy();
    await (await op()).rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    const db = masterKeyClient();
    const { data } = await db.from("library_copy_entries").select("id").eq("copy_id", copy).single();
    expect((await db.from("library_copy_entries").update({ kind: "found" }).eq("id", data!.id)).error).not.toBeNull();
    expect((await db.from("library_copy_entries").delete().eq("id", data!.id)).error).not.toBeNull();
    const viaAdmin = await (await asRole("super_admin")).from("library_copy_entries").update({ kind: "found" }).eq("id", data!.id).select();
    expect(viaAdmin.data ?? []).toHaveLength(0);
  });

  it("every entry is in the audit log", async () => {
    const copy = await newCopy();
    await (await op()).rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    const { data: entry } = await masterKeyClient().from("library_copy_entries").select("id").eq("copy_id", copy).single();
    const { data } = await (await asRole("super_admin"))
      .from("audit_log")
      .select("action, new_values")
      .eq("table_name", "library_copy_entries")
      .eq("record_id", String(entry!.id));
    expect(data).toHaveLength(1);
    expect(data![0].new_values.kind).toBe("lost");
  });
});

describe("the lists and the Home counters", () => {
  for (const u of USERS) {
    it(`${u.label} can read the copy list and the counters`, async () => {
      const copy = await newCopy();
      const c = await u.client();
      const { data, error } = await c.from("library_copy_list").select("id, status, title").eq("id", copy).single();
      expect(error).toBeNull();
      expect(data!.status).toBe("available");
      const counters = await c.rpc("library_counters").single();
      expect(counters.error).toBeNull();
    });
  }

  it("the copy list shows each status with the right details", async () => {
    const c = await op();
    const lost = await newCopy();
    const late = await newCopy();
    const soon = await newCopy();
    const borrower = await newBorrower();
    const b2 = await newBorrower();
    const b3 = await newBorrower();
    await c.rpc("mark_copy", { p_copy_id: lost, p_kind: "lost" });
    // Made with the master key, the only way to lend in the past.
    const db = masterKeyClient();
    const day = (n: number) => {
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + n);
      return d.toISOString().slice(0, 10);
    };
    expect((await db.from("library_loans").insert({ copy_id: late, borrower_id: b2, lent_on: day(-30), first_due_on: day(-9) })).error).toBeNull();
    expect((await db.from("library_loans").insert({ copy_id: soon, borrower_id: b3, lent_on: day(-19), first_due_on: day(2) })).error).toBeNull();
    void borrower;
    expect(await statusOf(lost)).toBe("lost");
    expect(await statusOf(soon)).toBe("on_loan");
    const { data } = await db.from("library_copy_list").select("status, days_overdue").eq("id", late).single();
    expect(data!.status).toBe("overdue");
    expect(data!.days_overdue).toBeGreaterThanOrEqual(8);
  });

  it("the counters move when books go out, late, lost and back", async () => {
    const c = await op();
    const before = (await c.rpc("library_counters").single()).data as Record<string, number>;
    const copy = await newCopy();
    const { data: loan } = await lend(c, copy, await newBorrower());
    const during = (await c.rpc("library_counters").single()).data as Record<string, number>;
    expect(during.books_on_loan).toBe(before.books_on_loan + 1);
    await c.rpc("mark_copy", { p_copy_id: copy, p_kind: "lost" });
    const after = (await c.rpc("library_counters").single()).data as Record<string, number>;
    expect(after.books_on_loan).toBe(before.books_on_loan);
    expect(after.copies_lost).toBe(before.copies_lost + 1);
    void loan;
  });

  it("most borrowed counts the loans of each book in the period", async () => {
    const c = await op();
    const copy = await newCopy();
    // Three different borrowers, one after another, so the 3-book limit never bites.
    for (let i = 0; i < 3; i++) {
      expect((await lend(c, copy, await newBorrower())).error).toBeNull();
      expect((await c.rpc("return_copy", { p_copy_id: copy })).error).toBeNull();
    }
    const { data: row } = await masterKeyClient().from("library_copies").select("book_id").eq("id", copy).single();
    const { data, error } = await c.rpc("library_most_borrowed", { p_since: "2020-01-01" });
    expect(error).toBeNull();
    const mine = (data as { book_id: string; loans: number }[]).find((b) => b.book_id === row!.book_id);
    expect(Number(mine?.loans)).toBe(3);
    // A period in the far past finds none of them.
    const none = await c.rpc("library_most_borrowed", { p_since: "2001-01-01", p_until: "2001-12-31" });
    expect(none.data ?? []).toHaveLength(0);
  });
});
