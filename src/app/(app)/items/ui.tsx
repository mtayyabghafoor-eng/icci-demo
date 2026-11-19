// Small building blocks shared by the item screens.
import Link from "next/link";
import { buttonClass } from "@/components/ui";
import { CONDITION_STATUS, type Condition, type Tone } from "@/lib/items/rules";
import { STOCK_STATUS, type StockStatus } from "@/lib/stock/rules";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]",
  amber: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]",
  red: "bg-[var(--icci-bad-fill)] text-[var(--icci-bad-text)]",
  grey: "bg-[var(--icci-none-fill)] text-[var(--icci-none-text)]",
};

/** A colour with a word beside it, always (PLAN.md section 4). Same look as StatusPill. */
export function StatusBadge({ word, tone }: { word: string; tone: Tone }) {
  return (
    <span
      data-testid="status"
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
    <Link href={href} className={buttonClass("primary")}>
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonClass("outline")}>
      {children}
    </Link>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3">
      {children}
    </p>
  );
}
