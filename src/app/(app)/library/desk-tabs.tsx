"use client";
// UI-9: the "Library desk" tab bar at the top of every library desk page.
// Admins have only two Library links in the menu (overview and desk), so
// these tabs give one click to each desk page. The Library Operator sees
// them too, which helps on a phone, where the menu is behind a button.
// On a phone the bar scrolls sideways.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/ui/text";

export const DESK_TABS = [
  { href: "/library", label: "Catalog" },
  { href: "/library/new", label: "Add a book" },
  { href: "/library/lend", label: "Lend" },
  { href: "/library/return", label: "Return" },
  { href: "/library/borrowers", label: "Borrowers" },
  { href: "/library/on-loan", label: "On loan" },
  { href: "/library/overdue", label: "Overdue" },
  { href: "/library/most-borrowed", label: "Most borrowed" },
  { href: "/library/lost", label: "Lost and withdrawn" },
] as const;

/** The tab for this page: the catalog also covers a book's and a copy's own pages. */
export function deskTab(pathname: string): string | null {
  if (pathname === "/library" || pathname.startsWith("/library/books/") || pathname.startsWith("/library/copies/")) return "/library";
  const hit = DESK_TABS.find((t) => t.href !== "/library" && (pathname === t.href || pathname.startsWith(`${t.href}/`)));
  return hit?.href ?? null;
}

export function DeskTabs() {
  const current = deskTab(usePathname());
  return (
    <nav aria-label="Library desk" className="-mx-4 mb-5 overflow-x-auto px-4 print:hidden md:mx-0 md:px-0">
      <ul className="flex w-max gap-1 rounded-2xl border border-icci-line bg-white p-1 shadow-card">
        {DESK_TABS.map((t) => {
          const active = t.href === current;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-11 items-center whitespace-nowrap rounded-xl px-3.5 text-[14px] font-semibold no-underline transition-colors duration-150",
                  active ? "bg-icci-green-dark text-white!" : "text-icci-ink-60! hover:bg-icci-green-50 hover:text-icci-green-dark!",
                )}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
