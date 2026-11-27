// Home page parts (UI-PLAN 5.2): counter cards, quick actions, initials circle.
import Link from "next/link";
import { ArrowRight, ChevronRight, CircleCheck, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/items/rules";
import { cx, initials } from "@/lib/ui/text";

const COUNTER: Record<Tone, { badge: string; number: string; word: string }> = {
  red: { badge: "bg-[var(--icci-bad-fill)] text-icci-error", number: "text-icci-error", word: "Urgent" },
  amber: { badge: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]", number: "text-[var(--icci-warn-text)]", word: "To do" },
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

/*
  UI-9: the calmer Home (mockup 4 in the owner's review). Four headline
  numbers, then one slim row per thing that needs attention, the all-clear
  counters as small green chips, and four large action tiles.
*/

export type HeadlineTone = "neutral" | "amber" | "red" | "gold";

const HEADLINE: Record<HeadlineTone, { card: string; badge: string; number: string }> = {
  neutral: { card: "border-icci-panel bg-icci-green-50", badge: "bg-white text-icci-green-dark", number: "text-icci-green-dark" },
  amber: { card: "border-[#efdcb5] bg-[var(--icci-warn-fill)]", badge: "bg-white text-[var(--icci-warn-text)]", number: "text-[var(--icci-warn-text)]" },
  red: { card: "border-[#f2c9c4] bg-[var(--icci-bad-fill)]", badge: "bg-white text-icci-error", number: "text-icci-error" },
  gold: { card: "border-icci-gold-300 bg-icci-gold-100", badge: "bg-white text-icci-green-dark", number: "text-icci-green-dark" },
};

export function HeadlineCard({
  href,
  icon: Icon,
  label,
  count,
  tone,
  testId,
  links,
}: {
  /** A5: without an address the card is not a link (e.g. nothing to approve). */
  href?: string;
  icon: LucideIcon;
  label: string;
  count: number;
  tone: HeadlineTone;
  testId?: string;
  /** A5: several places to go (e.g. two approval queues): listed in the card instead. */
  links?: { href: string; label: string }[];
}) {
  const t = HEADLINE[tone];
  const body = (
    <>
      <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm sm:h-12 sm:w-12", t.badge)}>
        <Icon aria-hidden size={24} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 sm:flex-1">
        <span className={cx("block text-[30px] font-bold leading-none tracking-tight md:text-[36px]", t.number)} data-testid="headline-count">
          {count}
        </span>
        <span className="mt-1.5 block text-[15px] font-semibold leading-snug">{label}</span>
        {links && links.length > 0 && (
          <span className="mt-2 flex flex-col gap-1" data-testid="headline-links">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold">
                {l.label}
                <ArrowRight aria-hidden size={14} />
              </Link>
            ))}
          </span>
        )}
      </span>
    </>
  );
  const shape = "flex h-full flex-col items-start gap-3 rounded-2xl border p-4 text-icci-text! no-underline shadow-card sm:flex-row sm:items-center sm:gap-4 md:p-5";
  if (!href) {
    return (
      <div data-testid={testId} className={cx(shape, links && links.length > 0 && "sm:items-start", t.card)}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} data-testid={testId} className={cx(shape, "group transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised", t.card)}>
      {body}
      <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/80 text-icci-green-dark transition-transform duration-200 group-hover:translate-x-0.5 sm:flex xl:hidden 2xl:flex">
        <ArrowRight aria-hidden size={17} />
      </span>
    </Link>
  );
}

const ROW: Record<Tone, { badge: string; pill: string }> = {
  red: { badge: "bg-[var(--icci-bad-fill)] text-icci-error", pill: "bg-[var(--icci-bad-fill)] text-icci-error" },
  amber: { badge: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]", pill: "bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]" },
  green: { badge: "bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]", pill: "bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]" },
  grey: { badge: "bg-icci-panel text-icci-green-dark", pill: "bg-icci-panel text-icci-green-dark" },
};

