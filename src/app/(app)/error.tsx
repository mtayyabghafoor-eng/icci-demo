"use client";
// Slice A6: something went wrong while a page was being shown (often the
// database did not answer in time). The menu stays; "Try again" fetches the
// page again. No technical message is shown: the reference number lets the
// error be found in the server's records.
import { CloudOff, RotateCw } from "lucide-react";
import { EmptyState, LinkButton } from "@/components/ui";
import { buttonClass } from "@/components/ui/button";

export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined;
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-10" data-testid="page-error">
      <EmptyState
        icon={CloudOff}
        title="This page could not be loaded"
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" onClick={() => retry()} className={buttonClass("primary")}>
              <RotateCw aria-hidden size={18} /> Try again
            </button>
            <LinkButton href="/" kind="outline">
              Go to Home
            </LinkButton>
          </div>
        }
      >
        Something went wrong while fetching it, usually for a moment only. Nothing you entered has been lost or changed.
        {digest && <span className="mt-2 block text-sm">If it keeps happening, report reference {digest}.</span>}
      </EmptyState>
    </main>
  );
}
