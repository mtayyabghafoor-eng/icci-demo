"use client";
// D6: find a building, room, store room or shelf by name or PL- code. The
// tree narrows as you type: a place that matches stays with the places
// around it, everything else is hidden for now. Nothing is sent anywhere.
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { fieldClass } from "@/components/ui";

export function PlaceFinder() {
  const [find, setFind] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tree = document.querySelector<HTMLElement>('[data-testid="places-tree"]');
    if (!tree) return;
    const words = find.trim().toLowerCase().replace(/^pl-0*/, "pl-");
    const branches = Array.from(tree.querySelectorAll<HTMLElement>("[data-branch]"));
    const buildings = Array.from(tree.querySelectorAll<HTMLElement>("[data-building]"));
    if (!words) {
      [...branches, ...buildings].forEach((el) => (el.hidden = false));
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the count follows the page
      setLeft(null);
      return;
    }
    branches.forEach((el) => (el.hidden = true));
    let n = 0;
    for (const row of Array.from(tree.querySelectorAll<HTMLElement>('[data-testid="place-row"]'))) {
      const text = `${row.textContent ?? ""} ${(row.dataset.code ?? "").replace(/^PL-0*/i, "pl-")}`.toLowerCase();
      if (!text.includes(words)) continue;
      n += 1;
      for (let el: HTMLElement | null = row.closest("[data-branch]"); el; el = el.parentElement?.closest("[data-branch]") ?? null) el.hidden = false;
    }
    buildings.forEach((b) => (b.hidden = !b.querySelector("[data-branch]:not([hidden])")));
    setLeft(n);
  }, [find]);

  return (
    <div ref={box} className="mb-4 max-w-xl" role="search" aria-label="Find a place">
      <label className="block">
        <span className="sr-only">Find a place</span>
        <span className="relative block">
          <Search aria-hidden size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-icci-ink-60" />
          <input dir="auto"
            type="search"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a building, room, shelf or PL- number"
            className={`${fieldClass} mt-0! pl-10`}
            data-testid="place-find"
          />
        </span>
      </label>
      {left !== null && (
        <p className="mt-1.5 text-sm text-icci-ink-60" aria-live="polite">
          {left === 0 ? "No place matches." : `${left} ${left === 1 ? "place matches" : "places match"}.`}
        </p>
      )}
    </div>
  );
}
