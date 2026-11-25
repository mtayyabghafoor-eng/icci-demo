"use client";
// UI-9: a saved message that floats over the page instead of pushing it
// down: top right on a PC, just above the bottom bar on a phone. It stays 8
// seconds (longer while the mouse or keyboard is on it), then slides away.
// Closing it also takes "?done=" (and the numbers that go with it) out of the address, so reloading the page
// does not show it again. Screen readers hear it once, politely.
import { X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const SHOW_MS = 8000;
const LEAVE_MS = 200;

// A1: every part of the address that only carries a "done" message, so a
// reload never shows an old message again (not only "?done=").
const MESSAGE_PARAMS = ["done", "n", "count", "late", "saved", "new"];

export function forgetDone() {
  try {
    const url = new URL(window.location.href);
    const found = MESSAGE_PARAMS.filter((p) => url.searchParams.has(p));
    if (found.length === 0) return;
    for (const p of found) url.searchParams.delete(p);
    window.history.replaceState(window.history.state, "", url);
  } catch {
    // Nothing to tidy.
  }
}

/** A1: for a saved message shown in the page (not floating): tidy the address once it is shown. */
export function ForgetDone() {
  useEffect(() => {
    forgetDone();
  }, []);
  return null;
}

export function Toast({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"in" | "out" | "gone">("in");
  const held = useRef(false);

  // A new saved message (the page was drawn again after another action,
  // even with the same words) shows afresh, however the last one ended.
  useEffect(() => {
    setState("in");
  }, [children]);

  useEffect(() => {
    if (state !== "in") return;
    let timer = window.setTimeout(function leave() {
      // Wait while the person is reading it or has the keyboard on it.
      if (held.current) {
        timer = window.setTimeout(leave, 1000);
        return;
      }
      setState("out");
    }, SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    if (state !== "out") return;
    const timer = window.setTimeout(() => {
      setState("gone");
      forgetDone();
    }, LEAVE_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (state === "gone") return null;
  return (
    <div
      className="icci-toast"
      data-state={state}
      data-testid="toast"
      onMouseEnter={() => (held.current = true)}
      onMouseLeave={() => (held.current = false)}
      onFocus={() => (held.current = true)}
      onBlur={() => (held.current = false)}
    >
      {children}
      <button
        type="button"
        onClick={() => setState("out")}
        aria-label="Close this message"
        className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-icci-ink-60 transition-colors duration-150 hover:bg-black/5 hover:text-icci-text"
      >
        <X aria-hidden size={18} />
      </button>
    </div>
  );
}
