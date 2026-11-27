// Slice 9: the words and colours on the home page counter cards.
// The numbers themselves come from the database (tests/db/home-counters.test.ts).
import { describe, expect, it } from "vitest";
import { APPROVAL_IDS, approvalsTotal, counterCards, homeSections, urgentSentence, greeting, longDate, lowStockDetail, MAY_SEE_COUNTERS, splitCards, type HomeCounters } from "@/lib/home/counters";

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
  // P3.3: a day whose rota is fully filled is all clear.
  rota_today: 12,
  rota_today_unfilled: 0,
  tickets_open: 0,
  tickets_urgent: 0,
};
const card = (c: HomeCounters, id: string) => counterCards(c).find((x) => x.id === id)!;

describe("home page counter cards", () => {
  it("shows the ten counters that exist today, each opening its list", () => {
    expect(counterCards(zero).map((c) => [c.id, c.href])).toEqual([
      ["low-stock", "/stock"],
      ["missing-damaged", "/assets"],
      ["corrections-for-me", "/stock/approvals"],
      ["disposals-for-me", "/assets/approvals"],
      ["stocktake-for-me", "/stocktake"],
      ["vetting", "/people/vetting"],
      ["signoffs", "/policies/grid"],
      ["renewals", "/renewals"],
      ["rota-today", "/rota/today"],
      ["tickets", "/tickets"],
    ]);
  });

  it("is green and says 'All clear' at zero", () => {
    for (const c of counterCards(zero)) {
      expect(c.count).toBe(0);
      expect(c.tone).toBe("green");
      expect(c.detail).toMatch(/^All clear/);
    }
  });

  it("D1: red only for safety and things overdue; stock, assets, approvals and open tickets are amber", () => {
    const some = { ...zero, low_stock: 3, damaged: 1, corrections_for_me: 2, disposals_for_me: 1, stocktake_diffs_for_me: 4, vetting_expired: 1, signoffs_overdue: 1, renewals_overdue: 1, tickets_open: 2, tickets_urgent: 1 };
    const tones = Object.fromEntries(counterCards(some).map((c) => [c.id, c.tone]));
    expect(tones).toMatchObject({ vetting: "red", signoffs: "red", renewals: "red", tickets: "red" });
    expect(tones).toMatchObject({ "low-stock": "amber", "missing-damaged": "amber", "corrections-for-me": "amber", "disposals-for-me": "amber", "stocktake-for-me": "amber" });
    expect(card({ ...zero, tickets_open: 3 }, "tickets").tone).toBe("amber");
  });

  it("UI-9: says plainly how many are out, how many are low, and how many are not counted yet", () => {
    expect(card({ ...zero, low_stock: 3, out_of_stock: 1 }, "low-stock").detail).toBe("1 out of stock · 2 running low");
    expect(card({ ...zero, low_stock: 9, out_of_stock: 9 }, "low-stock").detail).toBe("9 out of stock");
    expect(card({ ...zero, low_stock: 3 }, "low-stock").detail).toBe("3 running low");
    expect(lowStockDetail({ ...zero, low_stock: 9, out_of_stock: 9 }, 11)).toBe("9 out of stock · 11 not counted yet");
    expect(lowStockDetail({ ...zero, low_stock: 1 }, 1)).toBe("1 running low · 1 not counted yet");
    expect(lowStockDetail(zero, 4)).toBe("All clear. Nothing counted is low · 4 not counted yet");
    expect(lowStockDetail(zero, 0)).toBe("All clear. Every counted item is above its minimum.");
  });
  it("UI-9: adds up everything waiting for your approval", () => {
    expect(approvalsTotal(zero)).toBe(0);
    expect(approvalsTotal({ ...zero, corrections_for_me: 2, disposals_for_me: 1, stocktake_diffs_for_me: 4 })).toBe(7);
  });

  it("adds missing and damaged together and says each", () => {
    const c = card({ ...zero, damaged: 2, missing: 1 }, "missing-damaged");
    expect(c.count).toBe(3);
    expect(c.detail).toBe("1 missing, 2 damaged.");
  });

  it("vetting (P2.3): adds expired, missing and due; red when any is expired or missing, amber when only due", () => {
    const red = card({ ...zero, vetting_expired: 2, vetting_none: 1, vetting_due: 3 }, "vetting");
    expect(red.count).toBe(6);
    expect(red.tone).toBe("red");
    expect(red.detail).toBe("2 expired, 1 not vetted, 3 due within 60 days.");
    const amber = card({ ...zero, vetting_due: 1 }, "vetting");
    expect(amber.tone).toBe("amber");
    expect(amber.detail).toBe("0 expired, 0 not vetted, 1 due within 60 days.");
    expect(card(zero, "vetting").detail).toBe("All clear. Everyone who needs vetting is vetted.");
  });

  it("is shown only to Super Admin and Centre Admin", () => {
    expect(MAY_SEE_COUNTERS).toEqual(["super_admin", "centre_admin"]);
  });
});

describe("policy sign-offs card (P2.6)", () => {
  it("adds overdue and unsigned; red when any is overdue, amber when only unsigned", () => {
    const red = counterCards({ ...zero, signoffs_overdue: 2, signoffs_unsigned: 5 }).find((c) => c.id === "signoffs")!;
    expect(red).toMatchObject({ count: 7, tone: "red", detail: "2 overdue, 5 not signed yet." });
    expect(counterCards({ ...zero, signoffs_unsigned: 1 }).find((c) => c.id === "signoffs")!.tone).toBe("amber");
    expect(counterCards(zero).find((c) => c.id === "signoffs")!.detail).toMatch(/All clear/);
  });
});

