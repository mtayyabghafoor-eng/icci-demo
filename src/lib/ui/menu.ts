// The app's menu (docs/UI-PLAN.md section 4): one list, grouped by module,
// used by the PC sidebar, the tablet rail, the phone menu sheet and the
// phone bottom bar. Each link says which roles see it. Hiding a link is a
// convenience only: every page and the database check the role again.

export type IconKey =
  | "home"
  | "items"
  | "register"
  | "stock"
  | "stocktake"
  | "labels"
  | "places"
  | "missing"
  | "notSeen"
  | "assetRegister"
  | "people"
  | "vetting"
  | "training"
  | "policies"
  | "policyGrid"
  | "vehicles"
  | "renewals"
  | "rotaWeek"
  | "prayerTimes"
  | "slotTypes"
  | "rotaTemplates"
  | "tickets"
  | "reportProblem"
  | "scan"
  | "library"
  | "addBook"
  | "lend"
  | "returnBook"
  | "borrowers"
  | "onLoan"
  | "overdueBooks"
  | "mostBorrowed"
  | "lostBooks";

export type MenuLink = {
  href: string;
  label: string;
  icon: IconKey;
  roles: readonly string[];
  /** Other pages that belong to this link (e.g. a scanned label belongs to Items). */
  also?: readonly string[];
};

export type MenuGroup = { title: string; links: MenuLink[] };

const EVERYONE = ["super_admin", "centre_admin", "finance", "library_operator"] as const;
const ADMINS = ["super_admin", "centre_admin"] as const;
/** The library (Phase 4): the admins and the Library Operator, not Finance. */
const LIBRARY = ["super_admin", "centre_admin", "library_operator"] as const;

export const MENU: MenuGroup[] = [
  {
    title: "Overview",
    links: [
      { href: "/", label: "Home", icon: "home", roles: EVERYONE },
      { href: "/renewals", label: "Renewals", icon: "renewals", roles: ADMINS },
    ],
  },
  {
    title: "Items and stock",
    links: [
      { href: "/items", label: "Items", icon: "items", roles: ADMINS, also: ["/l", "/labels/unknown", "/scan"] },
      { href: "/items/new", label: "Register an item", icon: "register", roles: ADMINS },
      { href: "/stock", label: "Stock", icon: "stock", roles: ADMINS },
      { href: "/stocktake", label: "Stocktake", icon: "stocktake", roles: ADMINS },
      { href: "/labels", label: "Print labels", icon: "labels", roles: ADMINS },
      { href: "/places", label: "Places", icon: "places", roles: ADMINS, also: ["/p"] },
    ],
  },
  {
    title: "Assets",
    links: [
      { href: "/assets", label: "Missing and damaged", icon: "missing", roles: ADMINS },
      { href: "/assets/not-seen", label: "Not seen in 12 months", icon: "notSeen", roles: ADMINS },
      { href: "/assets/register", label: "Asset register", icon: "assetRegister", roles: ADMINS },
      { href: "/vehicles", label: "Vehicles", icon: "vehicles", roles: ADMINS },
    ],
  },
  {
    title: "People",
    links: [
      { href: "/people", label: "People", icon: "people", roles: ADMINS },
      { href: "/people/vetting", label: "Garda vetting", icon: "vetting", roles: ADMINS },
      { href: "/people/training", label: "Training", icon: "training", roles: ADMINS },
      { href: "/policies", label: "Policies", icon: "policies", roles: ADMINS },
      { href: "/policies/grid", label: "Policy grid", icon: "policyGrid", roles: ADMINS },
    ],
  },
  {
    title: "Rota",
    links: [
      { href: "/rota", label: "Rota week", icon: "rotaWeek", roles: ADMINS },
      { href: "/rota/prayer-times", label: "Prayer times", icon: "prayerTimes", roles: ADMINS },
      { href: "/rota/templates", label: "Templates", icon: "rotaTemplates", roles: ADMINS },
      { href: "/rota/slot-types", label: "Slot types", icon: "slotTypes", roles: ADMINS },
    ],
  },
  {
    title: "Maintenance",
    links: [
      { href: "/tickets", label: "Tickets", icon: "tickets", roles: ADMINS },
      { href: "/tickets/new", label: "Report a problem", icon: "reportProblem", roles: ADMINS },
    ],
  },
  {
    title: "Library",
    links: [
      { href: "/library", label: "Library", icon: "library", roles: LIBRARY },
      { href: "/library/new", label: "Add a book", icon: "addBook", roles: LIBRARY },
      { href: "/library/lend", label: "Lend", icon: "lend", roles: LIBRARY },
      { href: "/library/return", label: "Return", icon: "returnBook", roles: LIBRARY },
      { href: "/library/borrowers", label: "Borrowers", icon: "borrowers", roles: LIBRARY },
      { href: "/library/on-loan", label: "On loan", icon: "onLoan", roles: LIBRARY },
      { href: "/library/overdue", label: "Overdue", icon: "overdueBooks", roles: LIBRARY },
      { href: "/library/most-borrowed", label: "Most borrowed", icon: "mostBorrowed", roles: LIBRARY },
      { href: "/library/lost", label: "Lost and withdrawn", icon: "lostBooks", roles: LIBRARY },
    ],
  },
];

