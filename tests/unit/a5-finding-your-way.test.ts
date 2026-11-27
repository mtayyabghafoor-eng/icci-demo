// Slice A5: Home's order and links, "For you to approve", Back that remembers
// the list you came from, the new menu lines and the filters Home opens.
import { describe, expect, it } from "vitest";
import { approvalLinks, ATTENTION_ORDER, counterCards, splitCards, stocktakeLink, type HomeCounters } from "@/lib/home/counters";
import { backTarget, listAddress, memoryAction } from "@/lib/ui/back";
import { activeLink, MENU, menuFor, whereAmI } from "@/lib/ui/menu";
import { readRegisterFilter, statusesFor } from "@/lib/renewals/rules";
import { filterSquares, readGridFilter, type Square } from "@/lib/policies/signoffs";

const zero: HomeCounters = {
  low_stock: 0,
  out_of_stock: 0,
  damaged: 0,
  missing: 0,
  corrections_for_me: 0,
  disposals_for_me: 0,
  stocktake_diffs_for_me: 0,
  vetting_expired: 0,
  vetting_none: 0,
  vetting_due: 0,
  signoffs_overdue: 0,
  signoffs_unsigned: 0,
  renewals_overdue: 0,
  renewals_due_30: 0,
  rota_today: 12,
  rota_today_unfilled: 0,
  tickets_open: 0,
  tickets_urgent: 0,
};

describe("A5: Home puts people and safety first", () => {
  it("orders red lines by the owner's list: vetting, sign-offs, renewals, tickets, then stock, assets, approvals", () => {
    const busy: HomeCounters = {
      ...zero,
      low_stock: 3,
      out_of_stock: 1,
      damaged: 1,
      corrections_for_me: 2,
      vetting_expired: 1,
      signoffs_overdue: 1,
      renewals_overdue: 1,
      tickets_open: 1,
    };
    const { attention } = splitCards(counterCards(busy));
    expect(attention.map((c) => c.id)).toEqual(["vetting", "signoffs", "renewals", "tickets", "low-stock", "missing-damaged", "corrections-for-me"]);
  });

  it("still puts every red line before every amber one", () => {
    // D1: low stock is amber now; an overdue renewal is red and comes first.
    const { attention } = splitCards(counterCards({ ...zero, vetting_due: 2, low_stock: 1, renewals_overdue: 1 }));
    expect(attention.map((c) => [c.id, c.tone])).toEqual([
      ["renewals", "red"],
      ["vetting", "amber"],
      ["low-stock", "amber"],
    ]);
  });

  it("names every Home line in the order list", () => {
    for (const c of counterCards(zero)) expect(ATTENTION_ORDER).toContain(c.id);
  });
});

describe("A5: each Home line opens its list showing what it counted", () => {
  const busy: HomeCounters = { ...zero, vetting_due: 1, signoffs_unsigned: 2, renewals_due_30: 1 };
  const href = (c: HomeCounters, id: string) => counterCards(c).find((x) => x.id === id)!.href;

  it("opens the filtered lists when there is something to see", () => {
    expect(href(busy, "vetting")).toBe("/people/vetting?status=attention");
    expect(href(busy, "signoffs")).toBe("/policies/grid?status=attention");
    expect(href(busy, "renewals")).toBe("/renewals?show=soon");
  });

  it("opens the whole list when all is clear", () => {
    expect(href(zero, "vetting")).toBe("/people/vetting");
    expect(href(zero, "signoffs")).toBe("/policies/grid");
    expect(href(zero, "renewals")).toBe("/renewals");
  });

  it("opens the one stocktake waiting, or the list when several wait", () => {
    expect(stocktakeLink([7])).toBe("/stocktake/7");
    expect(stocktakeLink([9, 7])).toBe("/stocktake");
    expect(stocktakeLink([])).toBe("/stocktake");
    expect(counterCards({ ...zero, stocktake_diffs_for_me: 2 }, 0, "/stocktake/7").find((c) => c.id === "stocktake-for-me")!.href).toBe("/stocktake/7");
  });

  it("renewals 'soon' lists overdue and due rows only (the page keeps due dates within 30 days)", () => {
    expect(readRegisterFilter({ show: "soon" }).show).toBe("soon");
    expect(statusesFor("soon")).toEqual(["overdue", "due"]);
    expect(readRegisterFilter({ show: "nonsense" }).show).toBe("attention");
  });

  it("the policy grid's 'attention' keeps people with any overdue or unsigned square", () => {
    const sq = (person_id: string, status: Square["status"]) => ({ person_id, status, section_id: "s", person_role_id: "r" }) as Square;
    const squares = [sq("a", "signed"), sq("a", "signed"), sq("b", "signed"), sq("b", "unsigned"), sq("c", "overdue")];
    const f = readGridFilter({ status: "attention" }, new Set(), new Set());
    expect(f.status).toBe("attention");
    expect([...new Set(filterSquares(squares, f).map((s) => s.person_id))]).toEqual(["b", "c"]);
  });
});

