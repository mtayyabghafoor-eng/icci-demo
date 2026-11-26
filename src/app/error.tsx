"use client";
// Slice A6: something went wrong before the signed-in area could be drawn
// (for example while checking the sign-in). "Try again" fetches it again.
import { RotateCw } from "lucide-react";
import { Logo } from "@/components/ui";
import { buttonClass } from "@/components/ui/button";

export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center" data-testid="page-error">
      <Logo size={88} />
      <h1 className="page-title mt-6 text-[32px]">Something Went Wrong</h1>
      <p className="mt-3 text-icci-ink-60">The dashboard could not be loaded just now, usually for a moment only. Nothing has been changed.</p>
      {digest && <p className="mt-2 text-sm text-icci-ink-60">If it keeps happening, report reference {digest}.</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
          <RotateCw aria-hidden size={18} /> Try again
        </button>
        {/* A full page load on purpose: it starts the app afresh after an error. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className={buttonClass("outline")}>
          Go to Home
        </a>
      </div>
    </main>
  );
}
