// Title Case for fixed screen titles written in code ("Move this asset" becomes
// "Move This Asset"). Never used on names or text that admins type in.
// Short joining words stay small unless they come first or last.
const SMALL = new Set(["a", "an", "and", "as", "at", "by", "for", "in", "of", "on", "or", "the", "to", "with"]);

export function titleCase(text: string): string {
  const words = text.split(" ");
  return words
    .map((word, i) => {
      if (word === "") return word;
      const lower = word.toLowerCase();
      const edge = i === 0 || i === words.length - 1;
      if (!edge && SMALL.has(lower)) return lower;
      // Keep words that already carry capitals inside them (ICCI, CSV, Jumu'ah).
      if (/[A-Z]/.test(word.slice(1))) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Joins class names, skipping empty ones. */
/**
 * UI-9: records the set-up script made (before any admin existed) have no
 * admin behind them; the database calls that "Seed script". On screen they
 * say "Initial import", which is also what a real first import would be.
 */
export const IMPORTED = "Initial import";
export function whoName(name: string | null | undefined): string {
  return !name || name === "Seed script" ? IMPORTED : name;
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Two letters for the initials circle: first and last word. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** "1 to 50 of 487" from a 1-based page, a page size and a total. */
export function rangeText(page: number, size: number, total: number): string {
  if (total === 0) return "None";
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  const n = (x: number) => x.toLocaleString("en-IE");
  return `${n(from)} to ${n(to)} of ${n(total)}`;
}

/** Long lists show this many rows per page (docs/UI-PLAN.md 5.3). */
export const PAGE_SIZE = 50;

/** The page number in the address (?page=3); page 1 for anything odd. */
export function readPage(value: string | string[] | undefined): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 1;
  return Math.max(1, Number.parseInt(value, 10));
}

/** A page number kept within the pages there are (an empty list has one). */
export function lastPage(page: number, total: number, size: number): number {
  return Math.min(page, Math.max(1, Math.ceil(total / size)));
}

/** One page of a list already found in full (so counts and filters stay exact). */
export function pageOf<T>(all: T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(all.length / size));
  const p = Math.min(page, pages);
  return { rows: all.slice((p - 1) * size, p * size), page: p, pages, total: all.length };
}

/**
 * D1: a number with its unit in plain English: "1 roll", "13 rolls",
 * "2 boxes", "3 batteries". A unit already plural ("scissors") or of two
 * words ("pairs of gloves") is left alone after the first word's rule.
 */
/** E8: the unit as it reads after a number other than one ("roll" → "rolls"). */
export function unitPlural(unit: string): string {
  return quantityWord(2, unit).replace(/^2 ?/, "");
}

export function quantityWord(n: number, unit: string): string {
  const u = unit.trim();
  if (!u || Math.abs(n) === 1) return `${n}${u ? ` ${u}` : ""}`.trim();
  const [first, ...rest] = u.split(" ");
  let many = first;
  if (/(s|x|z|ch|sh)$/i.test(first)) many = /ss$|x$|z$|ch$|sh$/i.test(first) ? `${first}es` : first;
  else if (/[^aeiou]y$/i.test(first)) many = `${first.slice(0, -1)}ies`;
  else many = `${first}s`;
  return [String(n), many, ...rest].join(" ");
}
