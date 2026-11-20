import { describe, expect, it } from "vitest";
import { idleMsLeft, IDLE_LIMIT_MS } from "@/lib/auth/rules";
import { activeLink, bottomBarFor, MENU, mayScan, menuFor, whereAmI } from "@/lib/ui/menu";

const labels = (role: string) => menuFor(role).flatMap((g) => g.links.map((l) => l.label));

describe("menuFor: each role sees only what it can use", () => {
  it("Super Admin and Centre Admin see every current link", () => {
    const all = MENU.flatMap((g) => g.links.map((l) => l.label));
    expect(labels("super_admin")).toEqual(all);
    expect(labels("centre_admin")).toEqual(all);
  });
  it("Finance sees Home only; the Library Operator also sees the library (P4.2)", () => {
    expect(labels("finance")).toEqual(["Home"]);
    expect(labels("library_operator")).toEqual(["Home", "Library", "Add a book", "Lend", "Return", "Borrowers", "On loan", "Overdue", "Most borrowed", "Lost and withdrawn"]);
    expect(menuFor("finance").map((g) => g.title)).toEqual(["Overview"]);
  });
  it("P1.16: Places sits next to Register an item; Disposals waiting is under Assets", () => {
    const items = MENU.find((g) => g.title === "Items and stock")!.links.map((l) => l.label);
    expect(items.indexOf("Places")).toBe(items.indexOf("Register an item") + 1);
    expect(MENU.find((g) => g.title === "Assets")!.links.map((l) => l.label)).toContain("Disposals waiting");
  });
  it("an unknown role sees nothing", () => {
    expect(menuFor("someone_else")).toEqual([]);
  });
});

describe("activeLink: which link is marked as the current page", () => {
  const current = (path: string) => activeLink(path)?.link.label ?? null;
  it.each([
    ["/", "Home"],
    ["/items", "Items"],
    ["/items/12", "Items"],
    ["/items/12/asset/move", "Items"],
    ["/items/new", "Register an item"],
    ["/l/ICCI-000123", "Items"],
    ["/labels/unknown", "Items"],
    ["/scan", "Items"],
    ["/stock", "Stock"],
    ["/stock/count", "Stock"],
    ["/stocktake/4/scan", "Stocktake"],
    ["/labels", "Print labels"],
    ["/labels/sheet/2", "Print labels"],
    ["/places", "Places"],
    ["/places/abc/labels", "Places"],
    ["/p/PL-0007", "Places"],
    ["/assets", "Missing and damaged"],
    // P1.16: Disposals waiting has its own link, so the menu marks the right one.
    ["/assets/approvals", "Disposals waiting"],
    ["/places/abc/register", "Places"],
    ["/assets/not-seen", "Not seen in 12 months"],
    ["/assets/register", "Asset register"],
    ["/people", "People"],
    ["/people/7/vetting", "People"],
    ["/people/vetting", "Garda vetting"],
    ["/people/training", "Training"],
    ["/people/training/types", "Training"],
    ["/rota", "Rota week"],
    ["/rota/slot/12", "Rota week"],
    ["/rota/add", "Rota week"],
    ["/rota/prayer-times", "Prayer times"],
    ["/rota/slot-types", "Slot types"],
    ["/rota/templates", "Templates"],
    ["/rota/templates/abc", "Templates"],
    ["/rota/use-template", "Rota week"],
    ["/tickets", "Tickets"],
    ["/tickets/42", "Tickets"],
    ["/tickets/csv", "Tickets"],
    ["/tickets/new", "Report a problem"],
    ["/policies", "Policies"],
    ["/policies/new", "Policies"],
    ["/policies/abc/versions/def", "Policies"],
    ["/policies/abc/sign-off", "Policies"],
    ["/policies/grid", "Policy grid"],
    ["/policies/grid/print", "Policy grid"],
    ["/vehicles", "Vehicles"],
    ["/vehicles/new", "Vehicles"],
    ["/vehicles/abc/renewal", "Vehicles"],
    ["/renewals", "Renewals"],
    ["/renewals/new", "Renewals"],
    ["/renewals/abc/renewed", "Renewals"],
  ])("%s is %s", (path, label) => {
    expect(current(path)).toBe(label);
  });
  it("does not confuse look-alike addresses", () => {
    expect(current("/stockroom")).toBeNull();
    expect(current("/style")).toBeNull();
  });
});

