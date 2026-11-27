"use client";
// Building blocks shared by the sign-in screens (docs/UI-PLAN.md 5.1).
import { ArrowRight, CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass } from "@/components/ui";
import { cx } from "@/lib/ui/text";

export function SubmitButton({ children, pendingText }: { children: React.ReactNode; pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
      {pending ? pendingText : children}
      {!pending && <ArrowRight aria-hidden size={18} />}
    </button>
  );
}

/** The quieter second button: "Cancel and sign out". */
export function SecondaryButton({ children }: { children: React.ReactNode }) {
  return (
    <button type="submit" className={buttonClass("outline", "lg", "w-full")}>
      {children}
    </button>
  );
}

/**
 * D2: when the server names a field in its message ("Enter the amount"),
 * that field is outlined in red and the cursor goes to it; otherwise the
 * message itself is brought into view. Typing in the field clears the mark.
 */
function useShowProblem(ref: React.RefObject<HTMLParagraphElement | null>, message: string | null) {
  useEffect(() => {
    const note = ref.current;
    if (!message || !note) return;
    const form = note.closest("form");
    const said = message.toLowerCase();
    let hit: HTMLElement | null = null;
    for (const label of Array.from(form?.querySelectorAll("label") ?? [])) {
      const words = (label.firstChild?.textContent ?? label.textContent ?? "").replace(/(optional)/i, "").trim().toLowerCase();
      if (words.length < 3 || !said.includes(words)) continue;
      const box = (label.htmlFor ? document.getElementById(label.htmlFor) : label.querySelector("input, select, textarea")) as HTMLElement | null;
      if (box && !(box as HTMLInputElement).disabled && (box as HTMLInputElement).type !== "hidden") {
        hit = box;
        break;
      }
    }
    if (hit) {
      const box = hit;
      box.setAttribute("aria-invalid", "true");
      box.setAttribute("aria-errormessage", note.id);
      box.focus({ preventScroll: true });
      box.scrollIntoView({ block: "center", behavior: "smooth" });
      const clear = () => {
        box.removeAttribute("aria-invalid");
        box.removeAttribute("aria-errormessage");
      };
      box.addEventListener("input", clear, { once: true });
      return () => box.removeEventListener("input", clear);
    }
    note.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ref, message]);
}

export function FormError({ message }: { message: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const id = useId();
  useShowProblem(ref, message);
  if (!message) return null;
  return (
    <p
      ref={ref}
      id={id}
      role="alert"
      data-testid="form-error"
      className="flex gap-2.5 rounded-xl border border-icci-error/30 bg-[var(--icci-bad-fill)] px-4 py-3 text-[15px] text-icci-text"
    >
      <CircleAlert aria-hidden size={20} className="mt-0.5 shrink-0 text-icci-error" />
      <span>
        <span className="font-bold text-icci-error">Problem: </span>
        {message}
      </span>
    </p>
  );
}

export const fieldClass =
  "mt-1.5 block min-h-12 w-full rounded-xl border border-icci-field bg-white px-3.5 text-base transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";

/**
 * The 6-digit code as six boxes (owner's concept). Underneath it is one
 * ordinary field, so pasting a whole code, the phone's "fill code" offer,
 * screen readers and the browser tests all work as before. The boxes only
 * draw what is in that field.
 */
export function CodeInput({ label }: { label: string }) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const digits = value.replace(/\D/g, "").slice(0, 6);
  return (
    <label className="block">
      <span className="text-[15px] font-semibold">{label}</span>
      <span className="relative mt-2 block">
        <input
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          // Invisible but on top of the boxes, so a tap anywhere lands in it.
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        <span aria-hidden className="grid grid-cols-6 gap-2 sm:gap-2.5">
          {Array.from({ length: 6 }, (_, i) => {
            const isNext = focused && i === Math.min(digits.length, 5) && digits.length < 6;
            return (
              <span
                key={i}
                data-testid="code-box"
                className={cx(
                  "flex h-14 items-center justify-center rounded-xl border bg-white font-mono text-2xl font-semibold text-icci-green-dark transition-colors duration-150 sm:h-16",
                  isNext ? "border-icci-green outline-3 outline-offset-2 outline-icci-focus" : digits[i] ? "border-icci-green/50" : "border-icci-field",
                )}
              >
                {digits[i] ?? ""}
              </span>
            );
          })}
        </span>
      </span>
    </label>
  );
}
