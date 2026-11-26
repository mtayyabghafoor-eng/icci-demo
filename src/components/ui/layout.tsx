// Page structure: cards, page header with breadcrumb, and a grid of facts
// (UI-PLAN 5.3 and 5.4).
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/text";

export function Card({
  children,
  className,
  tone = "white",
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  tone?: "white" | "panel" | "gold";
  padded?: boolean;
}) {
  const fill = {
    white: "bg-white border-icci-line",
    panel: "bg-icci-green-50 border-icci-panel",
    gold: "bg-icci-gold-100 border-icci-gold-300",
  }[tone];
  return <section className={cx("rounded-2xl border shadow-card", fill, padded && "p-5 md:p-6", className)}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold text-icci-green-dark">{children}</h2>
      {action}
    </div>
  );
}

export type Crumb = { href?: string; label: string };

export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-icci-ink-60">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden size={14} className="opacity-60" />}
            {c.href ? (
              <Link href={c.href} className="font-medium text-icci-green no-underline hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page">{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  crumbs,
  subtitle,
  status,
  actions,
}: {
  title: ReactNode;
  crumbs?: Crumb[];
  subtitle?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-3 md:mb-8">
      {crumbs && crumbs.length > 0 && <Breadcrumb items={crumbs} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="page-title text-[26px] md:text-[34px]">{title}</h1>
          {subtitle && <p className="mt-1.5 text-icci-ink-60">{subtitle}</p>}
          {status && <div className="mt-3">{status}</div>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Facts as label-over-value in two columns (one on a phone). */
export function FactGrid({ facts }: { facts: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {facts.map((f) => (
        <div key={f.label}>
          <dt className="text-[13px] font-semibold uppercase tracking-wide text-icci-ink-60">{f.label}</dt>
          <dd className="mt-1 text-base">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
