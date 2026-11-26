// Slice A6: an address that matches no page at all. Shown on its own, with
// the round logo on cream, and a way back to Home (which asks to sign in
// first if needed).
import type { Metadata } from "next";
import { LinkButton, Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found | ICCI Control Dashboard" };

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-4 py-16 text-center" data-testid="not-found">
      <Logo size={88} />
      <h1 className="page-title mt-6 text-[32px]">Page Not Found</h1>
      <p className="mt-3 text-icci-ink-60">The address may be mistyped, or the page may have moved. Nothing has been changed.</p>
      <div className="mt-6">
        <LinkButton href="/">Go to Home</LinkButton>
      </div>
    </main>
  );
}