describe("whereAmI: the top bar", () => {
  it("names the group and the page", () => {
    expect(whereAmI("/stock/count")).toEqual({ group: "Items and stock", page: "Stock" });
    expect(whereAmI("/")).toEqual({ page: "Home" });
    expect(whereAmI("/scan")).toEqual({ page: "Open a label" });
    expect(whereAmI("/people/7")).toEqual({ page: "People" });
    expect(whereAmI("/people/vetting")).toEqual({ group: "People", page: "Garda vetting" });
    expect(whereAmI("/nowhere")).toBeNull();
  });
});

describe("bottomBarFor: the phone bottom bar", () => {
  it("gives admins Home, Items, a raised Scan and People", () => {
    const bar = bottomBarFor("centre_admin");
    expect(bar.map((b) => b.label)).toEqual(["Home", "Items", "Scan", "People"]);
    expect(bar.find((b) => b.label === "Scan")?.raised).toBe(true);
  });
  it("gives Finance only Home", () => {
    expect(bottomBarFor("finance").map((b) => b.label)).toEqual(["Home"]);
  });
  it("gives the Library Operator Home, Library and a raised Scan (slice P4.2)", () => {
    const bar = bottomBarFor("library_operator");
    expect(bar.map((b) => b.label)).toEqual(["Home", "Library", "Scan"]);
    expect(bar.find((b) => b.label === "Scan")?.raised).toBe(true);
  });
});

describe("the Library menu (slice P4.2)", () => {
  it("the Library Operator sees Home and the Library group only", () => {
    expect(menuFor("library_operator").map((g) => [g.title, g.links.map((l) => l.label)])).toEqual([
      ["Overview", ["Home"]],
      ["Library", ["Library", "Add a book", "Lend", "Return", "Borrowers", "On loan", "Overdue", "Most borrowed", "Lost and withdrawn"]],
    ]);
  });
  it("admins see the Library group too; Finance does not", () => {
    expect(menuFor("centre_admin").some((g) => g.title === "Library")).toBe(true);
    expect(menuFor("super_admin").some((g) => g.title === "Library")).toBe(true);
    expect(menuFor("finance").some((g) => g.title === "Library")).toBe(false);
  });
  it("who may use the Scan button", () => {
    expect(mayScan("centre_admin")).toBe(true);
    expect(mayScan("library_operator")).toBe(true);
    expect(mayScan("finance")).toBe(false);
  });
  it("names the library pages in the top bar", () => {
    expect(whereAmI("/library")).toEqual({ page: "Library" });
    expect(whereAmI("/library/new")).toEqual({ group: "Library", page: "Add a book" });
    expect(whereAmI("/library/books/123")).toEqual({ page: "Library" });
    // Slice P4.4.
    expect(whereAmI("/library/lend")).toEqual({ group: "Library", page: "Lend" });
    expect(whereAmI("/library/return")).toEqual({ group: "Library", page: "Return" });
    expect(whereAmI("/library/borrowers/abc")).toEqual({ group: "Library", page: "Borrowers" });
    expect(whereAmI("/library/on-loan")).toEqual({ group: "Library", page: "On loan" });
    expect(whereAmI("/library/overdue")).toEqual({ group: "Library", page: "Overdue" });
    expect(whereAmI("/library/most-borrowed")).toEqual({ group: "Library", page: "Most borrowed" });
    expect(whereAmI("/library/lost")).toEqual({ group: "Library", page: "Lost and withdrawn" });
    expect(whereAmI("/library/copies/abc/lend")).toEqual({ page: "Library" });
  });
});

describe("idleMsLeft: the sign-out warning", () => {
  const now = 1_800_000_000_000;
  it("counts down from 15 minutes", () => {
    expect(idleMsLeft(String(now), now)).toBe(IDLE_LIMIT_MS);
    expect(idleMsLeft(String(now - 14 * 60_000), now)).toBe(60_000);
  });
  it("is 0 when due, missing or nonsense", () => {
    expect(idleMsLeft(String(now - IDLE_LIMIT_MS), now)).toBe(0);
    expect(idleMsLeft(undefined, now)).toBe(0);
    expect(idleMsLeft("abc", now)).toBe(0);
  });
});
