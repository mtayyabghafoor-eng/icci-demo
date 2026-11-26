"use client";
// Signs the admin out after 15 minutes without mouse, keyboard or touch.
// The last-activity time is kept in a cookie, so every open tab shares it:
// working in one tab keeps the others signed in, and when the limit is
// reached every tab signs out. The gatekeeper also checks it on the server,
// which catches a laptop that was closed or a tab reopened later.
// In the last two minutes a bar warns the admin; any movement or key press
// clears it.
import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { IDLE_LIMIT_MS, IDLE_WARNING_MS, idleMsLeft, isIdleExpired, LAST_ACTIVE_COOKIE } from "@/lib/auth/rules";

const WRITE_EVERY_MS = 15_000;
const CHECK_EVERY_MS = 10_000;
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

function readCookie(): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${LAST_ACTIVE_COOKIE}=`))
    ?.slice(LAST_ACTIVE_COOKIE.length + 1);
}

export function IdleWatcher({ serverNow }: { serverNow: number }) {
  const [msLeft, setMsLeft] = useState<number | null>(null);
  useEffect(() => {
    // Use the server's clock, so a phone with the wrong time is not signed out early.
    const offset = serverNow - Date.now();
    const now = () => Date.now() + offset;
    let lastWrite = 0;
    let signingOut = false;

    const write = (t: number) => {
      lastWrite = t;
      // Round C3: "secure" on the real site (https), as the server sets it.
      document.cookie = `${LAST_ACTIVE_COOKIE}=${t}; path=/; max-age=86400; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`;
    };

    const check = () => {
      if (signingOut) return;
      const left = idleMsLeft(readCookie(), now());
      setMsLeft(left > 0 && left <= IDLE_WARNING_MS ? left : null);
      if (isIdleExpired(readCookie(), now())) {
        signingOut = true;
        // A full page load, so the sign-in ends on the server and every
        // trace of the signed-in page is cleared from the screen.
        // /sign-out is a server route, not a page, so the router cannot be used.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/sign-out?reason=idle");
      }
    };

    const onActivity = () => {
      const t = now();
      // Normally saved every 15 seconds; near the limit, straight away, so
      // the warning goes the moment the admin moves.
      if (t - lastWrite < WRITE_EVERY_MS && idleMsLeft(readCookie(), t) > IDLE_WARNING_MS) return;
      // Activity after the limit does not bring a sign-in back.
      if (isIdleExpired(readCookie(), t)) return check();
      write(t);
      setMsLeft(null);
    };

    write(now());
    for (const e of EVENTS) window.addEventListener(e, onActivity, { passive: true });
    document.addEventListener("visibilitychange", check);
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    return () => {
      for (const e of EVENTS) window.removeEventListener(e, onActivity);
      document.removeEventListener("visibilitychange", check);
      window.clearInterval(timer);
    };
  }, [serverNow]);

  const minutes = msLeft === null ? 0 : Math.max(1, Math.ceil(msLeft / 60_000));
  return (
    <>
      <span hidden data-idle-limit-minutes={IDLE_LIMIT_MS / 60_000} />
      {msLeft !== null && (
        <div
          role="status"
          data-testid="idle-warning"
          className="fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3 text-[15px] shadow-raised md:bottom-6 md:left-[96px] lg:left-[288px] print:hidden"
        >
          <Clock aria-hidden size={20} className="shrink-0 text-[var(--icci-warn-text)]" />
          <p>
            <span className="font-bold text-[var(--icci-warn-text)]">
              Signing out in {minutes} minute{minutes === 1 ? "" : "s"}.
            </span>{" "}
            {/* A2: a phone has no mouse or keys. */}
            <span className="md:hidden">Tap the screen to stay signed in.</span>
            <span className="max-md:hidden">Move the mouse or press a key to stay signed in.</span>
          </p>
        </div>
      )}
    </>
  );
}
