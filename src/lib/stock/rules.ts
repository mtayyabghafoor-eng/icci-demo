// Plain stock rules, kept free of the database and the browser so they can
// be unit-tested. The quantity itself is worked out by the database
// (the stock_levels view in migration 0007), never here.
import type { Tone } from "@/lib/items/rules";
import { quantityWord } from "@/lib/ui/text";

export type StockStatus = "not_counted" | "out" | "low" | "in_stock";

/** Status colour always comes with a word (PLAN.md section 4). */
export const STOCK_STATUS: Record<StockStatus, { word: string; tone: Tone }> = {
  not_counted: { word: "Not counted yet", tone: "grey" },
  out: { word: "Out", tone: "red" },
  low: { word: "Low", tone: "amber" },
  in_stock: { word: "In stock", tone: "green" },
};

/** Same rule as the database: Low is at or below the minimum, Out is zero. */
export function stockStatus(quantity: number | null, minimum: number): StockStatus {
  if (quantity == null) return "not_counted";
  if (quantity === 0) return "out";
  if (quantity <= minimum) return "low";
  return "in_stock";
}

export const MAX_QUANTITY = 1_000_000;

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** A whole number typed into a count, restock or correction box. */
export function parseQuantity(raw: string, use: "count" | "restock" | "correction"): Parsed<number> {
  const cleaned = raw.trim();
  if (cleaned === "") return { ok: false, error: "Enter a number." };
  if (!/^\d+$/.test(cleaned)) return { ok: false, error: "Enter a whole number, like 12." };
  const value = Number(cleaned);
  if (value > MAX_QUANTITY) return { ok: false, error: "That number is too large." };
  if (use === "restock" && value < 1) return { ok: false, error: "Add at least one." };
  return { ok: true, value };
}

export function parseReason(raw: string): Parsed<string> {
  const value = raw.trim();
  if (!value) return { ok: false, error: "Write a reason." };
  if (value.length > 1000) return { ok: false, error: "The reason is too long (1,000 characters at most)." };
  return { ok: true, value };
}

export function describeUsage(usage: number | null, unit: string): string {
  if (usage == null) return "Needs two counts";
  if (usage === 0) return "None used since the count before";
  if (usage < 0) return `${quantityWord(-usage, unit)} more found than expected (a restock may not have been entered)`;
  return `${quantityWord(usage, unit)} used since the count before`;
}

export const MOVEMENT_LABEL: Record<string, string> = {
  count: "Count",
  restock: "Restock",
  adjustment: "Correction",
};

export const ADJUSTMENT_STATUS: Record<string, { word: string; tone: Tone }> = {
  pending: { word: "Waiting for approval", tone: "amber" },
  approved: { word: "Approved", tone: "green" },
  rejected: { word: "Rejected", tone: "red" },
};

/** Turns a database refusal into a sentence for the screen. */
export function friendlyStockError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/stock_movements_one_pending_per_entry/i.test(message)) {
    return "A correction of this entry is already waiting for approval.";
  }
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  // The database's own rules are written as plain sentences.
  if (/^[A-Z][^\n]{5,200}\.$/.test(message.trim())) return message.trim();
  return "Something went wrong. Please try again.";
}
