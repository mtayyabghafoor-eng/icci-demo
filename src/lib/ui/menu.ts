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
  | "categories"
  | "whatWeOwn"
  | "companies"
  | "missing"
  | "disposals"
  | "corrections"
  | "reminders"
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
  | "lostBooks"
  | "libraryOverview"
  | "expenseSettings"
  | "expenses"
  | "newClaim"
  | "monthlyExport"
  | "boardReport"
  | "repay"
  | "accounts"
  | "auditLog"
  | "funeralRegister"
  | "shahadaRegister"
  | "nikahRegister";

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
/**
 * The library (Phase 4) is for the admins and the Library Operator, not
 * Finance. UI-9: the Library Operator's desk links. Lending is their whole job, so
 * they keep one click to each page; admins get two calm links instead and
 * reach the same pages through the "Library desk" tab bar.
 */
const OPERATOR = ["library_operator"] as const;
/** Round C5: accounts and the audit log (PLAN.md 3). */
const SUPER = ["super_admin"] as const;
/** Expense claims, the monthly file and the Board report (docs/PHASE-5.md section 5). */
const EXPENSES = ["super_admin", "centre_admin", "finance"] as const;

export const MENU: MenuGroup[] = [
  {
    title: "Overview",
    links: [
      { href: "/", label: "Home", icon: "home", roles: EVERYONE },
      { href: "/renewals", label: "Renewals", icon: "renewals", roles: ADMINS },
      // A5 (owner, 25 Nov 2026): the email reminders get their own menu line.
      { href: "/reminders", label: "Reminders", icon: "reminders", roles: ADMINS },
      // P5.6: the monthly Board report sits with the other overviews.
      { href: "/board-report", label: "Board report", icon: "boardReport", roles: EXPENSES },
    ],
  },
  {
    title: "Items and stock",
    links: [
      { href: "/items", label: "Items", icon: "items", roles: ADMINS, also: ["/l", "/labels/unknown", "/scan"] },
      { href: "/items/new", label: "Register an item", icon: "register", roles: ADMINS },
      // P1.16: next to "Register an item", as a whole room is registered from its place.
      { href: "/places", label: "Places", icon: "places", roles: ADMINS, also: ["/p"] },
      { href: "/categories", label: "Categories", icon: "categories", roles: ADMINS },
      { href: "/companies", label: "Companies", icon: "companies", roles: ADMINS, also: ["/models"] },
      { href: "/stock", label: "Stock", icon: "stock", roles: ADMINS },
      // A5: the stock queue, like "Disposals waiting" for assets.
      { href: "/stock/approvals", label: "Stock corrections waiting", icon: "corrections", roles: ADMINS },
      { href: "/stocktake", label: "Stocktake", icon: "stocktake", roles: ADMINS },
      { href: "/labels", label: "Print labels", icon: "labels", roles: ADMINS },
    ],
  },
  {
    title: "Assets",
    links: [
      { href: "/assets/overview", label: "What we own", icon: "whatWeOwn", roles: ADMINS },
      { href: "/assets", label: "Missing and damaged", icon: "missing", roles: ADMINS },
      { href: "/assets/approvals", label: "Disposals waiting", icon: "disposals", roles: ADMINS },
      { href: "/assets/not-seen", label: "Not seen in 12 months", icon: "notSeen", roles: ADMINS },
      // P5.1 (owner, 25 Nov 2026): Finance reads the register, for insurance and year-end.
      { href: "/assets/register", label: "Asset register", icon: "assetRegister", roles: [...ADMINS, "finance"] },
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
    // Phase 5 (docs/PHASE-5.md section 4).
    title: "Expenses",
    links: [
      { href: "/expenses", label: "Expenses", icon: "expenses", roles: EXPENSES },
      { href: "/expenses/new", label: "New claim", icon: "newClaim", roles: EXPENSES },
      { href: "/expenses/export", label: "Monthly export", icon: "monthlyExport", roles: EXPENSES },
      { href: "/expenses/settings", label: "Expense settings", icon: "expenseSettings", roles: ["super_admin", "finance"] },
    ],
  },
  {
    title: "Library",
    links: [
      // The operator's links come first, so the top bar names each desk page.
      { href: "/library", label: "Library", icon: "library", roles: OPERATOR },
      { href: "/library/new", label: "Add a book", icon: "addBook", roles: OPERATOR },
      { href: "/library/lend", label: "Lend", icon: "lend", roles: OPERATOR },
      { href: "/library/return", label: "Return", icon: "returnBook", roles: OPERATOR },
      { href: "/library/borrowers", label: "Borrowers", icon: "borrowers", roles: OPERATOR },
      { href: "/library/on-loan", label: "On loan", icon: "onLoan", roles: OPERATOR },
      { href: "/library/overdue", label: "Overdue", icon: "overdueBooks", roles: OPERATOR },
      { href: "/library/most-borrowed", label: "Most borrowed", icon: "mostBorrowed", roles: OPERATOR },
      { href: "/library/lost", label: "Lost and withdrawn", icon: "lostBooks", roles: OPERATOR },
      { href: "/library/overview", label: "Library overview", icon: "libraryOverview", roles: ADMINS },
      { href: "/library", label: "Library desk", icon: "library", roles: ADMINS },
    ],
  },
  {
    // Phase 6 (PLAN.md 5.6, docs/PHASE-6.md): Super Admins only.
    title: "Service registers",
    links: [
      { href: "/registers/funerals", label: "Funerals", icon: "funeralRegister", roles: SUPER },
      { href: "/registers/shahada", label: "Shahada", icon: "shahadaRegister", roles: SUPER },
      { href: "/registers/nikah", label: "Nikah", icon: "nikahRegister", roles: SUPER },
    ],
  },
  {
    // Round C5: Super Admins only.
    title: "Administration",
    links: [
      { href: "/accounts", label: "Accounts", icon: "accounts", roles: SUPER },
      { href: "/audit-log", label: "Audit log", icon: "auditLog", roles: SUPER },
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
 * /items/new is "Register an item" and /items/12 is "Items". With a role,
 * only that role's links count (an admin's /library/on-loan is "Library desk").
 */
export function activeLink(pathname: string, roleCode?: string): { link: MenuLink; group: MenuGroup } | null {
  let best: { link: MenuLink; group: MenuGroup; length: number } | null = null;
  for (const group of roleCode ? menuFor(roleCode) : MENU) {
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

/** UI-9: the group that always stays open; every other group folds on a PC and in the phone menu. */
export const FIXED_GROUP = "Overview";

/**
 * UI-9: only a long menu folds. The Library Operator has two groups; Finance
 * has a few groups of one or two links each (P5.1), which would only hide
 * them, so a menu also needs more than ten links to fold.
 */
export function foldsMenu(roleCode: string): boolean {
  const groups = menuFor(roleCode);
  return groups.length > 2 && groups.reduce((n, g) => n + g.links.length, 0) > 10;
}

/** UI-9: the group holding this page, opened by itself when the page loads. */
export function groupFor(pathname: string, roleCode: string): string | null {
  return activeLink(pathname, roleCode)?.group.title ?? null;
}

/** May this role open labels with the Scan button (items, or library books)? */
export function mayScan(roleCode: string): boolean {
  return menuFor(roleCode).some((g) => g.links.some((l) => l.href === "/items" || l.href === "/library"));
}

/** Pages that are not in the menu but still need a name in the top bar. */
const OTHER_PAGES: Record<string, string> = { "/scan": "Open a label", "/style": "Style sample", "/search": "Search" };

/**
 * What the top bar calls this page: "Items and stock › Stock". A5: with a
 * role, by that role's own menu (an admin's /library/on-loan is "Library desk").
 */
export function whereAmI(pathname: string, roleCode?: string): { group?: string; page: string } | null {
  if (OTHER_PAGES[pathname]) return { page: OTHER_PAGES[pathname] };
  const hit = activeLink(pathname, roleCode) ?? activeLink(pathname);
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
  // P5.2: Finance's own shortcuts (it has no items or people): the claims,
  // a new claim in the middle, and who is waiting to be paid back.
  if (!can("/items") && !can("/library") && can("/expenses")) {
    bar.push({ href: "/expenses", label: "Expenses", icon: "expenses" });
    bar.push({ href: "/expenses/new", label: "New claim", icon: "newClaim", raised: true });
    bar.push({ href: "/expenses?tab=repay", label: "To repay", icon: "repay" });
  }
  return bar;
}