describe("A5: For you to approve", () => {
  it("is not a link when nothing waits", () => {
    expect(approvalLinks(zero)).toEqual({ links: [] });
  });
  it("opens the queue when only one has something", () => {
    expect(approvalLinks({ ...zero, disposals_for_me: 2 })).toEqual({ href: "/assets/approvals", links: [] });
    expect(approvalLinks({ ...zero, stocktake_diffs_for_me: 1 }, "/stocktake/4")).toEqual({ href: "/stocktake/4", links: [] });
  });
  it("lists the queues when several have something", () => {
    expect(approvalLinks({ ...zero, corrections_for_me: 1, stocktake_diffs_for_me: 3 }, "/stocktake")).toEqual({
      links: [
        { href: "/stock/approvals", label: "1 stock correction" },
        { href: "/stocktake", label: "3 stocktake differences" },
      ],
    });
  });
});

describe("A5: Back returns to the list you came from", () => {
  const items = { href: "/items", name: "All items" };
  const people = { href: "/people", name: "People" };

  it("keeps the search and page of the page's own list, and its own name", () => {
    expect(backTarget(items, "/items?q=chair&page=2")).toEqual({ href: "/items?q=chair&page=2", name: "All items" });
  });
  it("returns to another list that leads to this page, and names it", () => {
    expect(backTarget(people, "/people/vetting?status=attention")).toEqual({ href: "/people/vetting?status=attention", name: "Garda vetting" });
    expect(backTarget(items, "/assets/register?place=x")).toEqual({ href: "/assets/register?place=x", name: "Asset register" });
  });
  it("never goes back to the page you are on", () => {
    const policies = { href: "/policies", name: "Policies" };
    expect(backTarget(policies, "/policies/grid?status=attention", "/policies/grid")).toEqual(policies);
  });
  it("ignores a list that does not lead to this page", () => {
    expect(backTarget(items, "/people/vetting")).toEqual(items);
    expect(backTarget(people, "/tickets")).toEqual(people);
  });
  it("never uses an address outside the app's own lists", () => {
    for (const bad of ["//evil.example/items", "https://evil.example/items", "/items\\x", "/nowhere?x=1", "", null]) {
      expect(listAddress(bad)).toBeNull();
      expect(backTarget(items, bad)).toEqual(items);
    }
  });
  it("a page with its own one-level-up address (an item's sub-page) is never changed", () => {
    expect(backTarget({ href: "/items/123", name: "Back to the item" }, "/items?q=x")).toEqual({ href: "/items/123", name: "Back to the item" });
  });
  it("remembers lists, forgets on Home, Scan and menu pages, keeps on inner pages", () => {
    const menu = MENU.flatMap((g) => g.links.map((l) => l.href));
    expect(memoryAction("/people/vetting", menu)).toBe("remember");
    expect(memoryAction("/items", menu)).toBe("remember");
    expect(memoryAction("/", menu)).toBe("forget");
    expect(memoryAction("/scan", menu)).toBe("forget");
    expect(memoryAction("/items/new", menu)).toBe("forget");
    expect(memoryAction("/people/abc", menu)).toBe("keep");
  });
});

describe("A5: the menu", () => {
  it("adds Stock corrections waiting and Reminders for the admins only", () => {
    for (const role of ["super_admin", "centre_admin"]) {
      const hrefs = menuFor(role).flatMap((g) => g.links.map((l) => l.href));
      expect(hrefs).toContain("/stock/approvals");
      expect(hrefs).toContain("/reminders");
    }
    for (const role of ["finance", "library_operator"]) {
      const hrefs = menuFor(role).flatMap((g) => g.links.map((l) => l.href));
      expect(hrefs).not.toContain("/stock/approvals");
      expect(hrefs).not.toContain("/reminders");
    }
    expect(activeLink("/stock/approvals")!.link.label).toBe("Stock corrections waiting");
    expect(whereAmI("/reminders")).toEqual({ group: "Overview", page: "Reminders" });
  });
  it("the top bar names a page by the role's own menu", () => {
    expect(whereAmI("/library/on-loan", "centre_admin")).toEqual({ group: "Library", page: "Library desk" });
    expect(whereAmI("/library/on-loan", "library_operator")).toEqual({ group: "Library", page: "On loan" });
    expect(whereAmI("/library/on-loan")).toEqual({ group: "Library", page: "On loan" });
  });
});
