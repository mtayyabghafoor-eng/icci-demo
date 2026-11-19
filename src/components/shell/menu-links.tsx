"use client";
// The grouped menu links, shared by the PC sidebar, the tablet rail and the
// phone menu sheet. On the tablet rail (`compact`) only the icons show; the
// words stay readable by screen readers and appear as a tooltip.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeLink, menuFor } from "@/lib/ui/menu";
import { cx } from "@/lib/ui/text";
import { MENU_ICONS } from "./icons";

export function MenuLinks({ roleCode, compact = false, onNavigate }: { roleCode: string; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeLink(pathname)?.link.href;
  // On the rail, words are hidden on tablets and shown from PC width up.
  const word = compact ? "sr-only lg:not-sr-only" : "";
  return (
    <div className="flex flex-col gap-5">
      {menuFor(roleCode).map((group) => (
        <div key={group.title}>
          <p className={cx("px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#d9c9a3]", compact && "hidden lg:block")}>
            {group.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {group.links.map((l) => {
              const Icon = MENU_ICONS[l.icon];
              const active = l.href === current;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={compact ? l.label : undefined}
                    className={cx(
                      "relative flex min-h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium no-underline transition-colors duration-150",
                      compact && "justify-center lg:justify-start",
                      active
                        ? "bg-white/12 text-white! before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-icci-gold"
                        : "text-white/78! hover:bg-white/6 hover:text-white!",
                    )}
                  >
                    <Icon aria-hidden size={19} strokeWidth={1.9} className={cx("shrink-0", active ? "text-icci-gold" : "")} />
                    <span className={word}>{l.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
