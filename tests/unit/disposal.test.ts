import { describe, expect, it } from "vitest";
import { describeDisposal, parseDisposalFields, routeLabel } from "@/lib/assets/disposal";

const TODAY = "2026-11-20";
const form = (values: Record<string, string>) => (field: string) => values[field] ?? "";

describe("parseDisposalFields", () => {
  it("needs a route", () => {
    expect(parseDisposalFields(form({}), TODAY)).toEqual({ ok: false, error: "Choose how the item is leaving." });
    expect(parseDisposalFields(form({ disposal_route: "burnt" }), TODAY).ok).toBe(false);
  });

  it.each(["recycled", "shredded", "thrown_away", "religious_texts"])("%s needs nothing more", (route) => {
    expect(parseDisposalFields(form({ disposal_route: route, disposal_recipient: "ignored", sale_price: "5" }), TODAY)).toEqual({
      ok: true,
      values: { disposal_route: route },
    });
  });

  it("charity needs the charity's name; returned to owner needs the owner's", () => {
    expect(parseDisposalFields(form({ disposal_route: "charity" }), TODAY)).toEqual({ ok: false, error: "Enter the name of the charity." });
    expect(parseDisposalFields(form({ disposal_route: "returned_to_owner" }), TODAY)).toEqual({ ok: false, error: "Enter the owner's name." });
    expect(parseDisposalFields(form({ disposal_route: "charity", disposal_recipient: " Test Charity " }), TODAY)).toEqual({
      ok: true,
      values: { disposal_route: "charity", disposal_recipient: "Test Charity" },
    });
  });

  const sale = { disposal_route: "sold", sale_price: "12.50", sale_buyer: "Test Buyer", sale_date: "2026-11-19", sale_money_taken_by: "Test Treasurer" };

  it("sold needs price, buyer, date and who took the money", () => {
    expect(parseDisposalFields(form(sale), TODAY)).toEqual({
      ok: true,
      values: { disposal_route: "sold", sale_price_cents: 1250, sale_buyer: "Test Buyer", sale_date: "2026-11-19", sale_money_taken_by: "Test Treasurer" },
    });
    for (const [field, error] of [
      ["sale_price", /price/],
      ["sale_buyer", /buyer/],
      ["sale_date", /date of the sale/],
      ["sale_money_taken_by", /who took the money/],
    ] as const) {
      const r = parseDisposalFields(form({ ...sale, [field]: "" }), TODAY);
      expect(r.ok, field).toBe(false);
      if (!r.ok) expect(r.error).toMatch(error);
    }
  });

  it("a sale cannot be dated in the future, and the price must be a number", () => {
    expect(parseDisposalFields(form({ ...sale, sale_date: "2026-11-21" }), TODAY)).toEqual({ ok: false, error: "The date of the sale cannot be in the future." });
    expect(parseDisposalFields(form({ ...sale, sale_price: "ten" }), TODAY).ok).toBe(false);
  });
});

describe("routeLabel and describeDisposal", () => {
  const none = { disposal_recipient: null, sale_price_cents: null, sale_buyer: null, sale_date: null, sale_money_taken_by: null };

  it("old disposals say the route was not recorded", () => {
    expect(routeLabel(null)).toBe("Route not recorded");
    expect(describeDisposal({ disposal_route: null, ...none })).toBe("Route not recorded");
  });

  it("describes each kind of route", () => {
    expect(describeDisposal({ disposal_route: "religious_texts", ...none })).toBe("Respectful disposal of religious texts");
    expect(describeDisposal({ ...none, disposal_route: "charity", disposal_recipient: "Test Charity" })).toBe("Given to charity: Test Charity");
    expect(
      describeDisposal({ disposal_route: "sold", disposal_recipient: null, sale_price_cents: 2500, sale_buyer: "Test Buyer", sale_date: "2026-11-03", sale_money_taken_by: "Test Treasurer" }),
    ).toBe("Sold: €25.00 to Test Buyer on 3 Nov 2026; money taken by Test Treasurer");
  });
});
