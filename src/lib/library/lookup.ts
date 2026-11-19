// Looking a book up from its ISBN (slice P4.3; docs/PHASE-4.md section 5).
// Runs on the website's server, never in the phone. Only the ISBN is sent to
// Open Library (run by the Internet Archive; free, no account, no key): no
// names, no borrower details, nothing about the Centre, no cookies. If the
// service is slow (5 seconds) or down, the person types the details instead:
// adding a book never depends on it.
import { normaliseIsbn } from "./rules";

export type LookedUp = { title: string; author: string | null; publisher: string | null; year: number | null };
export type LookupResult = { status: "found"; details: LookedUp } | { status: "not_found" } | { status: "unavailable" };

const DEFAULT_BASE = "https://openlibrary.org";
const TIMEOUT_MS = 5000;
/** Names the app, as Open Library asks; no email or other contact details. */
const USER_AGENT = "ICCI-Control-Dashboard/0.1 (lending library ISBN look-up)";

/**
 * Where to ask: Open Library, unless OPEN_LIBRARY_URL is set (the browser
 * tests point it at a pretend book service on this computer). Anything that
 * is not a plain http(s) web address is ignored.
 */
export function openLibraryBase(setting: string | undefined): string {
  if (!setting) return DEFAULT_BASE;
  try {
    const u = new URL(setting);
    if (u.protocol !== "https:" && u.protocol !== "http:") return DEFAULT_BASE;
    return u.origin;
  } catch {
    return DEFAULT_BASE;
  }
}

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");
const cut = (s: string, max: number) => (s.length > max ? s.slice(0, max) : s);

function names(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list.flatMap((x) => (x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string" ? [tidy((x as { name: string }).name)] : [])).filter(Boolean);
}

/** Open Library's answer → the details to check, or null when nothing usable was found. */
export function readOpenLibraryAnswer(answer: unknown, isbn: string): LookedUp | null {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const book = (answer as Record<string, unknown>)[`ISBN:${isbn}`];
  if (!book || typeof book !== "object" || Array.isArray(book)) return null;
  const b = book as Record<string, unknown>;
  if (typeof b.title !== "string" || !tidy(b.title)) return null;
  const subtitle = typeof b.subtitle === "string" ? tidy(b.subtitle) : "";
  const title = cut(subtitle ? `${tidy(b.title)}: ${subtitle}` : tidy(b.title), 300);
  const authors = names(b.authors);
  const publishers = names(b.publishers);
  const yearMatch = typeof b.publish_date === "string" ? /(1[0-9]{3}|20[0-9]{2})/.exec(b.publish_date) : null;
  return {
    title,
    author: authors.length ? cut(authors.join(", "), 200) : null,
    publisher: publishers.length ? cut(publishers[0], 200) : null,
    year: yearMatch ? Number(yearMatch[1]) : null,
  };
}

type Options = { fetchFn?: typeof fetch; baseUrl?: string; timeoutMs?: number };

/** Asks Open Library about one ISBN. Never throws. */
export async function lookupIsbn(isbn: string, options: Options = {}): Promise<LookupResult> {
  // Only a correct 13-digit ISBN is ever sent.
  const checked = normaliseIsbn(isbn);
  if (!checked.ok || !checked.isbn || checked.isbn !== isbn) return { status: "not_found" };
  const fetchFn = options.fetchFn ?? fetch;
  const base = options.baseUrl ?? openLibraryBase(process.env.OPEN_LIBRARY_URL);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? TIMEOUT_MS);
  try {
    const response = await fetchFn(`${base}/api/books?bibkeys=ISBN:${isbn}&jscmd=data&format=json`, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response.ok) return { status: "unavailable" };
    const answer: unknown = await response.json();
    const details = readOpenLibraryAnswer(answer, isbn);
    return details ? { status: "found", details } : { status: "not_found" };
  } catch {
    return { status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/** A barcode read by the camera → the ISBN, only if it is a book's (978/979, correct check digit). */
export function isbnFromBarcode(text: string): string | null {
  const s = text.trim();
  if (!/^97[89][0-9]{10}$/.test(s)) return null;
  const r = normaliseIsbn(s);
  return r.ok && r.isbn === s ? s : null;
}
