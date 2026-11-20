// The home page counters (PLAN.md 5.7, slice 9). The database works out the
// numbers (public.home_counters); this file only turns them into cards with
// plain words. A card is red when something needs attention, green at zero.
import type { Tone } from "@/lib/items/rules";

export type HomeCounters = {
  low_stock: number;
  out_of_stock: number;
  damaged: number;
  missing: number;
  corrections_for_me: number;
  disposals_for_me: number;
  stocktake_diffs_for_me: number;
  /** P2.3: switched-on people only. */
  vetting_expired: number;
  vetting_none: number;
  vetting_due: number;
  /** P2.6: squares of the policy grid (switched-on people, current versions). */
  signoffs_overdue: number;
  signoffs_unsigned: number;
  /** P2.8: rows of the renewals register (warranties that have ended are not overdue). */
  renewals_overdue: number;
  renewals_due_30: number;
  /** P3.3: today's rota slots, and how many have nobody on them. */
  rota_today: number;
  rota_today_unfilled: number;
  /** P3.6: maintenance tickets not closed, and how many of them are urgent. */
  tickets_open: number;
  tickets_urgent: number;
};

export type CounterCard = {
  id: string;
  title: string;
  count: number;
  /** The line under the number, e.g. "2 of them are out". */
  detail: string;
  href: string;
  tone: Tone;
};

/** Super Admin and Centre Admin see the counters; others see a short note. */
export const MAY_SEE_COUNTERS = ["super_admin", "centre_admin"];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * UI-9: the Low stock line in plain parts, leaving out any part that is
 * zero: "9 out of stock · 2 running low · 11 not counted yet". Items never
 * counted are not in the number (they cannot be low yet), but are named so
 * nobody thinks they were forgotten.
 */
export function lowStockDetail(c: Pick<HomeCounters, "low_stock" | "out_of_stock">, notCounted = 0): string {
  const later = notCounted > 0 ? `${notCounted} not counted yet` : "";
  if (c.low_stock === 0) return later ? `All clear. Nothing counted is low · ${later}` : "All clear. Every counted item is above its minimum.";
  const lowOnly = c.low_stock - c.out_of_stock;
  return [c.out_of_stock > 0 ? `${c.out_of_stock} out of stock` : "", lowOnly > 0 ? `${lowOnly} running low` : "", later].filter(Boolean).join(" · ");
}

/** UI-9: everything waiting for this admin's approval, for the Home headline card. */
export function approvalsTotal(c: Pick<HomeCounters, "corrections_for_me" | "disposals_for_me" | "stocktake_diffs_for_me">): number {
  return c.corrections_for_me + c.disposals_for_me + c.stocktake_diffs_for_me;
}

/** `notCounted`: consumables never counted (UI-9), named on the Low stock card. */
export function counterCards(c: HomeCounters, notCounted = 0): CounterCard[] {
  const tone = (n: number): Tone => (n > 0 ? "red" : "green");
  return [
    {
      id: "low-stock",
      title: "Low stock",
      count: c.low_stock,
      detail: lowStockDetail(c, notCounted),
      href: "/stock",
      tone: tone(c.low_stock),
    },
    {
      id: "missing-damaged",
      title: "Missing or damaged",
      count: c.damaged + c.missing,
      detail:
        c.damaged + c.missing === 0
          ? "All clear. No asset is reported missing or damaged."
          : `${c.missing} missing, ${c.damaged} damaged.`,
      href: "/assets",
      tone: tone(c.damaged + c.missing),
    },
    {
      id: "corrections-for-me",
      title: "Stock corrections for you to approve",
      count: c.corrections_for_me,
      detail: c.corrections_for_me === 0 ? "All clear. Nothing waiting for you." : "Waiting for a different admin: you.",
      href: "/stock/approvals",
      tone: tone(c.corrections_for_me),
    },
    {
      id: "disposals-for-me",
      title: "Disposals for you to approve",
      count: c.disposals_for_me,
      detail: c.disposals_for_me === 0 ? "All clear. Nothing waiting for you." : "Waiting for a different admin: you.",
      href: "/assets/approvals",
      tone: tone(c.disposals_for_me),
    },
    {
      id: "stocktake-for-me",
      title: "Stocktake differences for you to approve",
      count: c.stocktake_diffs_for_me,
      detail:
        c.stocktake_diffs_for_me === 0
          ? "All clear. Nothing waiting for you."
          : "From stocktakes you took no part in.",
      href: "/stocktake",
      tone: tone(c.stocktake_diffs_for_me),
    },
    vettingCard(c),
    signoffCard(c),
    renewalsCard(c),
    rotaTodayCard(c),
    ticketsCard(c),
  ];
}

