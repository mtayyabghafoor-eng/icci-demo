"use client";
// Phone only (docs/UI-PLAN.md 5.3): the drop-down filters of a list fold
// away behind "More filters", so the list itself is on the first screen.
// The search box and the Search button stay visible. The button counts the
// drop-downs already in use. On a PC everything is always shown.
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function FilterFold() {
  const ref = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    form.setAttribute("data-folded", open ? "false" : "true");
    setActive(Array.from(form.querySelectorAll("select")).filter((s) => s.value !== "").length);
  }, [open]);

  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 font-semibold text-icci-green transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 md:hidden"
    >
      <SlidersHorizontal aria-hidden size={18} />
      {open ? "Fewer filters" : active > 0 ? `More filters (${active} in use)` : "More filters"}
    </button>
  );
}
