// Phase 4, slice P4.2: books and copies (PLAN.md 5.4; docs/PHASE-4.md).
// Owner's choices, 19 Nov 2026 (all recommended):
//   * One record per copy, one ICCI label per copy (the same labels as
//     items, printed by an admin). A label is on an item OR a copy, never both.
//   * Super Admin, Centre Admin and the Library Operator use the library;
//     Finance sees nothing. Nothing is ever deleted.
//   * ISBN optional, checked, stored as 13 digits; one book record per ISBN.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";
import { newFixedAsset, newLabel } from "./items-helpers";

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

/** A random, correctly formed 13-digit ISBN (made-up; only the check digit is real). */
function randomIsbn(): string {
  const body = "979" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const sum = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return body + ((10 - (sum % 10)) % 10);
}

type Added = { book_id: string; copy_id: string };

async function addBook(client: SupabaseClient, extra: Record<string, unknown> = {}) {
  return client.rpc("add_book_and_copy", {
    p_label: await newLabel(),
    p_title: testName("book"),
    p_author: "Test Author (made up)",
    p_isbn: null,
    p_publisher: null,
    p_year: null,
    p_language: "en",
    p_copy_note: null,
    ...extra,
  });
}

async function newBook(role = "library_operator", extra: Record<string, unknown> = {}): Promise<Added> {
  const { data, error } = await addBook(await asRole(role), extra);
  if (error) throw error;
  return data as Added;
}

