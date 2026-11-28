// A5 (owner, 25 Nov 2026): Back returns to the list you came from, with your
// search, filters and page kept, and names it ("Back to Garda vetting").
//
// How: each time a list below is shown, its address is remembered for this
// browser tab only (see ListMemory). A page's Back button normally goes one
// level up (its own address). If the remembered list is one that leads to
// this kind of page, Back goes there instead. Opening Home, Scan or another
// menu page forgets it, so an old list never comes back by surprise.
// Only the app's own list addresses are ever used.

/** The lists Back may return to, with the name the button says. */
export const BACK_LISTS: Record<string, string> = {
  "/items": "Items",
  "/stock": "Low stock",
  "/stock/approvals": "Stock corrections waiting",
  "/assets": "Missing and damaged",
  "/assets/overview": "What we own",
  "/assets/approvals": "Disposals waiting",
  "/assets/not-seen": "Not seen in 12 months",
  "/assets/register": "Asset register",
  "/people": "People",
  "/people/vetting": "Garda vetting",
  "/people/training": "Training",
  "/policies": "Policies",
  "/policies/grid": "Policy grid",
  "/renewals": "Renewals",
  "/vehicles": "Vehicles",
  "/tickets": "Tickets",
  "/library": "Library",
  "/library/overview": "Library overview",
  "/library/on-loan": "On loan",
  "/library/overdue": "Overdue",
  "/library/lost": "Lost and withdrawn",
  "/library/most-borrowed": "Most borrowed",
  "/library/borrowers": "Borrowers",
  "/registers/funerals": "Funeral register",
  "/registers/shahada": "Shahada register",
  "/registers/nikah": "Nikah register",
};

/** For a Back button's own address: the lists that lead to that kind of page. */
const STAND_INS: Record<string, string[]> = {
  "/items": ["/items", "/stock", "/stock/approvals", "/assets", "/assets/overview", "/assets/approvals", "/assets/not-seen", "/assets/register"],
  "/people": ["/people", "/people/vetting", "/people/training", "/policies/grid"],
  "/policies": ["/policies", "/policies/grid"],
  "/renewals": ["/renewals"],
  "/vehicles": ["/vehicles", "/renewals"],
  "/tickets": ["/tickets"],
  "/registers/funerals": ["/registers/funerals"],
  "/registers/shahada": ["/registers/shahada"],
  "/registers/nikah": ["/registers/nikah"],
  "/library": ["/library", "/library/overview", "/library/on-loan", "/library/overdue", "/library/lost", "/library/most-borrowed"],
  "/library/borrowers": ["/library/borrowers", "/library/overview", "/library/on-loan", "/library/overdue"],
};

/** The browser tab's memory key. */
export const BACK_MEMORY_KEY = "icci:last-list";

/** A safe address of one of the lists above ("/people/vetting?status=due"), or null. */
export function listAddress(address: string | null | undefined): { path: string; address: string } | null {
  if (!address || !address.startsWith("/") || address.startsWith("//") || address.includes("\\")) return null;
  const path = address.split(/[?#]/)[0];
  if (!(path in BACK_LISTS)) return null;
  return { path, address: address.split("#")[0] };
}

/** What to do with the memory when this page opens: remember it, forget it, or keep it. */
export function memoryAction(pathname: string, menuPages: readonly string[]): "remember" | "forget" | "keep" {
  if (pathname in BACK_LISTS) return "remember";
  if (pathname === "/" || pathname === "/scan" || menuPages.includes(pathname)) return "forget";
  return "keep";
}

/**
 * Where Back goes and what it says. `own` is the page's own address and name;
 * `remembered` is the list kept for this tab. The page's own list with a
 * remembered search keeps the page's own name.
 */
export function backTarget(own: { href: string; name: string }, remembered: string | null, here = ""): { href: string; name: string } {
  const hit = listAddress(remembered);
  // Never back to the page you are on (a list page with a Back of its own, e.g. the policy grid).
  if (!hit || hit.path === here || !STAND_INS[own.href]?.includes(hit.path)) return own;
  return { href: hit.address, name: hit.path === own.href ? own.name : BACK_LISTS[hit.path] };
}