/** P3.6: red when any ticket is not closed (docs/PHASE-2-AND-3.md 5.4), urgent ones named. */
function ticketsCard(c: HomeCounters): CounterCard {
  return {
    id: "tickets",
    title: "Open maintenance tickets",
    count: c.tickets_open,
    detail:
      c.tickets_open === 0
        ? "All clear. Every ticket is closed."
        : c.tickets_urgent > 0
          ? `${plural(c.tickets_urgent, "is", "are")} urgent.`
          : "None is urgent.",
    href: "/tickets",
    tone: c.tickets_open > 0 ? "red" : "green",
  };
}

/** P2.3: red when anyone's vetting is expired or missing, amber when only due. */
function vettingCard(c: HomeCounters): CounterCard {
  const count = c.vetting_expired + c.vetting_none + c.vetting_due;
  return {
    id: "vetting",
    title: "Garda vetting expired, missing or due",
    count,
    detail:
      count === 0
        ? "All clear. Everyone who needs vetting is vetted."
        : `${c.vetting_expired} expired, ${c.vetting_none} not vetted, ${c.vetting_due} due within 60 days.`,
    href: "/people/vetting",
    tone: c.vetting_expired + c.vetting_none > 0 ? "red" : c.vetting_due > 0 ? "amber" : "green",
  };
}

/** P2.6: red when any sign-off is overdue (30 days after publishing), amber when only unsigned. */
function signoffCard(c: HomeCounters): CounterCard {
  const count = c.signoffs_overdue + c.signoffs_unsigned;
  return {
    id: "signoffs",
    title: "Policy sign-offs overdue or unsigned",
    count,
    detail:
      count === 0
        ? "All clear. Everyone has signed the current version of each policy."
        : `${c.signoffs_overdue} overdue, ${c.signoffs_unsigned} not signed yet.`,
    href: "/policies/grid",
    tone: c.signoffs_overdue > 0 ? "red" : c.signoffs_unsigned > 0 ? "amber" : "green",
  };
}

/** P2.8: red when anything is overdue, amber when only due within 30 days (PLAN.md 5.7). */
function renewalsCard(c: HomeCounters): CounterCard {
  const count = c.renewals_overdue + c.renewals_due_30;
  return {
    id: "renewals",
    title: "Renewals overdue or due in 30 days",
    count,
    detail: count === 0 ? "All clear. Nothing overdue or due within 30 days." : `${c.renewals_overdue} overdue, ${c.renewals_due_30} due within 30 days.`,
    href: "/renewals",
    tone: c.renewals_overdue > 0 ? "red" : c.renewals_due_30 > 0 ? "amber" : "green",
  };
}

/** P3.3: amber when a slot today has nobody on it, or when there is no rota today. */
function rotaTodayCard(c: HomeCounters): CounterCard {
  const filled = c.rota_today - c.rota_today_unfilled;
  return {
    id: "rota-today",
    title: "Today's rota: slots not filled",
    count: c.rota_today_unfilled,
    detail:
      c.rota_today === 0
        ? "No rota for today yet. Start this week's rota."
        : c.rota_today_unfilled === 0
          ? `All clear. All ${c.rota_today} slots today have someone on them.`
          : `${filled} of ${c.rota_today} slots filled today.`,
    href: "/rota/today",
    tone: c.rota_today === 0 || c.rota_today_unfilled > 0 ? "amber" : "green",
  };
}

/**
 * UI-4: the home page shows cards that need attention first (red, then
 * amber), and the all-clear (green) cards in a quieter row below. The order
 * within each group stays as above.
 */
export function splitCards(cards: CounterCard[]): { attention: CounterCard[]; clear: CounterCard[] } {
  const rank: Record<string, number> = { red: 0, amber: 1 };
  const attention = cards.filter((c) => c.tone === "red" || c.tone === "amber");
  attention.sort((a, b) => rank[a.tone] - rank[b.tone]);
  return { attention, clear: cards.filter((c) => !attention.includes(c)) };
}

/** The sentence under the greeting: "3 things need attention." */
export function attentionSentence(n: number): string {
  if (n === 0) return "Nothing needs attention. Everything is clear.";
  return n === 1 ? "1 thing needs attention." : `${n} things need attention.`;
}

/** "Good morning" by the clock in Dublin, whatever the computer's own clock zone. */
export function greeting(at: number): string {
  const hour = Number(new Intl.DateTimeFormat("en-IE", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Dublin" }).format(at));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/** "Sunday 15 November 2026", Dublin date. */
export function longDate(at: number): string {
  return new Intl.DateTimeFormat("en-IE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Dublin" })
    .format(at)
    .replace(",", "");
}