describe("adding a book and its first copy", () => {
  for (const u of USERS) {
    it(`${u.label} can add a book with its first copy`, async () => {
      const label = await newLabel();
      const c = await u.client();
      const { data, error } = await addBook(c, { p_label: label, p_copy_note: "Test: donated" });
      expect(error).toBeNull();
      const added = data as Added;
      const { data: copy } = await c.from("library_copies").select("book_id, label_serial, copy_note").eq("id", added.copy_id).single();
      expect(copy).toEqual({ book_id: added.book_id, label_serial: label, copy_note: "Test: donated" });
      const { data: book } = await c.from("library_books").select("created_by, active, entered_by").eq("id", added.book_id).single();
      expect(book).toEqual({ created_by: userIdOf(seedAdmin(u.label).email), active: true, entered_by: "typed" });
    });
  }

  for (const u of noAccess) {
    it(`${u.label} cannot add a book`, async () => {
      const { data, error } = await addBook(await u.client());
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it(`${u.label} cannot add a book straight into the table`, async () => {
      const { error } = await (await u.client()).from("library_books").insert({ title: testName("sneaky"), language: "en" });
      expect(error).not.toBeNull();
    });
  }

  it("keeps an Arabic title and author exactly as typed", async () => {
    const added = await newBook("library_operator", { p_title: `${testName("ar")} حديقة القصص`, p_author: "مؤلف تجريبي", p_language: "ar" });
    const { data } = await masterKeyClient().from("library_books").select("title, author, language").eq("id", added.book_id).single();
    expect(data!.title.endsWith(" حديقة القصص")).toBe(true);
    expect(data!.author).toBe("مؤلف تجريبي");
    expect(data!.language).toBe("ar");
  });

  it("tidies spaces in the title and author", async () => {
    const name = testName("spaces");
    const added = await newBook("centre_admin", { p_title: `  ${name}   again `, p_author: "  Test   Author  " });
    const { data } = await masterKeyClient().from("library_books").select("title, author").eq("id", added.book_id).single();
    expect(data).toEqual({ title: `${name} again`, author: "Test Author" });
  });

  it("needs a title and a known language", async () => {
    const c = await asRole("centre_admin");
    expect((await addBook(c, { p_title: "   " })).error).not.toBeNull();
    expect((await addBook(c, { p_language: "fr" })).error).not.toBeNull();
  });

  it("adds nothing at all when the copy cannot be added (no book left behind)", async () => {
    const title = testName("half");
    const used = (await newFixedAsset()).label_serial as string;
    const { error } = await addBook(await asRole("centre_admin"), { p_label: used, p_title: title });
    expect(error?.message).toMatch(/already on an item/);
    const { data } = await masterKeyClient().from("library_books").select("id").eq("title", title);
    expect(data).toEqual([]);
  });
});

describe("how the details were entered (slice P4.3)", () => {
  it("typed by hand unless said otherwise", async () => {
    const added = await newBook();
    const { data } = await masterKeyClient().from("library_books").select("entered_by").eq("id", added.book_id).single();
    expect(data!.entered_by).toBe("typed");
  });

  it("looked up from the ISBN", async () => {
    const added = await newBook("library_operator", { p_isbn: randomIsbn(), p_entered_by: "looked_up" });
    const { data } = await masterKeyClient().from("library_books").select("entered_by").eq("id", added.book_id).single();
    expect(data!.entered_by).toBe("looked_up");
  });

  it("only the two known ways", async () => {
    const { error } = await addBook(await asRole("library_operator"), { p_entered_by: "guessed" });
    expect(error).not.toBeNull();
  });

  it("signed-out visitors and Finance still cannot add a book this way", async () => {
    for (const c of [signedOutClient(), await asRole("finance")]) {
      const { error } = await addBook(c, { p_entered_by: "looked_up" });
      expect(error).not.toBeNull();
    }
  });
});

describe("ISBN", () => {
  it("is stored as 13 digits, with spaces and dashes removed", async () => {
    const isbn = randomIsbn();
    const typed = `${isbn.slice(0, 3)}-${isbn.slice(3, 8)} ${isbn.slice(8)}`;
    const added = await newBook("library_operator", { p_isbn: typed });
    const { data } = await masterKeyClient().from("library_books").select("isbn").eq("id", added.book_id).single();
    expect(data!.isbn).toBe(isbn);
  });

  it("an older 10-digit ISBN is turned into the 13-digit one", async () => {
    // A made-up 10-digit ISBN with a correct check character.
    const nine = String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
    const sum = [...nine].reduce((s, d, i) => s + Number(d) * (10 - i), 0);
    const check = (11 - (sum % 11)) % 11;
    const ten = nine + (check === 10 ? "X" : String(check));
    const added = await newBook("centre_admin", { p_isbn: ten });
    const { data } = await masterKeyClient().from("library_books").select("isbn").eq("id", added.book_id).single();
    const body = "978" + nine;
    const s13 = [...body].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    expect(data!.isbn).toBe(body + ((10 - (s13 % 10)) % 10));
  });

  it("a mistyped ISBN is refused", async () => {
    const isbn = randomIsbn();
    const wrong = isbn.slice(0, 12) + ((Number(isbn[12]) + 1) % 10);
    const { error } = await addBook(await asRole("centre_admin"), { p_isbn: wrong });
    expect(error?.message).toMatch(/ISBN/);
  });

  it("one book record per ISBN: the second is refused (add another copy instead)", async () => {
    const isbn = randomIsbn();
    await newBook("library_operator", { p_isbn: isbn });
    const { error } = await addBook(await asRole("library_operator"), { p_isbn: `${isbn.slice(0, 3)}-${isbn.slice(3)}` });
    expect(error?.message).toMatch(/library_books_unique_isbn|already in the library/);
  });

  it("is optional: many books without one", async () => {
    await newBook("library_operator");
    await newBook("library_operator");
  });
});

describe("copies and labels", () => {
  it("another copy of a book we have: one more row, its own label", async () => {
    const added = await newBook();
    const label = await newLabel();
    const c = await asRole("library_operator");
    const { error } = await c.from("library_copies").insert({ book_id: added.book_id, label_serial: label });
    expect(error).toBeNull();
    const { data } = await c.from("library_copies").select("id").eq("book_id", added.book_id);
    expect(data).toHaveLength(2);
  });

  it("a label on an item cannot go on a copy", async () => {
    const added = await newBook();
    const item = await newFixedAsset();
    const { error } = await (await asRole("centre_admin")).from("library_copies").insert({ book_id: added.book_id, label_serial: item.label_serial });
    expect(error?.message).toMatch(/already on an item/);
  });

  it("a label on a copy cannot go on an item", async () => {
    const added = await newBook("centre_admin");
    const { data: copy } = await masterKeyClient().from("library_copies").select("label_serial").eq("id", added.copy_id).single();
    const { error } = await (await asRole("centre_admin"))
      .from("items")
      .insert({ ...(await import("./items-helpers").then((m) => m.fixedAssetFields())), label_serial: copy!.label_serial });
    expect(error?.message).toMatch(/already on a library book/);
  });

  it("a label can be on one copy only", async () => {
    const added = await newBook();
    const { data: copy } = await masterKeyClient().from("library_copies").select("label_serial").eq("id", added.copy_id).single();
    const { error } = await (await asRole("library_operator")).from("library_copies").insert({ book_id: added.book_id, label_serial: copy!.label_serial });
    expect(error?.message).toMatch(/library_copies_label_serial_key|already on another copy/);
  });

  it("a label number that was never printed is refused", async () => {
    const added = await newBook();
    const { error } = await (await asRole("library_operator")).from("library_copies").insert({ book_id: added.book_id, label_serial: "ICCI-999998" });
    expect(error).not.toBeNull();
  });

  it("a copy cannot be moved to another book or another label; only its note can change", async () => {
    const a = await newBook();
    const b = await newBook();
    const c = await asRole("library_operator");
    expect((await c.from("library_copies").update({ book_id: b.book_id }).eq("id", a.copy_id)).error).not.toBeNull();
    expect((await c.from("library_copies").update({ label_serial: await newLabel() }).eq("id", a.copy_id)).error).not.toBeNull();
    const { data, error } = await c.from("library_copies").update({ copy_note: "Test: cover loose" }).eq("id", a.copy_id).select("copy_note");
    expect(error).toBeNull();
    expect(data).toEqual([{ copy_note: "Test: cover loose" }]);
  });

  it("a switched-off book gets no new copies", async () => {
    const added = await newBook("centre_admin");
    const c = await asRole("centre_admin");
    expect((await c.from("library_books").update({ active: false }).eq("id", added.book_id)).error).toBeNull();
    const { error } = await c.from("library_copies").insert({ book_id: added.book_id, label_serial: await newLabel() });
    expect(error?.message).toMatch(/switched off/);
  });
});

describe("what a label is used for (for the Scan button)", () => {
  for (const u of USERS) {
    it(`${u.label} can ask`, async () => {
      const c = await u.client();
      const free = await newLabel();
      const item = await newFixedAsset();
      const added = await newBook();
      const { data: copy } = await masterKeyClient().from("library_copies").select("label_serial").eq("id", added.copy_id).single();
      expect((await c.rpc("label_use", { p_serial: free })).data).toEqual({ use: "free", copy_id: null });
      expect((await c.rpc("label_use", { p_serial: item.label_serial })).data).toEqual({ use: "item", copy_id: null });
      expect((await c.rpc("label_use", { p_serial: copy!.label_serial })).data).toEqual({ use: "book_copy", copy_id: added.copy_id });
      expect((await c.rpc("label_use", { p_serial: "ICCI-999997" })).data).toEqual({ use: "unknown", copy_id: null });
    });
  }

  for (const u of noAccess) {
    it(`${u.label} cannot ask`, async () => {
      const { data, error } = await (await u.client()).rpc("label_use", { p_serial: "ICCI-000001" });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });
  }

  it("the Library Operator still cannot read items or the label list", async () => {
    const c = await asRole("library_operator");
    for (const table of ["items", "labels"]) {
      const { data } = await c.from(table).select("*").limit(3);
      expect(data ?? [], table).toHaveLength(0);
    }
  });
});

describe("reading and correcting", () => {
  for (const u of USERS) {
    it(`${u.label} can read books and copies, and correct a book's details`, async () => {
      const added = await newBook();
      const c = await u.client();
      const { data: books } = await c.from("library_books").select("id").eq("id", added.book_id);
      expect(books).toHaveLength(1);
      const { data: list } = await c.from("library_book_list").select("id, copies").eq("id", added.book_id);
      expect(list).toEqual([{ id: added.book_id, copies: 1 }]);
      const { data, error } = await c.from("library_books").update({ author: "Test Corrected Author" }).eq("id", added.book_id).select("author");
      expect(error).toBeNull();
      expect(data).toEqual([{ author: "Test Corrected Author" }]);
    });
  }

  for (const u of noAccess) {
    it(`${u.label} reads nothing and changes nothing`, async () => {
      const added = await newBook();
      const c = await u.client();
      for (const table of ["library_books", "library_copies", "library_book_list"]) {
        const { data } = await c.from(table).select("*").limit(3);
        expect(data ?? [], table).toHaveLength(0);
      }
      const { data } = await c.from("library_books").update({ title: "Test Hacked" }).eq("id", added.book_id).select();
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("a correction is in the audit log, with the old and new values", async () => {
    const added = await newBook();
    await (await asRole("library_operator")).from("library_books").update({ publisher: "Test Press (made up)" }).eq("id", added.book_id);
    const { data } = await (await asRole("super_admin"))
      .from("audit_log")
      .select("action, old_values, new_values")
      .eq("table_name", "library_books")
      .eq("record_id", added.book_id)
      .order("id");
    expect(data!.map((r) => r.action)).toEqual(["insert", "update"]);
    expect(data![1].old_values.publisher).toBeNull();
    expect(data![1].new_values.publisher).toBe("Test Press (made up)");
  });

  it("an invalid ISBN cannot be put in by a correction either", async () => {
    const added = await newBook();
    const { error } = await (await asRole("centre_admin")).from("library_books").update({ isbn: "9790000000002" }).eq("id", added.book_id);
    expect(error?.message).toMatch(/ISBN/);
  });
});

describe("nothing in the library is ever deleted", () => {
  it("not by the people who use it", async () => {
    const added = await newBook();
    const c = await asRole("super_admin");
    await c.from("library_copies").delete().eq("id", added.copy_id);
    await c.from("library_books").delete().eq("id", added.book_id);
    const db = masterKeyClient();
    expect((await db.from("library_copies").select("id").eq("id", added.copy_id)).data).toHaveLength(1);
    expect((await db.from("library_books").select("id").eq("id", added.book_id)).data).toHaveLength(1);
  });

  it("not even with the master key", async () => {
    const added = await newBook();
    const db = masterKeyClient();
    expect((await db.from("library_copies").delete().eq("id", added.copy_id)).error).not.toBeNull();
    expect((await db.from("library_books").delete().eq("id", added.book_id)).error).not.toBeNull();
  });
});
