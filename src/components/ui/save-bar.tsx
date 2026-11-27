// E4 (owner, 27 Nov 2026: "a Save bar on every form that records or edits").
// One place for a form's Save and Cancel. On a phone it stays in view just
// above the bottom bar while the form scrolls (globals.css, .save-bar), Save
// takes the width and Cancel sits beside it; the Scan circle never covers
// it. On a PC it is the ordinary row of buttons at the end of the form.
// Put the form's own Save button(s) inside; give cancelHref for Cancel.
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/ui/text";

export function SaveBar({
  children,
  cancelHref,
  cancelLabel = "Cancel",
  className,
}: {
  children: ReactNode;
  cancelHref?: string;
  cancelLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx("save-bar", className)} data-testid="save-bar">
      {children}
      {cancelHref && (
        <Link href={cancelHref} className="save-bar-cancel inline-flex min-h-11 items-center justify-center rounded-[10px] px-3 font-semibold text-icci-green! no-underline hover:bg-icci-green-50">
          {cancelLabel}
        </Link>
      )}
    </div>
  );
}
