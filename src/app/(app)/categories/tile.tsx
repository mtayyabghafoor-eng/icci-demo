// One category as a tile with its picture (P1.17 follow-up and P1.18): used
// by the Categories screen and by "What we own", so both look the same.
// Opening a main category's tile shows its sub-categories.
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import type { CategoryCount } from "@/lib/categories/counts";
import { CategoryBadge } from "./category-icon";
import { StatusBadge } from "@/components/ui";

export function CategoryTile({
  href,
  icon,
  name,
  active = true,
  children,
}: {
  href: string;
  icon: string | null | undefined;
  name: string;
  active?: boolean;
  children?: ReactNode;
}) {
  return (
    <Link
      href={href}
      data-testid="category-tile"
      className="group flex h-full items-start gap-3.5 rounded-2xl border border-icci-line bg-white p-4 text-icci-text no-underline shadow-card transition-colors duration-150 hover:border-icci-green/60"
    >
      <CategoryBadge icon={icon} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span dir="auto" className="text-[17px] leading-snug font-bold text-icci-green-dark">{name}</span>
          {!active && <StatusBadge word="Switched off" tone="grey" />}
        </span>
        {children && <span className="mt-1.5 block text-sm text-icci-ink-60">{children}</span>}
      </span>
      <ChevronRight aria-hidden size={20} className="mt-2.5 shrink-0 text-icci-ink-60 group-hover:text-icci-green" />
    </Link>
  );
}

/** "12 assets · 9 working · 2 not working · 1 missing · 1 open ticket", always words beside numbers. */
export function CountLine({ count }: { count: CategoryCount }) {
  const parts: ReactNode[] = [];
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  if (count.total > 0) {
    parts.push(<span key="t">{plural(count.total, "asset", "assets")}</span>);
    parts.push(
      <span key="w" className="text-[var(--icci-ok-text)]">
        {count.working} working
      </span>,
    );
    if (count.not_working) parts.push(<span key="n" className="font-semibold text-icci-error">{count.not_working} not working</span>);
    if (count.missing) parts.push(<span key="m" className="font-semibold text-icci-error">{count.missing} missing</span>);
    if (count.with_open_tickets) parts.push(<span key="o">{plural(count.with_open_tickets, "open ticket", "open tickets")}</span>);
  }
  if (count.stock_lines > 0) {
    parts.push(<span key="s">{plural(count.stock_lines, "stock line", "stock lines")}</span>);
    if (count.stock_low) parts.push(<span key="l" className="font-semibold text-[var(--icci-warn-text)]">{count.stock_low} low</span>);
    if (count.stock_out) parts.push(<span key="x" className="font-semibold text-icci-error">{count.stock_out} out</span>);
  }
  if (parts.length === 0) return <>Nothing recorded yet</>;
  return (
    <>
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 && " · "}
          {p}
        </span>
      ))}
    </>
  );
}
