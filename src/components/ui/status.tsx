// Status pill: the same colours everywhere, always with a word (PLAN.md section 4).
import type { Tone } from "@/lib/items/rules";
import { cx } from "@/lib/ui/text";

const TONE: Record<Tone, string> = {
  green: "bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]",
  amber: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]",
  red: "bg-[var(--icci-bad-fill)] text-[var(--icci-bad-text)]",
  grey: "bg-[var(--icci-none-fill)] text-[var(--icci-none-text)]",
};

export function StatusPill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-semibold leading-none",
        TONE[tone],
        className,
      )}
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