describe("renewals card (P2.8)", () => {
  it("adds overdue and due in 30 days; red when any is overdue, amber when only due", () => {
    expect(card({ ...zero, renewals_overdue: 2, renewals_due_30: 3 }, "renewals")).toMatchObject({
      count: 5,
      tone: "red",
      detail: "2 overdue, 3 due within 30 days.",
    });
    expect(card({ ...zero, renewals_due_30: 1 }, "renewals").tone).toBe("amber");
    expect(card(zero, "renewals").detail).toBe("All clear. Nothing overdue or due within 30 days.");
  });
});

describe("today's rota card (P3.3)", () => {
  it("is amber when a slot today has nobody on it, and says how many are filled", () => {
    const c = card({ ...zero, rota_today: 12, rota_today_unfilled: 3 }, "rota-today");
    expect(c.count).toBe(3);
    expect(c.tone).toBe("amber");
    expect(c.detail).toBe("9 of 12 slots filled today.");
  });

  it("is amber when there is no rota for today", () => {
    const c = card({ ...zero, rota_today: 0, rota_today_unfilled: 0 }, "rota-today");
    expect(c.tone).toBe("amber");
    expect(c.detail).toMatch(/No rota for today/);
  });

  it("is all clear when every slot today is filled", () => {
    expect(card(zero, "rota-today").detail).toBe("All clear. All 12 slots today have someone on them.");
  });
});

describe("home page layout (UI-4)", () => {
  it("puts red cards first, then amber, and keeps all-clear cards apart", () => {
    const some = { ...zero, vetting_due: 1, damaged: 1, low_stock: 2 };
    const { attention, clear } = splitCards(counterCards(some));
    expect(attention.map((c) => [c.id, c.tone])).toEqual([
      ["vetting", "amber"],
      ["low-stock", "amber"],
      ["missing-damaged", "amber"],
    ]);
    expect(clear.map((c) => c.id)).toEqual(["corrections-for-me", "disposals-for-me", "stocktake-for-me", "signoffs", "renewals", "rota-today", "tickets"]);
  });

  it("has nothing needing attention when every card is clear", () => {
    const { attention, clear } = splitCards(counterCards(zero));
    expect(attention).toEqual([]);
    expect(clear).toHaveLength(10);
  });

  it("E1: says only how many things are urgent today", () => {
    expect(urgentSentence(0)).toBe("Nothing is urgent today.");
    expect(urgentSentence(1)).toBe("1 thing is urgent today.");
    expect(urgentSentence(3)).toBe("3 things are urgent today.");
  });

  it("E1: only red counters are urgent; the rest go to the quiet row, jobs before all-clear, approvals never", () => {
    const some = { ...zero, vetting_none: 1, renewals_due_30: 2, low_stock: 4, damaged: 1, corrections_for_me: 3, tickets_open: 2, tickets_urgent: 1 };
    const { urgent, quiet } = homeSections(counterCards(some));
    expect(urgent.map((c) => c.id)).toEqual(["vetting", "tickets"]);
    expect(urgent.every((c) => c.tone === "red")).toBe(true);
    // Amber jobs first (A5 order), then the all-clear ones (A5 order); no approval queue.
    expect(quiet.map((c) => c.id)).toEqual(["renewals", "low-stock", "missing-damaged", "signoffs", "rota-today"]);
    expect(quiet.some((c) => APPROVAL_IDS.includes(c.id))).toBe(false);
  });

  it("E1: nothing urgent when no counter is red", () => {
    const { urgent, quiet } = homeSections(counterCards({ ...zero, low_stock: 9, missing: 3 }));
    expect(urgent).toEqual([]);
    expect(quiet.slice(0, 2).map((c) => c.id)).toEqual(["low-stock", "missing-damaged"]);
  });

  it("greets by the Dublin clock, summer time included", () => {
    // 15 Nov 2026 (Irish winter time = UTC).
    expect(greeting(Date.UTC(2026, 10, 15, 8, 0))).toBe("Good morning");
    expect(greeting(Date.UTC(2026, 10, 15, 13, 0))).toBe("Good afternoon");
    expect(greeting(Date.UTC(2026, 10, 15, 19, 0))).toBe("Good evening");
    // 15 Jul 2026, 11:30 UTC is 12:30 in Dublin (summer time).
    expect(greeting(Date.UTC(2026, 6, 15, 11, 30))).toBe("Good afternoon");
    expect(greeting(Date.UTC(2026, 10, 15, 0, 5))).toBe("Good morning");
  });

  it("writes the date in full", () => {
    expect(longDate(Date.UTC(2026, 10, 15, 12, 0))).toBe("Sunday 15 November 2026");
  });
});

describe("open tickets card (P3.6)", () => {
  it("is red with the urgent ones named, green 'All clear' at zero", () => {
    expect(card({ ...zero, tickets_open: 5, tickets_urgent: 2 }, "tickets")).toMatchObject({ count: 2, tone: "red", title: "Urgent maintenance tickets", detail: "5 tickets are open in all." });
    expect(card({ ...zero, tickets_open: 5 }, "tickets")).toMatchObject({ count: 5, tone: "amber", detail: "None is urgent." });
    expect(card({ ...zero, tickets_open: 1, tickets_urgent: 1 }, "tickets").detail).toBe("1 ticket is open in all.");
    expect(card({ ...zero, tickets_open: 3 }, "tickets").detail).toBe("None is urgent.");
    expect(card(zero, "tickets")).toMatchObject({ count: 0, tone: "green", detail: "All clear. Every ticket is closed." });
  });
});
