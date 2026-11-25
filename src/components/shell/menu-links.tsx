"use client";
// The grouped menu links, shared by the PC sidebar, the tablet rail and the
// phone menu sheet. On the tablet rail (`compact`) only the icons show; the
// words stay readable by screen readers and appear as a tooltip.
//
// UI-9: on a PC and in the phone menu the groups fold. "Overview" always
// stays open; the group of the current page opens by itself; any group
// you open stays open while this browser tab is open. Roles with a short
// menu (Library Operator, Finance) never fold, and the tablet rail always
// shows every icon.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { activeLink, FIXED_GROUP, foldsMenu, groupFor, menuFor } from "@/lib/ui/menu";
import { cx } from "@/lib/ui/text";
import { MENU_ICONS } from "./icons";

const KEPT_OPEN = "icci-menu-open";

function keptOpen(): string[] {
  try {
    const raw = sessionStorage.getItem(KEPT_OPEN);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function keepOpen(titles: string[]) {
  try {
    sessionStorage.setItem(KEPT_OPEN, JSON.stringify(titles));
  } catch {
    // Private windows may refuse; the menu still works, it just forgets.
  }
}

export function MenuLinks({ roleCode, compact = false, onNavigate }: { roleCode: string; compact?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeLink(pathname, roleCode)?.link.href;
  const here = groupFor(pathname, roleCode);
  const folds = foldsMenu(roleCode);
  // The server draws only the current group open; groups opened earlier in
  // this tab are added once the page is running.
  const [open, setOpen] = useState<string[]>(() => (here ? [here] : []));
  useEffect(() => {
    // Reading this tab's memory needs the browser, after the first draw.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen((was) => [...new Set([...was, ...keptOpen(), ...(here ? [here] : [])])]);
  }, [here]);

  function toggle(title: string) {
    setOpen((was) => {
      const next = was.includes(title) ? was.filter((t) => t !== title) : [...was, title];
      keepOpen(next);
      return next;
    });
  }

  // On the rail, words are hidden on tablets and shown from PC width up.
  const word = compact ? "sr-only lg:not-sr-only" : "";
  return (
    <div className={cx("flex flex-col", folds ? "gap-1.5" : "gap-5")}>
      {menuFor(roleCode).map((group, i) => {
        const foldable = folds && group.title !== FIXED_GROUP;
        const isOpen = !foldable || open.includes(group.title);
        const bodyId = `menu-group-${group.title.toLowerCase().replace(/\W+/g, "-")}${compact ? "-rail" : ""}`;
        return (
          <div
            key={group.title}
            data-testid={compact && i > 0 ? "rail-divider" : undefined}
            // A5: on the tablet rail (icons only) a thin line between groups keeps the icons grouped.
            className={cx(foldable && "pt-1", compact && i > 0 && "max-lg:mt-1 max-lg:border-t max-lg:border-white/15 max-lg:pt-2")}
          >
            {foldable ? (
              <button
                type="button"
                onClick={() => toggle(group.title)}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                className={cx(
                  "menu-group-title group flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[11px] font-bold uppercase tracking-[0.14em] text-[#d9c9a3] transition-colors duration-150 hover:bg-white/6 hover:text-[#efe5cc]",
                  compact && "hidden lg:flex",
                )}
              >
                {group.title}
                <ChevronDown
                  aria-hidden
                  size={16}
                  strokeWidth={2.2}
                  className={cx("shrink-0 opacity-80 transition-transform duration-200 ease-out", isOpen ? "rotate-180" : "rotate-0")}
                />
              </button>
            ) : (
              <p className={cx("px-3 pb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#d9c9a3]", compact && "hidden lg:block")}>
                {group.title}
              </p>
            )}
            <div
              id={bodyId}
              className="menu-fold"
              data-open={isOpen ? "true" : "false"}
              data-rail={compact ? "true" : undefined}
            >
              <div>
                <ul className="flex flex-col gap-0.5">
                  {group.links.map((l) => {
                    const Icon = MENU_ICONS[l.icon];
                    const active = l.href === current;
                    return (
                      <li key={`${l.href}-${l.label}`}>
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
            </div>
          </div>
        );
      })}
    </div>
  );
}
