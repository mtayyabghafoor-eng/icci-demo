// Small building blocks shared by the item screens.
import Link from "next/link";
import { buttonClass, Toast } from "@/components/ui";
import { cx } from "@/lib/ui/text";
import { CONDITION_STATUS, type Condition, type Tone } from "@/lib/items/rules";
import { STOCK_STATUS, type StockStatus } from "@/lib/stock/rules";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]",
  amber: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]",
  red: "bg-[var(--icci-bad-fill)] text-[var(--icci-bad-text)]",
  grey: "bg-[var(--icci-none-fill)] text-[var(--icci-none-text)]",
};

/** A colour with a word beside it, always (PLAN.md section 4). Same look as StatusPill. */
export function StatusBadge({ word, tone, testId = "status" }: { word: string; tone: Tone; testId?: string }) {
  return (
    <span
      data-testid={testId}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] leading-none font-semibold ${TONE_CLASS[tone]}`}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {word}
    </span>
  );
}

export function ItemStatus({ kind, condition, stock }: { kind: string; condition: string | null; stock?: StockStatus }) {
  if (kind === "consumable") {
    const s = STOCK_STATUS[stock ?? "not_counted"];
    return <StatusBadge word={s.word} tone={s.tone} />;
  }
  const s = CONDITION_STATUS[(condition ?? "good") as Condition];
  return <StatusBadge word={s.word} tone={s.tone} />;
}

export const fieldClass =
  "mt-1.5 block min-h-11 w-full rounded-xl border border-[#c9d3cf] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";

export function PrimaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass("primary", "md", "max-md:min-h-12")}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass("outline", "md", "max-md:min-h-12")}>
      {children}
    </Link>
  );
}

export function Notice({ children, floating = false, testId }: { children: React.ReactNode; floating?: boolean; testId?: string }) {
  const box = (
    <p
      role="status"
      data-testid={testId}
      className={cx(
        "rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3",
        floating ? "pr-12 shadow-raised" : "mt-4",
      )}
    >
      {children}
    </p>
  );
  // UI-9: "saved" messages float over the page for a few seconds.
  return floating ? <Toast>{box}</Toast> : box;
}
