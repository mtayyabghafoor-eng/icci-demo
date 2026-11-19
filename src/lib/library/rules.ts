// Plain rules for the library (Phase 4, docs/PHASE-4.md): who may use it,
// the ISBN check, the Add a book form and refusals in plain words. The
// database enforces the same rules (migration 0035); these let a screen
// explain a mistake before anything is sent.

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export const MAY_USE_LIBRARY = ["super_admin", "centre_admin", "library_operator"] as const;

export function mayUseLibrary(roleCode: string): boolean {
  return (MAY_USE_LIBRARY as readonly string[]).includes(roleCode);
}

export type Language = "en" | "ar" | "other";
export const LANGUAGE_LABEL: Record<Language, string> = { en: "English", ar: "Arabic", other: "Other" };

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

/** The 13th digit of an ISBN, from the first 12. */
export function isbn13CheckDigit(first12: string): string {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return String((10 - (sum % 10)) % 10);
}

/**
 * An ISBN as typed (with spaces, dashes or "ISBN" in front) → 13 digits.
 * A 10-digit ISBN becomes the same book's 13-digit one. Empty is allowed.
 */
export function normaliseIsbn(raw: string): { ok: true; isbn: string | null } | { ok: false } {
  const s = raw.trim().replace(/^ISBN[:\s]*/i, "").replace(/[\s-]/g, "").toUpperCase();
  if (s === "") return { ok: true, isbn: null };
  if (/^[0-9]{9}[0-9X]$/.test(s)) {
    const sum = [...s].reduce((t, c, i) => t + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11 !== 0) return { ok: false };
    const body = "978" + s.slice(0, 9);
    return { ok: true, isbn: body + isbn13CheckDigit(body) };
  }
  if (/^97[89][0-9]{10}$/.test(s)) {
    return isbn13CheckDigit(s.slice(0, 12)) === s[12] ? { ok: true, isbn: s } : { ok: false };
  }
  return { ok: false };
}

/** 9780306406157 → 978-0306406157 (the prefix apart, easier to read aloud). */
export function formatIsbn(isbn: string): string {
  return `${isbn.slice(0, 3)}-${isbn.slice(3)}`;
}

export type BookValues = {
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  published_year: number | null;
  language: Language;
};

export function parseBookForm(get: Get): Result<BookValues> {
  const title = tidy(get("title"));
  const author = tidy(get("author"));
  const publisher = tidy(get("publisher"));
  const yearText = get("year").trim();
  const language = get("language");
  if (!title) return { ok: false, error: "Please type the book's title." };
  if (title.length > 300) return { ok: false, error: "The title can be 300 characters at most." };
  if (author.length > 200) return { ok: false, error: "The author can be 200 characters at most." };
  if (publisher.length > 200) return { ok: false, error: "The publisher can be 200 characters at most." };
  if (!(language in LANGUAGE_LABEL)) return { ok: false, error: "Please pick the book's language." };
  const isbn = normaliseIsbn(get("isbn"));
  if (!isbn.ok) return { ok: false, error: "That ISBN does not look right. Check the 13 digits under the barcode, or leave it empty." };
  let year: number | null = null;
  if (yearText) {
    if (!/^[0-9]{4}$/.test(yearText) || Number(yearText) < 1000 || Number(yearText) > new Date().getFullYear() + 1) {
      return { ok: false, error: "The year should be four digits, for example 1998, and not in the future." };
    }
    year = Number(yearText);
  }
  return {
    ok: true,
    values: { title, author: author || null, language: language as Language, isbn: isbn.isbn, publisher: publisher || null, published_year: year },
  };
}

export function parseCopyNote(raw: string): Result<string | null> {
  const note = tidy(raw);
  if (note.length > 200) return { ok: false, error: "The copy note can be 200 characters at most." };
  return { ok: true, values: note || null };
}

export function friendlyLibraryError(message: string | undefined): string {
  if (!message) return "That could not be saved. Please try again.";
  if (/row-level security|permission denied|42501|Only a Super Admin/i.test(message)) return "Your account is not allowed to do this.";
  if (/library_books_unique_isbn/i.test(message)) {
    return "A book with this ISBN is already in the library. Use “Another copy of a book we have” instead.";
  }
  if (/library_copies_label_serial_key/i.test(message)) return "This label is already on another copy. Use a new label.";
  if (/library_copies_label_serial_fkey/i.test(message)) return "That label number has never been printed. Check the number on the label.";
  // The database's own messages are already written in plain words.
  if (/label|ISBN|switched off|could not be found|cannot be|title|year/i.test(message) && !/violates|constraint|syntax|column/i.test(message)) {
    return message;
  }
  return "That could not be saved. Please try again.";
}

/** One row of the database's library_book_list view. */
export type BookRow = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  published_year: number | null;
  language: Language;
  active: boolean;
  created_at: string;
  copies: number;
};
export const BOOK_COLUMNS = "id, title, author, isbn, publisher, published_year, language, active, created_at, copies";

/** Characters that would break the database search ("or" filter); dropped. */
export function searchTerm(raw: string): string {
  return raw.replace(/[%_,()*\\"]/g, " ").trim().replace(/\s+/g, " ").slice(0, 100);
}
