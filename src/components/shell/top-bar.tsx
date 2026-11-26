"use client";
// The slim bar above every signed-in page (docs/UI-PLAN.md 4.1 and 4.3).
// PC and tablet: where you are, and a box to open a label by its number.
// Phone: the small logo, the page name and Sign out.
// UI-9: inner pages put a "← Back" button in the slot before the page name
// (BackLink); on a phone it takes the place of the logo.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ChevronRight, LogOut } from "lucide-react";
import { Logo } from "@/components/ui";
import { BACK_SLOT_ID } from "@/components/ui/back-link";
import { whereAmI } from "@/lib/ui/menu";

export function TopBar({ canOpenLabels, roleCode, signOut }: { canOpenLabels: boolean; roleCode: string; signOut: () => Promise<void> }) {
  const here = whereAmI(usePathname(), roleCode);
  return (
    <header className="sticky top-0 z-20 border-b border-icci-line bg-white/92 backdrop-blur print:hidden">
      <div className="flex min-h-14 items-center gap-3 px-4 md:min-h-16 md:px-8">
        <Link href="/" className="top-bar-logo shrink-0 md:hidden" aria-label="Home">
          <Logo size={36} />
        </Link>
        <span id={BACK_SLOT_ID} className="contents" />
        <p className="min-w-0 flex-1 truncate text-[15px]" data-testid="where-am-i">
          {here?.group && (
            <span className="hidden text-icci-ink-60 md:inline">
              {here.group}
              <ChevronRight aria-hidden size={14} className="mx-1 inline align-[-2px] opacity-60" />
            </span>
          )}
          <span className="font-semibold text-icci-green-dark">{here?.page ?? "ICCI Control Dashboard"}</span>
        </p>

        {canOpenLabels && (
          <form action="/l" method="get" role="search" aria-label="Open a label" className="hidden items-center md:flex">
            <label htmlFor="top-label-number" className="sr-only">
              Open a label by its number
            </label>
            <input
              id="top-label-number"
              name="number"
              required
              placeholder="Open label ICCI-000123"
              className="h-10 w-56 rounded-l-xl border border-r-0 border-icci-field bg-white px-3 font-mono text-sm placeholder:font-sans placeholder:text-icci-ink-60/70 focus:border-icci-green"
            />
            <button
              type="submit"
              aria-label="Go to this label"
              className="flex h-10 w-11 items-center justify-center rounded-r-xl bg-icci-green-dark text-white hover:bg-icci-green-900"
            >
              <ArrowRight aria-hidden size={18} />
            </button>
          </form>
        )}

        <form action={signOut} className="md:hidden">
          <button
            type="submit"
            className="flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-icci-green hover:bg-icci-green-50"
          >
            <LogOut aria-hidden size={18} />
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
