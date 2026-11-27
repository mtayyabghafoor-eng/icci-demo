"use client";
// D2: on a tablet the sidebar is a narrow rail of icons. Touch screens have
// no hover, so the icons' names never showed (UI-PLAN 4.2 promised this
// button). "Open the menu" widens the rail over the page with every word;
// it closes on the next page, on Escape, or on a tap outside it.
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function RailToggle() {
  const ref = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  // Open only on the page where it was opened: moving to another page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean | ((was: boolean) => boolean)) =>
    setOpenOn((was) => ((typeof value === "function" ? value(was === pathname) : value) ? pathname : null));

  useEffect(() => {
    const rail = ref.current?.closest("aside");
    if (!rail) return;
    rail.setAttribute("data-open", open ? "true" : "false");
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    const tap = (e: PointerEvent) => !rail.contains(e.target as Node) && setOpenOn(null);
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", tap);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", tap);
    };
  }, [open]);

  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      aria-label={open ? "Close the menu" : "Open the menu"}
      data-testid="rail-toggle"
      className="mx-3 mb-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/20 px-3 text-[15px] font-semibold text-white transition-colors duration-150 hover:border-icci-gold hover:bg-white/8 lg:hidden"
    >
      <Icon aria-hidden size={20} strokeWidth={1.9} />
      <span className="hidden group-data-[open=true]/rail:inline">Close the menu</span>
    </button>
  );
}
