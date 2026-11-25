"use client";
// UI-9: "← Back" in the top bar, next to "where am I". A page says where
// its Back goes (always the page one level up, never the browser history),
// so Back never leaves the app or reopens a form that was just sent. The
// button is drawn into the top bar's slot; on a phone it takes the place of
// the small logo.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BACK_MEMORY_KEY, backTarget, memoryAction } from "@/lib/ui/back";
import { MENU } from "@/lib/ui/menu";

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

function readMemory(): string | null {
  try {
    return window.sessionStorage.getItem(BACK_MEMORY_KEY);
  } catch {
    return null;
  }
}

const MENU_PAGES = MENU.flatMap((g) => g.links.map((l) => l.href));

/**
 * A5: remembers the last list shown in this browser tab (address with its
 * search), so a Back button further in can return to it. Drawn once, by the
 * signed-in layout. Nothing is sent anywhere.
 */
export function ListMemory() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    try {
      const act = memoryAction(pathname, MENU_PAGES);
      if (act === "remember") window.sessionStorage.setItem(BACK_MEMORY_KEY, search ? `${pathname}?${search}` : pathname);
      else if (act === "forget") window.sessionStorage.removeItem(BACK_MEMORY_KEY);
    } catch {
      // No memory in this browser (private window): Back simply goes one level up.
    }
  }, [pathname, search]);
  return null;
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [remembered, setRemembered] = useState<string | null>(null);
  const here = usePathname();
  useEffect(() => {
    // The top bar is drawn by the layout, before the page; find its slot once running.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById(BACK_SLOT_ID));
    setRemembered(readMemory());
    // Next.js keeps a page you left alive but hidden (cacheComponents), and
    // runs this tidy-up then: take the button out of the top bar with it.
    return () => setSlot(null);
  }, []);
  if (!slot) return null;
  const target = backTarget({ href, name: plainText(children) }, remembered, here);
  const name = backName(target.name);
  return createPortal(
    <Link
      href={target.href}
      data-testid="back-button"
      className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-icci-line bg-white px-3 text-sm font-semibold text-icci-green-dark! no-underline shadow-card transition-colors duration-150 hover:border-icci-gold-300 hover:bg-icci-green-50"
    >
      <ArrowLeft aria-hidden size={17} strokeWidth={2.2} />
      Back
      {/* Where it goes: said in full from tablet width up (A5), heard by screen readers on a phone.
          A text, not a label, so it never matches a form field's name. */}
      <span className="sr-only md:not-sr-only md:max-w-[16rem] md:truncate">{name.replace(/^Back/, "")}</span>
    </Link>,
    slot,
  );
}
