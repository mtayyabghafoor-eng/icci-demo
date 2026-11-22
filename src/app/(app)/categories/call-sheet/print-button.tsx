"use client";
// Opens the browser's print window for the call sheet.
import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary")}>
      <Printer aria-hidden size={18} />
      Print
    </button>
  );
}
