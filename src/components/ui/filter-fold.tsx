"use client";
// Phone only (docs/UI-PLAN.md 5.3): the drop-down filters of a list fold
// away behind "More filters", so the list itself is on the first screen.
// The search box and the Search button stay visible. The button counts the
// drop-downs already in use. On a PC everything is always shown. E2 (owner,
// 27 Nov 2026, replacing A2): a list folds when it has a search box or two
// or more drop-downs; a lone drop-down stays in view and has no button.
//
// D3 (owner, 27 Nov 2026):
// - Phone: the drop-downs in use show as pills under the filters, each with
//   × to remove it, and "Clear all".
// - PC: changing a drop-down (E2: or a tick box) updates the list on its own, a moment later
//   (so a keyboard user stepping through the choices with the arrow keys
//   is not sent a new page at every press), and the cursor comes back to
//   that drop-down. On a phone the Search or Show button stays, so the
//   folded filters do not snap shut after each choice. E2: on a PC that
//   button is hidden (globals.css); a search still runs on Enter.
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const WAIT_MS = 600;
const FOCUS_KEY = "icci-filter-focus";
/** The same test as the folding rule in globals.css: a search box, or a drop-down in the second box. */
const FOLDS = ':has(input:not([type]), input[type="search"], input[type="text"], label:nth-of-type(2) > select)';

type Pill = { name: string; label: string; value: string };

function pillsOf(form: HTMLFormElement): Pill[] {
  return Array.from(form.querySelectorAll("select"))
    .filter((s) => s.value !== "" && s.name)
    .map((s) => {
      const label = s.closest("label")?.querySelector("span")?.textContent?.trim() || s.getAttribute("aria-label") || s.name;
      return { name: s.name, label, value: s.selectedOptions[0]?.text ?? s.value };
    });
}

export function FilterFold() {
  const ref = useRef<HTMLSpanElement>(null);
  const [form, setForm] = useState<HTMLFormElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pills, setPills] = useState<Pill[]>([]);
  const [foldable, setFoldable] = useState(true);

  useEffect(() => {
    const f = ref.current?.closest("form") ?? null;
    if (!f) return;
    setFoldable(f.matches(FOLDS));
    setPills(pillsOf(f));
    setForm(f);

    // PC: back where you were after the list updated on its own.
    const again = sessionStorage.getItem(FOCUS_KEY);
    if (again) {
      sessionStorage.removeItem(FOCUS_KEY);
      (f.querySelector(`[name="${CSS.escape(again)}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    }

    let timer: number | undefined;
    const changed = (e: Event) => {
      const select = e.target as HTMLSelectElement | HTMLInputElement;
      if (select.tagName !== "SELECT" && !(select instanceof HTMLInputElement && select.type === "checkbox")) return;
      if (!window.matchMedia("(min-width: 48rem)").matches) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        sessionStorage.setItem(FOCUS_KEY, select.name);
        f.requestSubmit();
      }, WAIT_MS);
    };
    f.addEventListener("change", changed);
    return () => {
      f.removeEventListener("change", changed);
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    form?.setAttribute("data-folded", open ? "false" : "true");
  }, [form, open]);

  function remove(names: string[]) {
    if (!form) return;
    for (const n of names) {
      const s = form.querySelector(`select[name="${CSS.escape(n)}"]`) as HTMLSelectElement | null;
      if (s) s.value = "";
    }
    form.requestSubmit();
  }

  return (
    <>
      <span ref={ref} className="contents" />
      {foldable && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 font-semibold text-icci-green transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 md:hidden"
        >
          <SlidersHorizontal aria-hidden size={18} />
          {open ? "Fewer filters" : pills.length > 0 ? `More filters (${pills.length} in use)` : "More filters"}
        </button>
      )}
      {form &&
        foldable &&
        pills.length > 0 &&
        createPortal(
          <div className="col-span-full flex flex-wrap items-center gap-2 md:hidden" data-testid="filter-pills" aria-label="Filters in use" role="group">
            {pills.map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => remove([p.name])}
                aria-label={`Remove the filter ${p.label}: ${p.value}`}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-icci-gold-300 bg-icci-gold-100 pl-3.5 pr-2.5 text-sm font-semibold text-icci-green-dark"
              >
                {p.label}: {p.value}
                <X aria-hidden size={16} />
              </button>
            ))}
            {pills.length > 1 && (
              <button type="button" onClick={() => remove(pills.map((p) => p.name))} className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-icci-green">
                Clear all
              </button>
            )}
          </div>,
          form,
        )}
    </>
  );
}
