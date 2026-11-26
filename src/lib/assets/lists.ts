// Plain rules for two asset lists (PLAN.md 5.1 screens):
// "Not seen in 12 months" and the asset register by place and value, with
// its CSV file. The database decides who may read them and when an asset
// was last seen (view asset_last_seen, migration 0016).
import { CONDITION_STATUS } from "@/lib/items/rules";

// ---------------------------------------------------------------------------
// Not seen in 12 months

/** The same moment one year earlier (29 February → 28 February). */
export function notSeenCutoff(now: Date): Date {
  const d = new Date(now);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** How the asset was last seen, in words. */
export const SEEN_HOW_LABEL: Record<string, string> = {
  registered: "Registered",
  move: "Moved",
  damage: "Reported damaged",
  back_in_use: "Marked repaired or found",
  stocktake_scan: "Scanned in a stocktake",
};

// ---------------------------------------------------------------------------
// Asset register

export type RegisterRow = {
  id: string;
  label_serial: string;
  name: string;
  category: string;
  place: string;
  condition: string;
  value_cents: number | null;
  purchase_date: string | null;
  warranty_end: string | null;
};

export type PlaceGroup = { place: string; rows: RegisterRow[]; total_cents: number; without_value: number };

/** One group per place (by name), most valuable assets first inside each. */
export function groupByPlace(rows: RegisterRow[]): PlaceGroup[] {
  const groups = new Map<string, PlaceGroup>();
  for (const r of rows) {
    const g = groups.get(r.place) ?? { place: r.place, rows: [], total_cents: 0, without_value: 0 };
    g.rows.push(r);
    if (r.value_cents == null) g.without_value++;
    else g.total_cents += r.value_cents;
    groups.set(r.place, g);
  }
  for (const g of groups.values()) {
    g.rows.sort((a, b) => (b.value_cents ?? -1) - (a.value_cents ?? -1) || a.name.localeCompare(b.name));
  }
  return [...groups.values()].sort((a, b) => a.place.localeCompare(b.place));
}

// ---------------------------------------------------------------------------
// CSV

/**
 * One cell. Quoted when it holds a comma, quote or line break. A cell that a
 * spreadsheet would treat as a formula (starting = + - @, tab or return) gets
 * a leading apostrophe, so a made-up item name can never run anything.
 */
export function csvCell(value: string): string {
  let v = value;
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A whole file. Starts with a marker so Excel reads Arabic text correctly. */
export function toCsv(rows: string[][]): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(",") + "\r\n").join("");
}

/** "1234.56": a plain number a spreadsheet can add up. */
const plainEuro = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

export const REGISTER_CSV_HEADER = [
  "Label",
  "Name",
  "Category",
  "Place",
  "Condition",
  "Value (EUR)",
  "Purchase date",
  "Warranty end",
];

export function registerCsv(rows: RegisterRow[]): string {
  const total = rows.reduce((sum, r) => sum + (r.value_cents ?? 0), 0);
  const word = (c: string) => CONDITION_STATUS[c as keyof typeof CONDITION_STATUS]?.word ?? c;
  return toCsv([
    REGISTER_CSV_HEADER,
    ...rows.map((r) => [
      r.label_serial,
      r.name,
      r.category,
      r.place,
      word(r.condition),
      plainEuro(r.value_cents),
      r.purchase_date ?? "",
      r.warranty_end ?? "",
    ]),
    ["Total", "", "", "", "", plainEuro(total), "", ""],
  ]);
}

/** "icci-asset-register-2026-11-15.csv" (the date in Dublin). */
export function registerFileName(now: Date): string {
  const day = now.toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
  return `icci-asset-register-${day}.csv`;
}

/** Who may see these lists (the database refuses everyone else anyway). */
export const MAY_SEE_ASSET_LISTS = ["super_admin", "centre_admin"];
/** P5.1 (owner, 25 Nov 2026): Finance also reads the asset register, never the items themselves. */
export const MAY_SEE_ASSET_REGISTER = [...MAY_SEE_ASSET_LISTS, "finance"];
