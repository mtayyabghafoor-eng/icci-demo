"use client";
// Phone bottom bar and menu sheet (docs/UI-PLAN.md 4.3). Four shortcuts the
// role can use, with Scan raised in the middle, and Menu, which opens every
// link in the same groups as the PC sidebar. Hidden from tablet width up.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Logo } from "@/components/ui";
import { activeLink, bottomBarFor } from "@/lib/ui/menu";
import { cx } from "@/lib/ui/text";
import { MENU_ICONS } from "./icons";
import { MenuLinks } from "./menu-links";

export function BottomBar({ roleCode, account }: { roleCode: string; account: ReactNode }) {
  const pathname = usePathname();
  const current = activeLink(pathname)?.link.href;
  const sheet = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  // The sheet is a real dialog: Escape closes it and focus stays inside.
  useEffect(() => {
    const d = sheet.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const shortcuts = bottomBarFor(roleCode);

  return (
    <>
      <nav
        aria-label="Shortcuts"
        data-testid="bottom-bar"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-icci-line bg-white/96 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-end justify-around px-2">
          {shortcuts.map((s) => {
            const Icon = MENU_ICONS[s.icon];
            const active = s.raised ? pathname === s.href : s.href === current && pathname !== "/scan";
            return (
              <li key={s.href} className="flex-1">
                <Link
                  href={s.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "flex min-h-16 flex-col items-center justify-end gap-1 pb-2 text-xs font-semibold no-underline",
                    active ? "text-icci-green-dark!" : "text-icci-ink-60!",
                  )}
                >
                  {s.raised ? (
                    <span className="-mt-5 flex h-14 w-14 items-center justify-center rounded-full bg-icci-green-dark text-white shadow-raised ring-4 ring-white outline-2 outline-icci-gold">
                      <Icon aria-hidden size={26} strokeWidth={1.9} />
                    </span>
                  ) : (
                    <span className={cx("flex h-8 w-12 items-center justify-center rounded-full", active && "bg-icci-panel")}>
                      <Icon aria-hidden size={22} strokeWidth={1.9} />
                    </span>
                  )}
                  {s.label}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-haspopup="dialog"
              className="flex min-h-16 w-full flex-col items-center justify-end gap-1 pb-2 text-xs font-semibold text-icci-ink-60"
            >
              <span className="flex h-8 w-12 items-center justify-center rounded-full">
                <Menu aria-hidden size={22} strokeWidth={1.9} />
              </span>
              Menu
            </button>
          </li>
        </ul>
      </nav>

      <dialog
        ref={sheet}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A tap on the dimmed area outside the sheet closes it.
          if (e.target === e.currentTarget) setOpen(false);
        }}
        className="icci-pattern m-0 ml-auto h-dvh max-h-dvh w-[86vw] max-w-sm bg-gradient-to-b from-icci-green-dark to-icci-green-900 p-0 text-white backdrop:bg-icci-green-900/60 backdrop:backdrop-blur-[2px]"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 pb-4 pt-5">
            <Logo size={44} />
            <span className="page-title flex-1 text-[24px] text-white!">ICCI</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close the menu"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-white hover:bg-white/10"
            >
              <X aria-hidden size={22} />
            </button>
          </div>
          <nav aria-label="Main" className="flex-1 overflow-y-auto px-4 pb-4">
            <MenuLinks roleCode={roleCode} onNavigate={() => setOpen(false)} />
          </nav>
          <div className="border-t border-white/10 px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{account}</div>
        </div>
      </dialog>
    </>
  );
}
