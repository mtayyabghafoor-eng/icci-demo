"use client";
// Slice A1 (docs/UI-PLAN.md 5.5): a dangerous action asks once more. The
// red outline button opens a small sheet that says in plain words what will
// happen, with "Cancel" and the real button. Put it inside the form in place
// of the submit button: the sheet's button submits that same form, with its
// name and value. A sheet at the bottom of a phone screen, a box in the
// middle of a PC screen. Uses the browser's own dialog: Escape or a tap
// outside closes it, and the keyboard stays inside while it is open.
import { CircleHelp, TriangleAlert } from "lucide-react";
import { useId, useRef, type ReactNode } from "react";
import { cx } from "@/lib/ui/text";
import { buttonClass, type ButtonKind } from "./button";

export function ConfirmSubmit({
  label,
  title,
  children,
  confirmLabel,
  name,
  value,
  disabled,
  kind = "danger",
  className,
  testId,
}: {
  /** The button on the page, e.g. "Publish". */
  label: ReactNode;
  /** The sheet's question, e.g. "Publish version 3?" */
  title: string;
  /** What will happen, in plain words. */
  children: ReactNode;
  /** The sheet's button, e.g. "Yes, publish". */
  confirmLabel: string;
  name?: string;
  value?: string;
  disabled?: boolean;
  /** The page button's look: red outline unless said otherwise (a main step forward stays green). */
  kind?: ButtonKind;
  className?: string;
  testId?: string;
}) {
  const sheet = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // Red for something taken away (withdraw, remove, unlink); green for a
  // step forward that cannot be taken back (publish, approve).
  const danger = kind === "danger";
  const Icon = danger ? TriangleAlert : CircleHelp;
  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        onClick={() => sheet.current?.showModal()}
        className={buttonClass(kind, "md", className)}
        data-testid={testId}
      >
        {label}
      </button>
      <dialog
        ref={sheet}
        aria-labelledby={titleId}
        data-testid="confirm-sheet"
        onClick={(e) => {
          // A tap on the dimmed area outside the box closes it.
          if (e.target === e.currentTarget) sheet.current?.close();
        }}
        className={cx(
          "confirm-sheet w-full max-w-none bg-transparent p-0 text-icci-text backdrop:bg-icci-green-900/50 backdrop:backdrop-blur-[2px]",
          "m-0 mt-auto md:m-auto md:max-w-md",
        )}
      >
        <div className="rounded-t-2xl border border-icci-line bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-raised md:rounded-2xl md:pb-5">
          <div className="flex gap-3">
            <Icon aria-hidden size={24} className={cx("mt-0.5 shrink-0", danger ? "text-icci-error" : "text-icci-green")} />
            <div>
              <h2 id={titleId} className="text-lg font-bold text-icci-green-dark">
                {title}
              </h2>
              <div className="mt-1 text-[15px] leading-relaxed">{children}</div>
            </div>
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" autoFocus onClick={() => sheet.current?.close()} className={buttonClass("outline", "md", "max-sm:min-h-12")}>
              Cancel
            </button>
            <button
              type="submit"
              name={name}
              value={value}
              // The sheet closes as the form is sent, so any error the form shows is not hidden behind it.
              onClick={() => sheet.current?.close()}
              className={buttonClass("primary", "md", cx("max-sm:min-h-12", danger && "bg-icci-error! hover:bg-[#8f1e18]!"))}
              data-testid="confirm-yes"
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
