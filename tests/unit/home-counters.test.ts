// Slice 9: the words and colours on the home page counter cards.
// The numbers themselves come from the database (tests/db/home-counters.test.ts).
import { describe, expect, it } from "vitest";
import { attentionSentence, counterCards, greeting, longDate, MAY_SEE_COUNTERS, splitCards, type HomeCounters } from "@/lib/home/counters";

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

  it("is red when something needs attention", () => {
    const some = { ...zero, low_stock: 3, damaged: 1, corrections_for_me: 2, disposals_for_me: 1, stocktake_diffs_for_me: 4, vetting_expired: 1, signoffs_overdue: 1, renewals_overdue: 1, tickets_open: 2 };
    for (const c of counterCards(some).filter((x) => x.id !== "rota-today")) expect(c.tone).toBe("red");
  });

  it("says how many low items are out completely", () => {
    expect(card({ ...zero, low_stock: 3, out_of_stock: 1 }, "low-stock").detail).toBe("Low or out. 1 is out completely.");
    expect(card({ ...zero, low_stock: 3, out_of_stock: 2 }, "low-stock").detail).toBe("Low or out. 2 are out completely.");
    expect(card({ ...zero, low_stock: 3 }, "low-stock").detail).toBe("Low or out. None is out completely.");
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
      ["low-stock", "red"],
      ["missing-damaged", "red"],
      ["vetting", "amber"],
    ]);
    expect(clear.map((c) => c.id)).toEqual(["corrections-for-me", "disposals-for-me", "stocktake-for-me", "signoffs", "renewals", "rota-today", "tickets"]);
  });

  it("has nothing needing attention when every card is clear", () => {
    const { attention, clear } = splitCards(counterCards(zero));
    expect(attention).toEqual([]);
    expect(clear).toHaveLength(10);
  });

  it("says how many things need attention in plain words", () => {
    expect(attentionSentence(0)).toBe("Nothing needs attention. Everything is clear.");
    expect(attentionSentence(1)).toBe("1 thing needs attention.");
    expect(attentionSentence(4)).toBe("4 things need attention.");
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
    expect(card({ ...zero, tickets_open: 5, tickets_urgent: 2 }, "tickets")).toMatchObject({ count: 5, tone: "red", detail: "2 are urgent." });
    expect(card({ ...zero, tickets_open: 1, tickets_urgent: 1 }, "tickets").detail).toBe("1 is urgent.");
    expect(card({ ...zero, tickets_open: 3 }, "tickets").detail).toBe("None is urgent.");
    expect(card(zero, "tickets")).toMatchObject({ count: 0, tone: "green", detail: "All clear. Every ticket is closed." });
  });
});
