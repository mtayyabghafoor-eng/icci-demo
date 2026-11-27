// History as a vertical timeline (UI-PLAN 5.4): a dot per entry, the date,
// then who did what.
import type { ReactNode } from "react";
import type { Tone } from "@/lib/items/rules";
import { cx } from "@/lib/ui/text";

const DOT: Record<Tone, string> = {
  green: "bg-[var(--icci-ok-text)]",
  amber: "bg-[var(--icci-warn-text)]",
  red: "bg-icci-error",
  grey: "bg-icci-ink-60",
};

export type TimelineEntry = { key: string; when: string; title: ReactNode; detail?: ReactNode; tone?: Tone };

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative ml-1.5 border-l-2 border-icci-panel">
      {entries.map((e) => (
        <li key={e.key} className="relative pb-6 pl-6 last:pb-0">
          <span
            aria-hidden
            className={cx("absolute -left-[7px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white", DOT[e.tone ?? "grey"])}
          />
          <p className="text-[13px] font-semibold text-icci-ink-60">{e.when}</p>
          <div dir="auto" className="mt-0.5 font-semibold">{e.title}</div>
          {e.detail && <div className="mt-0.5 text-sm text-icci-ink-60">{e.detail}</div>}
        </li>
      ))}
    </ol>
  );
}
