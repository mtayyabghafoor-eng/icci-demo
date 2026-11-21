// Each number on "What we own" and a category page opens the Items list
// with exactly those items (slice P1.18): all, working, not working,
// missing, or with a maintenance ticket not yet closed.
import Link from "next/link";
import type { CategoryCount } from "@/lib/categories/counts";

export function itemsHref(category: string, extra: Record<string, string | null | undefined> = {}): string {
  const p = new URLSearchParams({ category });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return `/items?${p.toString()}`;
}

export function CountLinks({ count, category, place }: { count: CategoryCount; category: string; place?: string | null }) {
  if (count.total === 0 && count.stock_lines === 0) return null;
  const at = { location: place ?? null };
  const links: [string, string, number][] = [
    ["See all", itemsHref(category, at), count.total + count.stock_lines],
    ["Working", itemsHref(category, { ...at, condition: "working" }), count.working],
    ["Not working", itemsHref(category, { ...at, condition: "damaged" }), count.not_working],
    ["Missing", itemsHref(category, { ...at, condition: "missing" }), count.missing],
    ["With an open ticket", itemsHref(category, { ...at, tickets: "open" }), count.with_open_tickets],
  ];
  return (
    <p className="mt-3 flex flex-wrap gap-2" data-testid="count-links">
      {links
        .filter(([label, , n]) => label === "See all" || n > 0)
        .map(([label, href, n]) => (
          <Link
            key={label}
            href={href}
            className="inline-flex min-h-10 items-center rounded-full border border-icci-line bg-icci-panel px-3.5 py-1 text-sm font-semibold text-icci-green no-underline hover:border-icci-green/60"
          >
            {label} ({n})
          </Link>
        ))}
    </p>
  );
}
