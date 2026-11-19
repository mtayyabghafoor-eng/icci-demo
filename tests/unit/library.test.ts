// Slice P4.2: plain rules for the library's books and copies. The database
// enforces the same rules (migration 0035); these let the screens explain a
// mistake before anything is sent.
import { describe, expect, it } from "vitest";
import {
  formatIsbn,
  friendlyLibraryError,
  isbn13CheckDigit,
  LANGUAGE_LABEL,
  MAY_USE_LIBRARY,
  normaliseIsbn,
  parseBookForm,
  parseCopyNote,
} from "@/lib/library/rules";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

describe("who may use the library", () => {
  it("Super Admin, Centre Admin and the Library Operator; not Finance", () => {
    expect([...MAY_USE_LIBRARY].sort()).toEqual(["centre_admin", "library_operator", "super_admin"]);
  });
});

describe("ISBN, the number under the barcode on the back cover", () => {
  it("is optional: empty means no ISBN", () => {
    expect(normaliseIsbn("")).toEqual({ ok: true, isbn: null });
    expect(normaliseIsbn("   ")).toEqual({ ok: true, isbn: null });
  });

  it("accepts a 13-digit ISBN with spaces or dashes, kept as digits only", () => {
    expect(normaliseIsbn("978-0-306-40615-7")).toEqual({ ok: true, isbn: "9780306406157" });
    expect(normaliseIsbn(" 978 0 306 40615 7 ")).toEqual({ ok: true, isbn: "9780306406157" });
  });

  it("turns an older 10-digit ISBN into the same book's 13-digit one", () => {
    expect(normaliseIsbn("0-306-40615-2")).toEqual({ ok: true, isbn: "9780306406157" });
    // The last character of a 10-digit ISBN can be X (meaning 10).
    expect(normaliseIsbn("0-8044-2957-x")).toEqual({ ok: true, isbn: "9780804429573" });
  });

  it("refuses a mistyped number (the last digit is a check)", () => {
    const r = normaliseIsbn("978-0-306-40615-8");
    expect(r.ok).toBe(false);
    expect(normaliseIsbn("0-306-40615-3").ok).toBe(false);
  });

  it("refuses the wrong length or letters", () => {
    for (const bad of ["12345", "97803064061571", "978030640615A", "ISBN 9780306406157x"]) {
      expect(normaliseIsbn(bad).ok, bad).toBe(false);
    }
  });

  it("accepts the word ISBN in front, as printed on books", () => {
    expect(normaliseIsbn("ISBN 978-0-306-40615-7")).toEqual({ ok: true, isbn: "9780306406157" });
  });

  it("a 13-digit ISBN must start 978 or 979", () => {
    const digits = "123456789012";
    expect(normaliseIsbn(digits + isbn13CheckDigit(digits)).ok).toBe(false);
  });

  it("is shown in groups that are easy to read aloud", () => {
    expect(formatIsbn("9780306406157")).toBe("978-0306406157");
  });
});

describe("the Add a book form", () => {
  const good = { title: "  The   Garden of Test Stories ", author: "Test Author One", language: "en", isbn: "", publisher: "", year: "" };

  it("tidies spaces and keeps what was typed", () => {
    const r = parseBookForm(form(good));
    expect(r).toEqual({
      ok: true,
      values: { title: "The Garden of Test Stories", author: "Test Author One", language: "en", isbn: null, publisher: null, published_year: null },
    });
  });

  it("keeps an Arabic title and author exactly", () => {
    const r = parseBookForm(form({ ...good, title: "حديقة القصص التجريبية", author: "مؤلف تجريبي", language: "ar" }));
    expect(r.ok && r.values.title).toBe("حديقة القصص التجريبية");
    expect(r.ok && r.values.author).toBe("مؤلف تجريبي");
  });

  it("needs a title", () => {
    expect(parseBookForm(form({ ...good, title: "  " }))).toEqual({ ok: false, error: "Please type the book's title." });
  });

  it("the author is optional (some books have none)", () => {
    const r = parseBookForm(form({ ...good, author: "" }));
    expect(r.ok && r.values.author).toBeNull();
  });

  it("needs one of the three languages", () => {
    expect(parseBookForm(form({ ...good, language: "" })).ok).toBe(false);
    expect(parseBookForm(form({ ...good, language: "fr" })).ok).toBe(false);
    expect(Object.keys(LANGUAGE_LABEL)).toEqual(["en", "ar", "other"]);
  });

  it("checks the ISBN", () => {
    expect(parseBookForm(form({ ...good, isbn: "978-0-306-40615-8" }))).toEqual({
      ok: false,
      error: "That ISBN does not look right. Check the 13 digits under the barcode, or leave it empty.",
    });
    const r = parseBookForm(form({ ...good, isbn: "0-306-40615-2" }));
    expect(r.ok && r.values.isbn).toBe("9780306406157");
  });

  it("a year must be a plain year, not in the future", () => {
    expect(parseBookForm(form({ ...good, year: "1998" })).ok).toBe(true);
    for (const bad of ["98", "19980", "next year", String(new Date().getFullYear() + 2)]) {
      expect(parseBookForm(form({ ...good, year: bad })).ok, bad).toBe(false);
    }
  });

  it("refuses very long text", () => {
    expect(parseBookForm(form({ ...good, title: "x".repeat(301) })).ok).toBe(false);
    expect(parseBookForm(form({ ...good, author: "x".repeat(201) })).ok).toBe(false);
  });
});

describe("the copy note", () => {
  it("is optional and short", () => {
    expect(parseCopyNote("")).toEqual({ ok: true, values: null });
    expect(parseCopyNote("  donated,   spine torn ")).toEqual({ ok: true, values: "donated, spine torn" });
    expect(parseCopyNote("x".repeat(201)).ok).toBe(false);
  });
});

describe("database refusals in plain words", () => {
  it("a label already used", () => {
    expect(friendlyLibraryError("This label is already on an item.")).toMatch(/already on an item/);
    expect(friendlyLibraryError('duplicate key value violates unique constraint "library_copies_label_serial_key"')).toMatch(
      /already on another copy/,
    );
  });

  it("a book already in the library", () => {
    expect(friendlyLibraryError('duplicate key value violates unique constraint "library_books_unique_isbn"')).toMatch(
      /already in the library/,
    );
  });

  it("not allowed", () => {
    expect(friendlyLibraryError("new row violates row-level security policy for table \"library_books\"")).toBe(
      "Your account is not allowed to do this.",
    );
  });

  it("anything else is passed on when it is one of ours, otherwise a general message", () => {
    expect(friendlyLibraryError("This book is switched off. Switch it back on to add a copy.")).toBe(
      "This book is switched off. Switch it back on to add a copy.",
    );
    expect(friendlyLibraryError("some internal problem xyz")).toBe("That could not be saved. Please try again.");
  });
});
