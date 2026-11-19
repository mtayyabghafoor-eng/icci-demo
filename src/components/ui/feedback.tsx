// Messages, empty lists and loading placeholders (UI-PLAN 5.3).
import { CircleAlert, CircleCheck, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/text";

type NoticeTone = "success" | "info" | "warning" | "error";

const NOTICE: Record<NoticeTone, { icon: LucideIcon; box: string; role?: "alert" | "status" }> = {
  success: { icon: CircleCheck, box: "border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] text-[var(--icci-ok-text)]", role: "status" },
  info: { icon: Info, box: "border-icci-panel bg-icci-green-50 text-icci-green-dark", role: "status" },
  warning: { icon: TriangleAlert, box: "border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] text-[var(--icci-warn-text)]" },
  error: { icon: CircleAlert, box: "border-icci-error/30 bg-[var(--icci-bad-fill)] text-icci-error", role: "alert" },
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
  testId,
}: {
  tone?: NoticeTone;
  title?: string;
  children?: ReactNode;
  /** Overrides how screen readers announce it (errors are "alert" by default). */
  role?: "alert" | "status";
  testId?: string;
}) {
  const n = NOTICE[tone];
  const Icon = n.icon;
  return (
    <div role={role ?? n.role} data-testid={testId} className={cx("flex gap-3 rounded-xl border px-4 py-3", n.box)}>
      <Icon aria-hidden size={20} className="mt-0.5 shrink-0" />
      <div className="text-[15px] leading-relaxed">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={cx(title && "mt-0.5", "text-icci-text")}>{children}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }: { icon: LucideIcon; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-icci-gold-300 bg-white px-6 py-12 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-icci-gold-100 text-icci-green-dark">
        <Icon aria-hidden size={26} strokeWidth={1.75} />
      </span>
      <p className="mt-4 text-lg font-bold">{title}</p>
      {children && <p className="mt-1 max-w-md text-icci-ink-60">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Grey bars in the shape of what is loading, never a lone "Loading…". */
export function Skeleton({ lines = 3, label = "Loading" }: { lines?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
      {/* Read out by screen readers; also how the browser tests know a page is still loading. */}
      <span className="sr-only">{label}…</span>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-xl bg-icci-panel" style={{ width: `${100 - (i % 3) * 12}%` }} />
      ))}
    </div>
  );
}
