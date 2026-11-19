// Plain stocktake rules for the screens, kept free of the database and the
// browser so they can be unit-tested. The differences themselves are worked
// out by the database (migrations 0010 and 0011), never here.
import type { Tone } from "@/lib/items/rules";

export type DifferenceKind = "missing" | "move_here" | "found" | "quantity";
export type DifferenceStatus = "pending" | "approved" | "rejected";

/** The order the groups are shown in. */
export const DIFFERENCE_KINDS: DifferenceKind[] = ["missing", "move_here", "found", "quantity"];

export const DIFFERENCE_TITLE: Record<DifferenceKind, string> = {
  missing: "Expected here but not found",
  move_here: "Found here, recorded somewhere else",
  found: "Marked missing, but found here",
  quantity: "Counted a different number",
};

/** What approving the difference will do, in plain words. */
export const DIFFERENCE_EFFECT: Record<DifferenceKind, string> = {
  missing: "If approved, the asset is marked Missing.",
  move_here: "If approved, the asset is moved to this room.",
  found: "If approved, the asset is back in use in the condition you choose, and moved to this room if it was recorded elsewhere.",
  quantity: "If approved, the stock is corrected by the difference found.",
};

/** One line describing an asset difference. */
export function describeAssetDifference(kind: Exclude<DifferenceKind, "quantity">, recordedAt: string): string {
  if (kind === "missing") return `Recorded at ${recordedAt}. Not scanned.`;
  if (kind === "found") return `Marked missing, recorded at ${recordedAt}. Scanned in this room.`;
  return `Recorded at ${recordedAt}. Scanned in this room.`;
}

export const DIFFERENCE_STATUS: Record<DifferenceStatus, { word: string; tone: Tone }> = {
  pending: { word: "Waiting for approval", tone: "amber" },
  approved: { word: "Approved", tone: "green" },
  rejected: { word: "Rejected", tone: "red" },
};

export const STOCKTAKE_STATUS: Record<"open" | "submitted", { word: string; tone: Tone }> = {
  open: { word: "Under way", tone: "amber" },
  submitted: { word: "Sent for approval", tone: "green" },
};

/** "10 expected, 7 found (3 fewer)". */
export function describeQuantity(expected: number | null, found: number, unit: string): string {
  if (expected == null) return `Never counted before. ${found} ${unit} found.`;
  const diff = found - expected;
  const change = diff === 0 ? "the same" : diff < 0 ? `${-diff} fewer` : `${diff} more`;
  return `${expected} ${unit} expected, ${found} ${unit} found (${change}).`;
}

/** "3 waiting" / "All decided" for a sent stocktake. */
export function decisionSummary(statuses: DifferenceStatus[]): string {
  if (statuses.length === 0) return "No differences";
  const waiting = statuses.filter((s) => s === "pending").length;
  if (waiting === 0) return "All decided";
  return `${waiting} of ${statuses.length} waiting`;
}

/** Turns a database refusal into a sentence for the screen. */
export function friendlyStocktakeError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/stocktakes_one_open_per_room/i.test(message)) return "A stocktake of this room is already under way. Carry on with that one.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  // The database's own rules are written as plain sentences.
  const plain = message.trim();
  if (/^[A-Z][^\n]{5,200}[.)]$/.test(plain)) return plain;
  return "Something went wrong. Please try again.";
}

/** The name of the cookie that remembers which stocktake this browser is scanning for. */
export const SCANNING_COOKIE = "icci_stocktake";

/** Reads the cookie's value as a stocktake number, or null. */
export function parseStocktakeId(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const n = Number(raw);
  return n > 0 ? n : null;
}
