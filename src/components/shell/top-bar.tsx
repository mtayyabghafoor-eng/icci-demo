"use client";
// The slim bar above every signed-in page (docs/UI-PLAN.md 4.1 and 4.3).
// PC and tablet: where you are, and (D8) one search box for everything,
// which also opens a typed label number.
// Phone: the small logo, the page name and a search button. D1: Sign out
// lives in the Menu only, so a slip of the thumb never ends the session.
// UI-9: inner pages put a "← Back" button in the slot before the page name
// (BackLink); on a phone it takes the place of the logo.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Search } from "lucide-react";
import { Logo } from "@/components/ui";
import { BACK_SLOT_ID } from "@/components/ui/back-link";
import { searchHint } from "@/lib/search/hint";
import { whereAmI } from "@/lib/ui/menu";
import { GlobalSearch } from "./global-search";

export function TopBar({ canSearch, roleCode }: { canSearch: boolean; roleCode: string }) {
  const here = whereAmI(usePathname(), roleCode);
  return (
    <header className="sticky top-0 z-20 border-b border-icci-line bg-white/92 backdrop-blur print:hidden">
      <div className="flex min-h-14 items-center gap-3 px-4 md:min-h-16 md:px-8">
        <Link href="/" className="top-bar-logo flex h-11 w-11 shrink-0 items-center justify-center md:hidden" aria-label="Home">
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

        {canSearch && (
          <>
            <div className="hidden md:block">
              <GlobalSearch placeholder={searchHint(roleCode)} slashKey />
            </div>
            {/* Phone: the search page, one tap away. */}
            <Link
              href="/search"
              aria-label="Search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-icci-green-dark hover:bg-icci-green-50 md:hidden"
            >
              <Search aria-hidden size={22} />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
