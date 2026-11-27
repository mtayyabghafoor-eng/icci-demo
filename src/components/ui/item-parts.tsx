// Round C1: small parts first made for the item screens (the old
// src/app/(app)/items/ui.tsx), now shared by every screen from here.
import Link from "next/link";
import { CONDITION_STATUS, type Condition, type Tone } from "@/lib/items/rules";
import { STOCK_STATUS, type StockStatus } from "@/lib/stock/rules";
import { buttonClass } from "./button";
import { Notice } from "./feedback";
import { ForgetDone } from "./toast";

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

/**
 * An item's stock (consumables) or condition (fixed assets). E2: a list that
 * mixes both says which it is ("Stock: Low", "Condition: Damaged").
 */
export function ItemStatus({ kind, condition, stock, labelled = false, testId }: { kind: string; condition: string | null; stock?: StockStatus; labelled?: boolean; testId?: string }) {
  if (kind === "consumable") {
    const s = STOCK_STATUS[stock ?? "not_counted"];
    return <StatusBadge word={labelled ? `Stock: ${s.word}` : s.word} tone={s.tone} testId={testId} />;
  }
  const s = CONDITION_STATUS[(condition ?? "good") as Condition];
  return <StatusBadge word={labelled ? `Condition: ${s.word}` : s.word} tone={s.tone} testId={testId} />;
}

/** The look of every form box (the same as the shared Input and Select). */
export const fieldClass =
  "mt-1.5 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";

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

/**
 * A message on a page (slice A1): green and fading for a success, red and
 * staying for a refusal. Pass the tone from messageTone() when the words
 * come from a "?done=" list. In the page, it keeps its gap above, and a
 * success also tidies the address so a reload does not show it again.
 */
export function PageNotice({
  children,
  floating = false,
  testId,
  tone = "success",
}: {
  children: React.ReactNode;
  floating?: boolean;
  testId?: string;
  tone?: "success" | "error";
}) {
  const box = (
    <Notice tone={tone} floating={floating} testId={testId}>
      {children}
    </Notice>
  );
  if (floating && tone === "success") return box;
  return (
    <div className="mt-4">
      {box}
      {tone === "success" && <ForgetDone />}
    </div>
  );
}
