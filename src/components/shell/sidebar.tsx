// PC sidebar and tablet rail (docs/UI-PLAN.md 4.1 and 4.2). Hidden on
// phones, where the bottom bar and menu sheet take over. Never printed.
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/ui";
import { MenuLinks } from "./menu-links";
import { RailToggle } from "./rail-toggle";

export function Sidebar({ roleCode, account }: { roleCode: string; account: ReactNode }) {
  return (
    <aside
      data-testid="sidebar"
      className="icci-pattern group/rail fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col transition-[width] duration-200 data-[open=true]:w-[264px] data-[open=true]:shadow-raised bg-gradient-to-b from-icci-green-dark to-icci-green-900 text-white shadow-[4px_0_24px_rgb(0_0_0_/_0.08)] md:flex lg:w-[264px] print:hidden"
    >
      <Link href="/" className="flex items-center justify-center gap-3 px-3 pb-4 pt-6 lg:pb-5 text-white! no-underline lg:justify-start lg:px-6" aria-label="ICCI Control Dashboard, home">
        <span className="lg:hidden">
          <Logo size={44} priority />
        </span>
        <span className="hidden lg:block">
          <Logo size={56} priority />
        </span>
        <span className="hidden leading-tight lg:block">
          <span className="page-title block text-[26px] text-white!">ICCI</span>
          <span className="block text-[13px] text-[#e9e1cf]">Control Dashboard</span>
        </span>
      </Link>
      <RailToggle />
      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 lg:px-4">
        <MenuLinks roleCode={roleCode} compact />
      </nav>
      <div className="border-t border-white/10 px-3 py-4 lg:px-4">{account}</div>
    </aside>
  );
}