/** One slim "needs attention" row: icon, what and why, the count with its word, and an arrow. */
export function AttentionRow({
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
  const t = ROW[tone];
  return (
    <Link
      href={href}
      data-testid={testId}
      data-tone={tone}
      className="group flex min-h-16 items-center gap-3 px-4 py-3 text-icci-text! no-underline transition-colors duration-150 hover:bg-icci-green-50 md:gap-4 md:px-5"
    >
      {/* D1: a calm green icon on every row; the colour and its word sit only in the pill. */}
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-icci-green-50 text-icci-green-dark">
        <Icon aria-hidden size={20} strokeWidth={1.9} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {detail && <span className="block text-sm text-icci-ink-60">{detail}</span>}
      </span>
      <span className={cx("inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold", t.pill)} data-badge>
        <span data-testid="count">{count}</span>
        <span className="hidden font-semibold sm:inline">{COUNTER[tone].word}</span>
        <span className="sr-only sm:hidden">{COUNTER[tone].word}</span>
      </span>
      <ChevronRight aria-hidden size={18} className="shrink-0 text-icci-ink-60 transition-transform duration-150 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** An all-clear counter as a small green chip that still opens its list. */
export function ClearChip({ href, title, count, testId }: { href: string; title: string; count: number; testId?: string }) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-[var(--icci-ok-text)]/20 bg-[var(--icci-ok-fill)] px-3 text-[13px] font-semibold text-[var(--icci-ok-text)]! no-underline transition-colors duration-150 hover:border-[var(--icci-ok-text)]/50"
    >
      <CircleCheck aria-hidden size={14} />
      {title}
      <span className="sr-only">
        : <span data-testid="count">{count}</span>, all clear
      </span>
    </Link>
  );
}

/** A large action tile; the first on Home is filled green. */
export function ActionTile({ href, icon: Icon, label, hint, primary = false }: { href: string; icon: LucideIcon; label: string; hint?: string; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={cx(
        "group flex min-h-[7.5rem] flex-col justify-between gap-3 rounded-2xl border p-4 no-underline transition-all duration-200 hover:-translate-y-0.5 hover:shadow-raised",
        primary
          ? "border-icci-green-dark bg-icci-green-dark text-white! shadow-card"
          : "border-icci-line bg-white text-icci-text! shadow-card hover:border-icci-gold-300",
      )}
    >
      <span
        className={cx(
          "flex h-11 w-11 items-center justify-center rounded-xl",
          primary ? "bg-white/12 text-white" : "border border-icci-gold-300 bg-icci-gold-100 text-icci-green-dark",
        )}
      >
        <Icon aria-hidden size={22} strokeWidth={1.9} />
      </span>
      <span>
        <span className="block font-semibold leading-snug">{label}</span>
        {hint && <span className={cx("mt-0.5 block text-[13px] leading-snug", primary ? "text-white/80" : "text-icci-ink-60")}>{hint}</span>}
      </span>
    </Link>
  );
}

/**
 * D1: plain facts in one slim white strip (never a number the Needs
 * attention list also shows), each opening its list.
 */
export function GlanceStrip({ facts }: { facts: Array<{ href: string; icon: LucideIcon; label: string; count: number; testId?: string }> }) {
  return (
    <ul
      aria-label="At a glance"
      className="mt-5 grid grid-cols-3 divide-x divide-icci-line overflow-hidden rounded-2xl border border-icci-line bg-white shadow-card"
    >
      {facts.map((f) => (
        <li key={f.label}>
          <Link
            href={f.href}
            data-testid={f.testId}
            className="group flex h-full flex-col items-start gap-1 px-3 py-3.5 text-icci-text! no-underline transition-colors duration-150 hover:bg-icci-green-50 sm:flex-row sm:items-center sm:gap-3 sm:px-5 sm:py-4"
          >
            <f.icon aria-hidden size={20} strokeWidth={1.9} className="hidden shrink-0 text-icci-gold sm:block" />
            <span className="text-[24px] font-bold leading-none tracking-tight text-icci-green-dark sm:text-[28px]" data-testid="headline-count">
              {f.count}
            </span>
            <span className="text-sm font-semibold leading-snug text-icci-ink-60">{f.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * D1: "For you to approve" in its own box: each queue with its number, or
 * one calm line when nothing waits. Approvals are jobs, never alarms.
 */
export function ApprovalsBox({ total, queues, testId }: { total: number; queues: Array<{ href: string; label: string; count: number }>; testId?: string }) {
  return (
    <section aria-labelledby="approve-title" data-testid={testId} className="rounded-2xl border border-icci-gold-300 bg-icci-gold-100 p-4 shadow-card md:p-5">
      <div className="flex items-center gap-3">
        <span aria-hidden className="h-6 w-1 rounded-full bg-icci-gold" />
        <h2 id="approve-title" className="text-lg font-bold text-icci-green-dark">
          For you to approve
        </h2>
        <span className="ml-auto text-[26px] font-bold leading-none text-icci-green-dark" data-testid="headline-count">
          {total}
        </span>
      </div>
      {queues.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-[15px] text-[var(--icci-ok-text)]">
          <CircleCheck aria-hidden size={18} />
          Nothing is waiting for you.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1" data-testid="headline-links">
          {queues.map((q) => (
            <li key={q.href + q.label}>
              <Link
                href={q.href}
                className="group flex min-h-11 items-center gap-3 rounded-xl bg-white/70 px-3 font-semibold text-icci-green-dark! no-underline transition-colors duration-150 hover:bg-white"
              >
                <span className="min-w-8 text-right font-mono text-base">{q.count}</span>
                <span className="flex-1">{q.label}</span>
                <ChevronRight aria-hidden size={18} className="text-icci-ink-60 transition-transform duration-150 group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
