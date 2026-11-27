// Plain rules for items and labels, kept free of the database and the
// browser so they can be unit-tested.

export type ItemKind = "fixed_asset" | "consumable";
export type Condition = "good" | "fair" | "damaged" | "missing" | "disposed";
export type Tone = "green" | "amber" | "red" | "grey";

export const KIND_LABEL: Record<ItemKind, string> = { fixed_asset: "Fixed asset", consumable: "Consumable" };

export const CONDITIONS: Condition[] = ["good", "fair", "damaged", "missing", "disposed"];

/** Status colour always comes with a word (PLAN.md section 4). */
export const CONDITION_STATUS: Record<Condition, { word: string; tone: Tone }> = {
  good: { word: "Good", tone: "green" },
  fair: { word: "Fair", tone: "amber" },
  damaged: { word: "Damaged", tone: "red" },
  missing: { word: "Missing", tone: "red" },
  disposed: { word: "Disposed", tone: "grey" },
};

// ---------------------------------------------------------------------------
// Labels

/**
 * Turns what was typed or scanned into a label number, or null if it is not
 * one. Accepts "ICCI-000123", "icci 123", "123" and "000123".
 */
export function parseLabelNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^(?:ICCI-?)?(\d{1,6})$/.exec(cleaned);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1) return null;
  return `ICCI-${String(n).padStart(6, "0")}`;
}

/**
 * Reads one part of a web address (such as the label number in /l/...) as
 * plain text. A badly formed link is kept as typed instead of crashing the page.
 */
export function safeDecode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** The link printed in each label's QR code (only the number, no data). */
export function labelPath(serial: string): string {
  return `/l/${serial}`;
}

// ---------------------------------------------------------------------------
// Money and dates

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

export function formatEuro(cents: number | null | undefined): string {
  return cents == null ? "Not recorded" : euro.format(cents / 100);
}

/** "125.50", "€1,200" or "" → cents. Returns undefined for nonsense. */
export function parseEuro(raw: string): number | null | undefined {
  const cleaned = raw.trim().replace(/[€,\s]/g, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return undefined;
  return Math.round(Number(cleaned) * 100);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "Not recorded";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Dublin" });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-IE", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Dublin",
  });
}

// ---------------------------------------------------------------------------
// Locations

export type LocationRow = { id: string; name: string; kind: string; parent_id: string | null; active?: boolean };

/** "Building A › Room A1 › Store Room A1-1" */
export function locationPath(id: string, all: Map<string, LocationRow>): string {
  const parts: string[] = [];
  let current = all.get(id);
  let guard = 0;
  while (current && guard++ < 10) {
    parts.unshift(current.name);
    current = current.parent_id ? all.get(current.parent_id) : undefined;
  }
  return parts.join(" › ") || "Unknown location";
}

/**
 * E2: a list shows only the last two parts of a place ("Room A1 › Shelf
 * A1-1-1"), so a row stays one or two lines; the full path goes on hover.
 */
export function shortPlace(path: string): string {
  const parts = path.split(" › ");
  return parts.length <= 2 ? path : parts.slice(-2).join(" › ");
}

/** A location and every location inside it (for "filter by location"). */
export function locationAndInside(id: string, all: LocationRow[]): string[] {
  const found = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const l of all) {
      if (l.parent_id && found.has(l.parent_id) && !found.has(l.id)) {
        found.add(l.id);
        grew = true;
      }
    }
  }
  return [...found];
}

/** Locations in tree order, each with its full path, for drop-down lists. */
export function locationOptions(all: LocationRow[], kinds?: string[]): { id: string; path: string }[] {
  const map = new Map(all.map((l) => [l.id, l]));
  return all
    .filter((l) => l.active !== false && (!kinds || kinds.includes(l.kind)))
    .map((l) => ({ id: l.id, path: locationPath(l.id, map) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

// ---------------------------------------------------------------------------
// Search

/**
 * Makes typed search text safe for the database filter: characters with a
 * special meaning there become "_", which matches any one character, so
 * "chair (oak)" still finds "chair (oak)".
 */
export function cleanSearch(raw: string | null | undefined): string {
  return (raw ?? "")
    .replace(/[,()*%\\:"'.]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}
