// Library sign-in, step 2 (slice P4.1): the 6-digit code from the email.
// The email address waits in a short-lived cookie, never in the address bar.
import { Suspense } from "react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Skeleton } from "@/components/ui";
import { LIBRARY_PENDING_COOKIE, safeNextPath } from "@/lib/auth/rules";
import { LibraryCodeForm } from "./library-code-form";

export const metadata: Metadata = { title: "Check Your Email | ICCI Control Dashboard" };

export default function LibraryCodePage(props: PageProps<"/sign-in/library/code">) {
  return (
    <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sign-in/library/code">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const email = (await cookies()).get(LIBRARY_PENDING_COOKIE)?.value;
  // Nothing waiting (or it ran out): start again.
  if (!email) redirect(next === "/" ? "/sign-in/library" : `/sign-in/library?next=${encodeURIComponent(next)}`);

  return (
    <>
      <h1 className="page-title text-[32px] md:text-[40px]">Check Your Email</h1>
      <p className="mt-2 text-icci-ink-60">
        If <span className="font-semibold text-icci-text" data-testid="pending-email">{email}</span> has a library account, we
        have emailed it a 6-digit code. It works once, for 10 minutes.
      </p>
      <LibraryCodeForm next={next} />
    </>
  );
}
