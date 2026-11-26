// Expenses (PLAN.md 5.5; docs/PHASE-5.md, owner approved 25 Nov 2026).
// Slice P5.1: who handles claims, the two lists (spend categories and
// funds) and the two amounts in Expense settings. The database decides
// what is allowed; these lists only decide what the screens offer.
import type { Get } from "@/lib/forms";
import { parseEuro } from "@/lib/items/rules";

/** Enter, see, approve and export claims (section 5 of the plan). */
export const MAY_HANDLE_EXPENSES = ["super_admin", "centre_admin", "finance"];
/** Add, rename and switch off spend categories and funds. */
export const MAY_KEEP_EXPENSE_LISTS = ["super_admin", "finance"];
/** Ask for, confirm or turn down a new amount (a different Super Admin confirms; migration 0052). */
export const MAY_CHANGE_EXPENSE_AMOUNTS = ["super_admin"];

export type ExpenseCategory = { id: string; name: string; active: boolean };
export type ExpenseFund = { id: string; name: string; restricted: boolean; active: boolean };
export type SettingKey = "second_approval_cents" | "lost_receipt_second_cents";
export type Setting = { key: SettingKey; amount_cents: number; updated_at: string };

export const SETTING_KEYS: SettingKey[] = ["second_approval_cents", "lost_receipt_second_cents"];

export const SETTING_TEXT: Record<SettingKey, { title: string; help: string }> = {
  second_approval_cents: {
    title: "Second approver above",
    help: "A claim for more than this needs a second person to approve it, as well as the first.",
  },
  lost_receipt_second_cents: {
    title: "Lost receipt: second approver above",
    help: "A claim without a receipt for more than this needs a second approver, whatever the amount above.",
  },
};

export const MAX_CENTS = 100_000_000;

type Parsed<T> = { ok: true; values: T } | { ok: false; error: string };

/** A category or fund name: 1 to 100 characters, spaces at the ends dropped. */
export function parseListName(get: Get, what: "category" | "fund"): Parsed<{ name: string }> {
  const name = get("name").trim();
  if (!name) return { ok: false, error: `Type a name for the ${what}.` };
  if (name.length > 100) return { ok: false, error: "That name is too long (100 characters at most)." };
  return { ok: true, values: { name } };
}

/** A new fund: its name and whether it is restricted (fixed once added). */
export function parseNewFund(get: Get): Parsed<{ name: string; restricted: boolean }> {
  const named = parseListName(get, "fund");
  if (!named.ok) return named;
  const kind = get("restricted");
  if (kind !== "yes" && kind !== "no") return { ok: false, error: "Say whether the fund is restricted." };
  return { ok: true, values: { name: named.values.name, restricted: kind === "yes" } };
}

/** One of the two amounts, typed in euro ("500", "€1,200.50"). */
export function parseSettingAmount(get: Get): Parsed<{ amount_cents: number }> {
  const cents = parseEuro(get("amount"));
  if (cents === null) return { ok: false, error: "Type an amount in euro." };
  if (cents === undefined) return { ok: false, error: "Type the amount in euro, for example 500 or 75.50." };
  if (cents > MAX_CENTS) return { ok: false, error: "The amount can be at most €1,000,000." };
  return { ok: true, values: { amount_cents: cents } };
}

export function isSettingKey(key: string): key is SettingKey {
  return (SETTING_KEYS as string[]).includes(key);
}

/** A request for a new amount, waiting for a second Super Admin (migration 0052). */
export type SettingChange = { id: number; key: SettingKey; amount_cents: number; created_by: string | null; created_at: string };
export type SettingDecision = "confirmed" | "turned_down" | "cancelled";

export function isSettingDecision(s: string): s is SettingDecision {
  return s === "confirmed" || s === "turned_down" || s === "cancelled";
}

/** The database's refusals, in the words the screens use. */
export function friendlyExpenseError(message: string | undefined): string {
  const m = message ?? "";
  if (/already exists|duplicate key/i.test(m)) return m.includes("already exists") ? m : "That name is already on the list.";
  if (/restricted cannot be changed/i.test(m)) return m;
  // Migration 0052: a used name is locked; amounts need a second Super Admin.
  if (/already used on claims|second Super Admin|different Super Admin|only the person who asked|already decided|amount is already/i.test(m)) return m;
  if (/row-level security|permission denied/i.test(m)) return "Your account is not allowed to do this.";
  if (/amount_cents/i.test(m)) return "The amount must be between €0 and €1,000,000.";
  return "That could not be saved. Please try again.";
}