/** The groups and links this role sees; empty groups are left out. */
export function menuFor(roleCode: string): MenuGroup[] {
  return MENU.map((g) => ({ ...g, links: g.links.filter((l) => l.roles.includes(roleCode)) })).filter((g) => g.links.length > 0);
}

function matches(prefix: string, pathname: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The menu link for this page: the longest matching address wins, so
 * /items/new is "Register an item" and /items/12 is "Items".
 */
export function activeLink(pathname: string): { link: MenuLink; group: MenuGroup } | null {
  let best: { link: MenuLink; group: MenuGroup; length: number } | null = null;
  for (const group of MENU) {
    for (const link of group.links) {
      for (const prefix of [link.href, ...(link.also ?? [])]) {
        if (matches(prefix, pathname) && (!best || prefix.length > best.length)) {
          best = { link, group, length: prefix.length };
        }
      }
    }
  }
  return best && { link: best.link, group: best.group };
}

/** May this role open labels with the Scan button (items, or library books)? */
export function mayScan(roleCode: string): boolean {
  return menuFor(roleCode).some((g) => g.links.some((l) => l.href === "/items" || l.href === "/library"));
}

/** Pages that are not in the menu but still need a name in the top bar. */
const OTHER_PAGES: Record<string, string> = { "/scan": "Open a label", "/style": "Style sample" };

/** What the top bar calls this page: "Items and stock › Stock". */
export function whereAmI(pathname: string): { group?: string; page: string } | null {
  if (OTHER_PAGES[pathname]) return { page: OTHER_PAGES[pathname] };
  const hit = activeLink(pathname);
  if (!hit) return null;
  if (hit.link.href === "/") return { page: "Home" };
  // "People › People" says nothing twice: show the page alone.
  return hit.group.title === hit.link.label ? { page: hit.link.label } : { group: hit.group.title, page: hit.link.label };
}

export type BarLink = { href: string; label: string; icon: IconKey; raised?: boolean };

/** The phone bottom bar: four shortcuts this role can use; the Menu button is added by the bar itself. */
export function bottomBarFor(roleCode: string): BarLink[] {
  const can = (href: string) => MENU.some((g) => g.links.some((l) => l.href === href && l.roles.includes(roleCode)));
  const bar: BarLink[] = [{ href: "/", label: "Home", icon: "home" }];
  if (can("/items")) bar.push({ href: "/items", label: "Items", icon: "items" });
  // The Library Operator: the library in the place of Items.
  else if (can("/library")) bar.push({ href: "/library", label: "Library", icon: "library" });
  if (can("/items") || can("/library")) bar.push({ href: "/scan", label: "Scan", icon: "scan", raised: true });
  if (can("/people")) bar.push({ href: "/people", label: "People", icon: "people" });
  return bar;
}
