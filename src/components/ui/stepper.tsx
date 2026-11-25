"use client";
// A number box with big minus and plus buttons (docs/UI-PLAN.md 5.6), for
// counting on a phone. The box can still be typed into. The box comes first
// in the page so the label around it names the box, not a button; the minus
// button is only drawn to its left.
import { Minus, Plus } from "lucide-react";
import { useRef, type ComponentProps } from "react";
import { cx } from "@/lib/ui/text";

const BUTTON =
  "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#87948f] bg-white text-icci-green-dark transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 active:bg-icci-panel";

export function Stepper({
  min = 0,
  what,
  className,
  ...input
}: Omit<ComponentProps<"input">, "type" | "min"> & {
  min?: number;
  /** Named in the buttons for screen readers, e.g. "Test hand soap". */
  what?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  const change = (by: number) => {
    const box = ref.current;
    if (!box) return;
    const now = box.value === "" ? null : Number(box.value);
    // An empty box: plus starts at 1 (or the minimum), minus at the minimum.
    const next = now === null || !Number.isFinite(now) ? Math.max(min, by > 0 ? 1 : min) : Math.max(min, Math.round(now) + by);
    box.value = String(next);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <span className="flex items-center gap-2">
      <input
        ref={ref}
        type="number"
        inputMode="numeric"
        min={min}
        step={1}
        className={cx(
          "order-2 h-12 w-24 rounded-xl border border-[#87948f] bg-white px-2 text-center font-mono text-2xl font-semibold transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green",
          className,
        )}
        {...input}
      />
      <button type="button" onClick={() => change(-1)} aria-label={what ? `One less ${what}` : "One less"} className={cx("order-1", BUTTON)}>
        <Minus aria-hidden size={22} />
      </button>
      <button type="button" onClick={() => change(1)} aria-label={what ? `One more ${what}` : "One more"} className={cx("order-3", BUTTON)}>
        <Plus aria-hidden size={22} />
      </button>
    </span>
  );
}
