// Plain rules for places (slice P1.12), kept free of the database and the
// screens so they can be unit-tested: place numbers (PL-0001), what goes
// inside what, the add or rename form, and the place label sheet.
//
// Place labels are shelf-edge style, A4 with 14 labels, 2 across and 7 down,
// each 99.1 x 38.1 mm (Avery L7163 size, owner's decision 19 Nov 2026). The
// QR code holds only the web link with the place number: no other data.

export type PlaceKind = "building" | "room" | "store_room" | "shelf";

export const PLACE_KINDS: PlaceKind[] = ["building", "room", "store_room", "shelf"];

export const KIND_WORD: Record<PlaceKind, string> = {
  building: "Building",
  room: "Room",
  store_room: "Store room",
  shelf: "Shelf",
};

/** What can be added inside each kind of place (null: nothing). */
export const CHILD_KIND: Record<PlaceKind, PlaceKind | null> = {
  building: "room",
  room: "store_room",
  store_room: "shelf",
  shelf: null,
};

export function isPlaceKind(v: string): v is PlaceKind {
  return (PLACE_KINDS as string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Place numbers

/** 7 → "PL-0007". */
export function placeCode(n: number): string {
  return `PL-${String(n).padStart(4, "0")}`;
}

/** "PL-0007", "pl 7" or "PL7" → 7. Anything else (an item label too) → null. */
export function parsePlaceCode(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^PL-?(\d{1,7})$/.exec(raw.trim().toUpperCase().replace(/\s+/g, ""));
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 ? n : null;
}

export function placePath(n: number): string {
  return `/p/${placeCode(n)}`;
}

/** The full link in a place label's QR code: the app's address, /p/ and the number. */
export function placeLink(origin: string, n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("Not a place number.");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Not a web address.");
  return `${url.origin}${placePath(n)}`;
}

// ---------------------------------------------------------------------------
// The add or rename form

export const MAX_PLACE_NAME = 80;
export const MAX_PLACE_NOTES = 500;

export function parsePlaceForm(
  get: (name: string) => string,
): { ok: true; values: { name: string; notes: string | null } } | { ok: false; error: string } {
  const name = get("name").trim().replace(/\s+/g, " ");
  const notes = get("notes").trim();
  if (!name) return { ok: false, error: "Please give the place a name." };
  if (name.length > MAX_PLACE_NAME) return { ok: false, error: `Keep the name to ${MAX_PLACE_NAME} characters or fewer.` };
  if (notes.length > MAX_PLACE_NOTES) return { ok: false, error: `Keep the notes to ${MAX_PLACE_NOTES} characters or fewer.` };
  return { ok: true, values: { name, notes: notes || null } };
}

/** The database's refusals in plain words. Its own messages are already plain. */
export function friendlyPlaceError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/locations_unique_name_per_parent|duplicate key/i.test(message)) {
    return "There is already a place called that in the same spot. Choose another name.";
  }
  if (/still holds|inside it first|switched off|stocktake|must be inside|cannot be inside|cannot be changed/i.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  return "That could not be saved. Please check the details and try again.";
}

// ---------------------------------------------------------------------------
// The place label sheet

export const PLACES_PER_SHEET = 14;
export const MAX_PLACE_SKIP = PLACES_PER_SHEET - 1;

/** Sizes in millimetres, for the printed page (Avery L7163 size). */
export const PLACE_SHEET_MM = {
  pageWidth: 210,
  pageHeight: 297,
  top: 15.15,
  side: 4.65,
  labelWidth: 99.1,
  labelHeight: 38.1,
  columnGap: 2.5,
  columns: 2,
  rows: 7,
} as const;

/** "Skip the first __ spaces" box: 0 to 13. Anything else counts as 0. */
export function parsePlaceSkip(raw: string | string[] | null | undefined): number {
  const text = (Array.isArray(raw) ? raw[0] : raw ?? "").trim();
  if (!/^\d{1,2}$/.test(text)) return 0;
  const n = Number(text);
  return n <= MAX_PLACE_SKIP ? n : 0;
}

/** Places the labels on sheets of 14; skipped spaces and the end stay empty. */
export function layoutPlaceSheets<T>(cells: T[], skip = 0): (T | null)[][] {
  if (cells.length === 0) return [];
  const all: (T | null)[] = [...Array<null>(skip).fill(null), ...cells];
  const sheets: (T | null)[][] = [];
  for (let i = 0; i < all.length; i += PLACES_PER_SHEET) {
    const sheet = all.slice(i, i + PLACES_PER_SHEET);
    while (sheet.length < PLACES_PER_SHEET) sheet.push(null);
    sheets.push(sheet);
  }
  return sheets;
}
