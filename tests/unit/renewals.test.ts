// Slice P2.8: the plain rules behind the renewals register screens. The
// database works out each status itself (tests/db/renewals.test.ts).
import { describe, expect, it } from "vitest";
import {
  dueLine,
  friendlyRenewalError,
  hrefOf,
  parseDueDate,
  parseRenewalDetails,
  parseRenewedForm,
  readRegisterFilter,
  REGISTER_STATUS,
  statusesFor,
  suggestedNextDue,
  worstFirst,
  type RegisterRow,
} from "@/lib/renewals/rules";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const TODAY = "2026-11-16";

describe("status words and colours", () => {
  it("always has a word beside the colour; overdue is red, an ended warranty grey", () => {
    expect(REGISTER_STATUS.overdue).toEqual({ word: "Overdue", tone: "red" });
    expect(REGISTER_STATUS.due).toEqual({ word: "Due soon", tone: "amber" });
    expect(REGISTER_STATUS.ok).toEqual({ word: "Up to date", tone: "green" });
    expect(REGISTER_STATUS.ended).toEqual({ word: "Ended", tone: "grey" });
  });
});

describe("worstFirst", () => {
  it("puts overdue first, then due soonest, ended last", () => {
    const row = (title: string, status: RegisterRow["status"], due_on: string | null) => ({ title, status, due_on });
    const sorted = worstFirst([
      row("ok", "ok", "2027-06-01"),
      row("ended", "ended", "2026-01-01"),
      row("due later", "due", "2026-12-20"),
      row("overdue", "overdue", "2026-11-01"),
      row("due sooner", "due", "2026-11-20"),
    ]);
    expect(sorted.map((r) => r.title)).toEqual(["overdue", "due sooner", "due later", "ok", "ended"]);
  });
});

describe("where a row opens", () => {
  it.each([
    ["manual", "/renewals/x"],
    ["vehicle_tax", "/vehicles/x"],
    ["vehicle_nct", "/vehicles/x"],
    ["vetting", "/people/x"],
    ["policy_review", "/policies/x"],
    ["warranty", "/items/x"],
  ] as const)("%s opens %s", (source, href) => {
    expect(hrefOf({ source, record_id: "x" })).toBe(href);
  });
});

describe("dueLine", () => {
  it("says it plainly", () => {
    expect(dueLine("2026-11-28", "due", 12)).toBe("Due in 12 days.");
    expect(dueLine("2026-11-16", "due", 0)).toBe("Due today.");
    expect(dueLine("2026-11-15", "overdue", -1)).toBe("1 day overdue.");
    expect(dueLine("2026-11-12", "ended", -4)).toBe("Ended 4 days ago.");
    expect(dueLine(null, "none", null)).toBe("No due date recorded.");
  });
});

describe("the list filter", () => {
  it("shows what needs attention unless asked otherwise; ignores unknown values", () => {
    expect(readRegisterFilter({})).toEqual({ show: "attention", from: "" });
    expect(readRegisterFilter({ show: "all", from: "vehicles" })).toEqual({ show: "all", from: "vehicles" });
    expect(readRegisterFilter({ show: "nonsense", from: "training" })).toEqual({ show: "attention", from: "" });
    expect(statusesFor("attention")).toEqual(["overdue", "none", "due"]);
    expect(statusesFor("ended")).toEqual(["ended"]);
  });
});

describe("the renewal form", () => {
  const good = { title: "  Test   lift  inspection ", category: "Safety inspection" };
  it("tidies the title and accepts empty optional fields", () => {
    expect(parseRenewalDetails(form(good))).toEqual({
      ok: true,
      values: { title: "Test lift inspection", category: "Safety inspection", owner_person_id: null, documents_needed: null, notes: null },
    });
  });
  it("needs a title and a category from the list", () => {
    expect(parseRenewalDetails(form({ ...good, title: " " }))).toMatchObject({ ok: false });
    expect(parseRenewalDetails(form({ ...good, category: "Parking" }))).toEqual({ ok: false, error: "Please pick a category." });
    expect(parseRenewalDetails(form({ ...good, owner_person_id: "Bob" }))).toMatchObject({ ok: false });
  });
  it("checks the due date: real, at most 10 years ahead; already passed is allowed", () => {
    expect(parseDueDate("2026-11-01", TODAY)).toEqual({ ok: true, values: "2026-11-01" });
    expect(parseDueDate("2026-02-30", TODAY)).toMatchObject({ ok: false });
    expect(parseDueDate("2036-11-17", TODAY)).toMatchObject({ ok: false });
    expect(parseDueDate("", TODAY)).toMatchObject({ ok: false });
  });
});

describe("the mark-renewed form", () => {
  it("needs a past or today renewal date and a later due date", () => {
    expect(parseRenewedForm(form({ renewed_on: TODAY, due_on: "2027-11-16" }), TODAY)).toEqual({
      ok: true,
      values: { renewed_on: TODAY, due_on: "2027-11-16" },
    });
    expect(parseRenewedForm(form({ renewed_on: "2026-11-17", due_on: "2027-11-16" }), TODAY)).toMatchObject({ ok: false });
    expect(parseRenewedForm(form({ renewed_on: TODAY, due_on: TODAY }), TODAY)).toEqual({ ok: false, error: "The next due date must be after the renewal date." });
  });
  it("suggests a year later", () => {
    expect(suggestedNextDue("2026-11-16")).toBe("2027-11-16");
    expect(suggestedNextDue("")).toBe("");
  });
});

describe("friendly errors", () => {
  it("hides database wording that is not plain", () => {
    expect(friendlyRenewalError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyRenewalError("The owner is switched off. Pick someone who is switched on.")).toMatch(/switched off/);
    expect(friendlyRenewalError("syntax error at or near")).toMatch(/could not be saved/);
  });
});
