// How an item leaves the Centre (slice P1.14, owner's answers of 19 Nov
// 2026). Plain rules for the screens; the database checks the same itself
// (migration 0040). A sale is a record only: no accounting.
import { formatDate, formatEuro, parseEuro } from "@/lib/items/rules";
import { isDate, todayInDublin } from "@/lib/vetting/rules";

export const DISPOSAL_ROUTES = ["charity", "sold", "recycled", "shredded", "thrown_away", "religious_texts", "returned_to_owner"] as const;
export type DisposalRoute = (typeof DISPOSAL_ROUTES)[number];

export const ROUTE_LABEL: Record<DisposalRoute, string> = {
  charity: "Given to charity",
  sold: "Sold",
  recycled: "Recycled",
  shredded: "Shredded",
  thrown_away: "Thrown away",
  religious_texts: "Respectful disposal of religious texts",
  returned_to_owner: "Returned to owner",
};

export function isDisposalRoute(v: string): v is DisposalRoute {
  return (DISPOSAL_ROUTES as readonly string[]).includes(v);
}

/** The words for a route on screen; disposals before P1.14 have none. */
export function routeLabel(route: string | null | undefined): string {
  return route && isDisposalRoute(route) ? ROUTE_LABEL[route] : "Route not recorded";
}

export type DisposalFields = {
  disposal_route: DisposalRoute;
  disposal_recipient?: string;
  sale_price_cents?: number;
  sale_buyer?: string;
  sale_date?: string;
  sale_money_taken_by?: string;
};

type Result = { ok: true; values: DisposalFields } | { ok: false; error: string };

function name(raw: string, missing: string): { ok: true; value: string } | { ok: false; error: string } {
  const v = raw.trim();
  if (!v) return { ok: false, error: missing };
  if (v.length > 200) return { ok: false, error: "That name is too long (200 characters at most)." };
  return { ok: true, value: v };
}

/** Checks the route part of the "Dispose" form. Only the fields the route needs are kept. */
export function parseDisposalFields(get: (field: string) => string, today: string = todayInDublin()): Result {
  const route = get("disposal_route").trim();
  if (!isDisposalRoute(route)) return { ok: false, error: "Choose how the item is leaving." };

  if (route === "charity" || route === "returned_to_owner") {
    const who = name(get("disposal_recipient"), route === "charity" ? "Enter the name of the charity." : "Enter the owner's name.");
    if (!who.ok) return who;
    return { ok: true, values: { disposal_route: route, disposal_recipient: who.value } };
  }
  if (route === "sold") {
    const cents = parseEuro(get("sale_price"));
    if (cents === null || cents === undefined) return { ok: false, error: "Enter the price in euros, for example 25 or 12.50." };
    const buyer = name(get("sale_buyer"), "Enter the buyer's name.");
    if (!buyer.ok) return buyer;
    const date = get("sale_date").trim();
    if (!isDate(date)) return { ok: false, error: "Enter the date of the sale." };
    if (date > today) return { ok: false, error: "The date of the sale cannot be in the future." };
    const took = name(get("sale_money_taken_by"), "Say who took the money.");
    if (!took.ok) return took;
    return {
      ok: true,
      values: { disposal_route: route, sale_price_cents: cents, sale_buyer: buyer.value, sale_date: date, sale_money_taken_by: took.value },
    };
  }
  return { ok: true, values: { disposal_route: route } };
}

export type DisposalDetails = {
  disposal_route: string | null;
  disposal_recipient: string | null;
  sale_price_cents: number | null;
  sale_buyer: string | null;
  sale_date: string | null;
  sale_money_taken_by: string | null;
};

/** One line for the history and the approvals list, e.g. "Sold: €25.00 to Test Buyer on 3 Nov 2026; money taken by Test Treasurer". */
export function describeDisposal(d: DisposalDetails): string {
  const label = routeLabel(d.disposal_route);
  if (d.disposal_route === "sold") {
    return `${label}: ${formatEuro(d.sale_price_cents)} to ${d.sale_buyer} on ${formatDate(d.sale_date)}; money taken by ${d.sale_money_taken_by}`;
  }
  if ((d.disposal_route === "charity" || d.disposal_route === "returned_to_owner") && d.disposal_recipient) {
    return `${label}: ${d.disposal_recipient}`;
  }
  return label;
}

export const DISPOSAL_COLUMNS = "disposal_route, disposal_recipient, sale_price_cents, sale_buyer, sale_date, sale_money_taken_by";
