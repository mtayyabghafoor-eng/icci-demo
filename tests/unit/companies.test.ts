// Slices P1.19 and P1.21: the company and model forms, who to call, the
// contact person and warranty status.
import { describe, expect, it } from "vitest";
import {
  contactPerson,
  friendlyCompanyError,
  kindWords,
  parseCompanyForm,
  parseModelForm,
  telLink,
  warrantyEndFrom,
  warrantyStatus,
  whoToCall,
} from "@/lib/companies/rules";

const ID = "11111111-1111-1111-1111-111111111111";
const ID2 = "22222222-2222-2222-2222-222222222222";
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";
const all = (values: Record<string, string[]>) => (k: string) => values[k] ?? [];

describe("parseCompanyForm", () => {
  it("tidies the name and keeps what they do", () => {
    const r = parseCompanyForm(form({ name: "  Demo  Gates Ltd ", phone: "+353 00 000 0201", website: "demo-gates.example" }), all({ kinds: ["service", "installer", "nonsense"] }));
    expect(r).toEqual({
      ok: true,
      values: { name: "Demo Gates Ltd", kinds: ["service", "installer"], phone: "+353 00 000 0201", email: null, website: "https://demo-gates.example", notes: null },
    });
  });
  it.each([
    [{ name: "" }, /name/],
    [{ name: "X", phone: "call me" }, /phone/],
    [{ name: "X", email: "nope" }, /email/],
    [{ name: "X", website: "not a site" }, /website/],
  ])("refuses %j", (values, error) => {
    const r = parseCompanyForm(form(values as Record<string, string>), all({}));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(error);
  });
});

describe("kindWords", () => {
  it("names what a company does in a fixed order", () => {
    expect(kindWords(["service", "supplier"])).toBe("Supplier, Service and repair");
    expect(kindWords([])).toBe("Not said");
  });
});

describe("parseModelForm", () => {
  it("needs a maker, a model and a category; warranty months are optional", () => {
    expect(parseModelForm(form({ maker_company_id: ID, model_name: " WX-200 ", category_id: ID2, warranty_months: "24" }))).toEqual({
      ok: true,
      values: { maker_company_id: ID, model_name: "WX-200", category_id: ID2, service_company_id: null, warranty_months: 24, notes: null },
    });
    expect(parseModelForm(form({ model_name: "WX", category_id: ID2 })).ok).toBe(false);
    expect(parseModelForm(form({ maker_company_id: ID, model_name: "WX", category_id: ID2, warranty_months: "0" })).ok).toBe(false);
  });
});

describe("whoToCall", () => {
  const c = (id: string | null) => ({ service_company_id: id });
  it("uses the item's own company first, then the model's, then the sub-category's, then the main category's", () => {
    expect(whoToCall(c("i"), c("m"), c("s"), c("x"))).toEqual({ companyId: "i", from: "item" });
    expect(whoToCall(c(null), c("m"), c("s"), c("x"))).toEqual({ companyId: "m", from: "model" });
    expect(whoToCall(c(null), null, c("s"), c("x"))).toEqual({ companyId: "s", from: "sub-category" });
    expect(whoToCall(c(null), c(null), c(null), c("x"))).toEqual({ companyId: "x", from: "main category" });
    expect(whoToCall(c(null), null, null, null)).toBeNull();
  });
});

describe("contactPerson", () => {
  it("uses the sub-category's person, else the main category's", () => {
    expect(contactPerson({ contact_person_id: "a" }, { contact_person_id: "b" })).toBe("a");
    expect(contactPerson({ contact_person_id: null }, { contact_person_id: "b" })).toBe("b");
    expect(contactPerson(null, null)).toBeNull();
  });
});

describe("warranty", () => {
  it("is under warranty up to and including the last day", () => {
    expect(warrantyStatus("2026-11-21", "2026-11-21").state).toBe("under");
    expect(warrantyStatus("2026-11-20", "2026-11-21").state).toBe("ended");
    expect(warrantyStatus(null, "2026-11-21").state).toBe("unknown");
  });
  it("counts a model's usual warranty from the purchase date", () => {
    expect(warrantyEndFrom("2026-01-15", 24)).toBe("2028-01-14");
    expect(warrantyEndFrom("2026-01-31", 1)).toBe("2026-02-27");
  });
});

describe("telLink and friendlyCompanyError", () => {
  it("makes a phone number tappable", () => {
    expect(telLink("+353 00 000-0201")).toBe("tel:+353000000201");
    expect(telLink("(01) 000 0201")).toBe("tel:010000201");
  });
  it("explains refusals in plain words", () => {
    expect(friendlyCompanyError('duplicate key value violates unique constraint "companies_unique_name"')).toMatch(/already a company/);
    expect(friendlyCompanyError("That company is switched off. Pick another one.")).toMatch(/switched off/);
    expect(friendlyCompanyError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
  });
});
