// Home page parts (UI-PLAN 5.2): counter cards, quick actions, initials circle.
import Link from "next/link";
import { ArrowRight, ChevronRight, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/items/rules";
import { cx, initials } from "@/lib/ui/text";

const COUNTER: Record<Tone, { badge: string; number: string; word: string }> = {
  red: { badge: "bg-[var(--icci-bad-fill)] text-icci-error", number: "text-icci-error", word: "Needs attention" },
  amber: { badge: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]", number: "text-[var(--icci-warn-text)]", word: "Check" },
  green: { badge: "bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]", number: "text-icci-green-dark", word: "All clear" },
  grey: { badge: "bg-icci-panel text-icci-green-dark", number: "text-icci-green-dark", word: "" },
};

export function CounterCard({
  href,
  icon: Icon,
  title,
  count,
  detail,
  tone,
  testId,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  count: number;
  detail?: string;
  tone: Tone;
  testId?: string;
}) {
  const t = COUNTER[tone];
  // Phone: a compact row (icon, number and words, arrow), so several cards
  // fit on one screen. From tablet width up: the full card.
  return (
    <Link
      href={href}
      data-testid={testId}
      className="group flex h-full gap-4 rounded-2xl border border-icci-line bg-white p-4 text-icci-text! no-underline shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:border-icci-gold-300 hover:shadow-raised sm:flex-col sm:gap-0 sm:p-5"
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <span className={cx("flex h-11 w-11 items-center justify-center rounded-xl", t.badge)}>
          <Icon aria-hidden size={22} strokeWidth={1.9} />
        </span>
        {t.word && <span className={cx("hidden text-[13px] font-semibold sm:inline", t.number)}>{t.word}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2.5 sm:mt-4">
          <span className={cx("text-[30px] font-bold leading-none tracking-tight sm:text-[36px] md:text-[44px]", t.number)} data-testid="count">
            {count}
          </span>
          {t.word && <span className={cx("text-[13px] font-semibold sm:hidden", t.number)}>{t.word}</span>}
        </span>
        <span className="mt-1.5 font-semibold leading-snug sm:mt-2">{title}</span>
        {detail && <span className="mt-0.5 text-sm text-icci-ink-60">{detail}</span>}
        <span className="mt-auto hidden items-center gap-1 pt-4 text-sm font-semibold text-icci-green sm:flex">
          Open the list
          <ArrowRight aria-hidden size={16} className="transition-transform duration-150 group-hover:translate-x-0.5" />
        </span>
      </div>
      <ChevronRight aria-hidden size={20} className="shrink-0 self-center text-icci-ink-60 sm:hidden" />
    </Link>
  );
}

export function QuickAction({ href, icon: Icon, label, hint }: { href: string; icon: LucideIcon; label: string; hint?: string }) {
  return (
    <Link
      href={href}
      className="group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 text-icci-text! no-underline transition-colors duration-150 hover:bg-icci-green-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-icci-gold-300 bg-icci-gold-100 text-icci-green-dark">
        <Icon aria-hidden size={20} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-icci-ink-60">{hint}</span>}
      </span>
      <ChevronRight aria-hidden size={18} className="text-icci-ink-60 transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-icci-green-dark text-sm font-bold text-white ring-2 ring-icci-gold ring-offset-2 ring-offset-transparent"
    >
      {initials(name)}
    </span>
  );
}
