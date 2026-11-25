// Small building blocks shared by the item screens.
import Link from "next/link";
import { buttonClass, ForgetDone, Notice as SharedNotice } from "@/components/ui";
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
  "mt-1.5 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";

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
 * The old item-screen message box, now the shared one (slice A1): green and
 * fading for a success, red and staying for a refusal. Pass the tone from
 * messageTone() when the words come from a "?done=" list.
 */
export function Notice({
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
    <SharedNotice tone={tone} floating={floating} testId={testId}>
      {children}
    </SharedNotice>
  );
  if (floating && tone === "success") return box;
  // A message in the page (not floating, or a refusal that stays) keeps its gap
  // above. A saved message in the page also tidies the address, so a reload
  // does not show it again.
  return (
    <div className="mt-4">
      {box}
      {tone === "success" && <ForgetDone />}
    </div>
  );
}
