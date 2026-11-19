// Library sign-in, step 1 (slice P4.1): the Library Operator types their
// email address and is sent a 6-digit code. No password, no authenticator.
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Skeleton } from "@/components/ui";
import { safeNextPath } from "@/lib/auth/rules";
import { LibraryEmailForm } from "./library-email-form";

export const metadata: Metadata = { title: "Library Sign In | ICCI Control Dashboard" };

export default function LibrarySignInPage(props: PageProps<"/sign-in/library">) {
  return (
    <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sign-in/library">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  return (
    <>
      <h1 className="page-title text-[32px] md:text-[40px]">Library Sign In</h1>
      <p className="mt-2 text-icci-ink-60">
        For the library volunteer. Enter your email address and we will email you a 6-digit code. No password is needed.
      </p>
      <LibraryEmailForm next={next} />
      <p className="mt-6 text-sm text-icci-ink-60">
        Admin or Finance?{" "}
        <Link href={next === "/" ? "/sign-in" : `/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold">
          Sign in with your password
        </Link>
        .
      </p>
    </>
  );
}
