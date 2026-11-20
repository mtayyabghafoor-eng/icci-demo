"use client";
// UI-9: "← Back" in the top bar, next to "where am I". A page says where
// its Back goes (always the page one level up, never the browser history),
// so Back never leaves the app or reopens a form that was just sent. The
// button is drawn into the top bar's slot; on a phone it takes the place of
// the small logo.
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The id of the empty place in the top bar that Back fills. */
export const BACK_SLOT_ID = "top-bar-back";

function plainText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(plainText).join("");
  return "";
}

/** "Missing and damaged" → "Back to Missing and damaged"; "Back to the item" stays as it is. */
export function backName(where: string): string {
  const w = where.replace(/^\s*←\s*/, "").trim();
  return /^back to /i.test(w) ? w.charAt(0).toUpperCase() + w.slice(1) : `Back to ${w}`;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The top bar is drawn by the layout, before the page; find its slot once running.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById(BACK_SLOT_ID));
    // Next.js keeps a page you left alive but hidden (cacheComponents), and
    // runs this tidy-up then: take the button out of the top bar with it.
    return () => setSlot(null);
  }, []);
  if (!slot) return null;
  const name = backName(plainText(children));
  return createPortal(
    <Link
      href={href}
      data-testid="back-button"
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-icci-line bg-white px-3 text-sm font-semibold text-icci-green-dark! no-underline shadow-card transition-colors duration-150 hover:border-icci-gold-300 hover:bg-icci-green-50"
    >
      <ArrowLeft aria-hidden size={17} strokeWidth={2.2} />
      Back
      {/* Screen readers hear where it goes; a hidden text, not a label, so it never matches a form field's name. */}
      <span className="sr-only">{name.replace(/^Back/, "")}</span>
    </Link>,
    slot,
  );
}
