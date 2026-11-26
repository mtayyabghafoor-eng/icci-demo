// Slice P5.1: reading the Expense settings forms. The database enforces the
// rules themselves (tests/db/expense-settings.test.ts).
import { describe, expect, it } from "vitest";
import { friendlyExpenseError, isSettingKey, parseListName, parseNewFund, parseSettingAmount } from "@/lib/expenses/rules";
import type { Get } from "@/lib/forms";

const form = (values: Record<string, string>): Get => (name) => values[name] ?? "";

describe("category and fund names", () => {
  it("drops spaces at the ends and refuses an empty or very long name", () => {
    expect(parseListName(form({ name: "  Utilities " }), "category")).toEqual({ ok: true, values: { name: "Utilities" } });
    expect(parseListName(form({ name: "   " }), "category")).toEqual({ ok: false, error: "Type a name for the category." });
    expect(parseListName(form({ name: "x".repeat(101) }), "fund").ok).toBe(false);
  });

  it("accepts Arabic names", () => {
    expect(parseListName(form({ name: "زكاة" }), "fund")).toEqual({ ok: true, values: { name: "زكاة" } });
  });

  it("a new fund must say whether it is restricted", () => {
    expect(parseNewFund(form({ name: "Sadaqah", restricted: "yes" }))).toEqual({ ok: true, values: { name: "Sadaqah", restricted: true } });
    expect(parseNewFund(form({ name: "Building", restricted: "no" }))).toEqual({ ok: true, values: { name: "Building", restricted: false } });
    expect(parseNewFund(form({ name: "Building" }))).toEqual({ ok: false, error: "Say whether the fund is restricted." });
  });
});

describe("the two amounts", () => {
  it("are typed in euro and kept in cents", () => {
    expect(parseSettingAmount(form({ amount: "500" }))).toEqual({ ok: true, values: { amount_cents: 50000 } });
    expect(parseSettingAmount(form({ amount: "€1,200.50" }))).toEqual({ ok: true, values: { amount_cents: 120050 } });
    expect(parseSettingAmount(form({ amount: "0" }))).toEqual({ ok: true, values: { amount_cents: 0 } });
  });

  it("refuse nonsense, nothing, and more than €1,000,000", () => {
    expect(parseSettingAmount(form({ amount: "" })).ok).toBe(false);
    expect(parseSettingAmount(form({ amount: "five hundred" })).ok).toBe(false);
    expect(parseSettingAmount(form({ amount: "-5" })).ok).toBe(false);
    expect(parseSettingAmount(form({ amount: "12.345" })).ok).toBe(false);
    expect(parseSettingAmount(form({ amount: "1000000.01" })).ok).toBe(false);
  });

  it("only the two known settings can be changed", () => {
    expect(isSettingKey("second_approval_cents")).toBe(true);
    expect(isSettingKey("lost_receipt_second_cents")).toBe(true);
    expect(isSettingKey("anything_else")).toBe(false);
  });
});

describe("refusals in plain words", () => {
  it("passes the database's own plain sentences through and translates the rest", () => {
    expect(friendlyExpenseError('A fund called "Zakat" already exists.')).toBe('A fund called "Zakat" already exists.');
    expect(friendlyExpenseError("duplicate key value violates unique constraint")).toBe("That name is already on the list.");
    expect(friendlyExpenseError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyExpenseError("something odd")).toBe("That could not be saved. Please try again.");
  });
});
