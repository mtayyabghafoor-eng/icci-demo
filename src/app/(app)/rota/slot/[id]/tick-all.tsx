"use client";
// D5: "Tick all empty days" on "Also put them on", so a whole week is two
// taps instead of seven. It only ticks the boxes; nothing is saved until
// the usual button is pressed.
import { CheckCheck } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function TickAll() {
  return (
    <button
      type="button"
      className={buttonClass("ghost")}
      onClick={(e) => {
        const form = e.currentTarget.closest("form");
        form?.querySelectorAll<HTMLInputElement>('input[name="slots"]').forEach((box) => (box.checked = true));
      }}
    >
      <CheckCheck aria-hidden size={18} />
      Tick all empty days
    </button>
  );
}
