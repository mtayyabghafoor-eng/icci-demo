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

/**
 * A5: where "For you to approve" goes. One queue waiting: straight to it.
 * Several: each queue is listed in the card. None: not a link at all.
 */
export function approvalLinks(
  c: Pick<HomeCounters, "corrections_for_me" | "disposals_for_me" | "stocktake_diffs_for_me">,
  stocktakeHref = "/stocktake",
  expensesForMe = 0,
): { href?: string; links: { href: string; label: string }[] } {
  const queues = [
    // P5.3: expense claims waiting for this admin.
    { n: expensesForMe, href: "/expenses", label: plural(expensesForMe, "expense claim", "expense claims") },
    { n: c.corrections_for_me, href: "/stock/approvals", label: plural(c.corrections_for_me, "stock correction", "stock corrections") },
    { n: c.disposals_for_me, href: "/assets/approvals", label: plural(c.disposals_for_me, "disposal", "disposals") },
    { n: c.stocktake_diffs_for_me, href: stocktakeHref, label: plural(c.stocktake_diffs_for_me, "stocktake difference", "stocktake differences") },
  ].filter((q) => q.n > 0);
  if (queues.length === 0) return { links: [] };
  if (queues.length === 1) return { href: queues[0].href, links: [] };
  return { links: queues.map((q) => ({ href: q.href, label: q.label })) };
}

/** A5: the stocktakes waiting for this admin, newest first: open the one, or the list (waiting ones come first there). */
export function stocktakeLink(waitingIds: number[]): string {
  return waitingIds.length === 1 ? `/stocktake/${waitingIds[0]}` : "/stocktake";
}

/**
 * `notCounted`: consumables never counted (UI-9), named on the Low stock card.
 * A5: `stocktakeHref` opens the stocktake waiting for this admin (worked out by the page).
 */
export function counterCards(c: HomeCounters, notCounted = 0, stocktakeHref = "/stocktake"): CounterCard[] {
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
      href: stocktakeHref,
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
    href: count > 0 ? "/people/vetting?status=attention" : "/people/vetting",
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
    href: count > 0 ? "/policies/grid?status=attention" : "/policies/grid",
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
    href: count > 0 ? "/renewals?show=soon" : "/renewals",
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
 * A5 (owner, 25 Nov 2026): people and safety first, then stock and assets,
 * then the approval queues. Cards not named here keep their place at the end.
 */
export const ATTENTION_ORDER = [
  "vetting",
  "signoffs",
  "renewals",
  "tickets",
  "rota-today",
  "library-overdue",
  "low-stock",
  "missing-damaged",
  "corrections-for-me",
  "disposals-for-me",
  "stocktake-for-me",
  // P5.3: expense claims, after the other approval queues.
  "expenses-for-me",
  "awaiting-repayment",
];

/**
 * UI-4: the home page shows cards that need attention first (red, then
 * amber), and the all-clear (green) cards in a quieter row below. Within a
 * colour, A5's fixed order.
 */
export function splitCards(cards: CounterCard[]): { attention: CounterCard[]; clear: CounterCard[] } {
  const rank: Record<string, number> = { red: 0, amber: 1 };
  const place = (id: string) => {
    const i = ATTENTION_ORDER.indexOf(id);
    return i < 0 ? ATTENTION_ORDER.length : i;
  };
  const attention = cards.filter((c) => c.tone === "red" || c.tone === "amber");
  attention.sort((a, b) => rank[a.tone] - rank[b.tone] || place(a.id) - place(b.id));
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

// ---------------------------------------------------------------------------
// P5.3: expense claims (public.expense_counters, migration 0050).
export type ExpenseCounters = { for_me: number; waiting: number; owed_people: number; owed_cents: number; linked: boolean };

/** "Expenses for you to approve" (red when any) and "Awaiting repayment" (amber when anyone is owed). */
export function expenseCards(e: ExpenseCounters, euro: (cents: number) => string): CounterCard[] {
  return [
    {
      id: "expenses-for-me",
      title: "Expense claims for you to approve",
      count: e.for_me,
      detail: !e.linked
        ? "Your account is not linked to People yet, so you cannot approve claims."
        : e.for_me === 0
          ? "All clear. Nothing waiting for you."
          : "Entered and paid by someone else.",
      href: "/expenses",
      tone: e.for_me > 0 ? "red" : "green",
    },
    {
      id: "awaiting-repayment",
      title: "Awaiting repayment",
      count: e.owed_people,
      detail: e.owed_people === 0 ? "All clear. Nobody is waiting to be paid back." : `${euro(e.owed_cents)} owed to ${plural(e.owed_people, "person", "people")}.`,
      href: "/expenses?tab=repay",
      tone: e.owed_people > 0 ? "amber" : "green",
    },
  ];
}
