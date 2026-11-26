import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Notice, Skeleton } from "@/components/ui";
import { safeNextPath } from "@/lib/auth/rules";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign In | ICCI Control Dashboard" };

const NOTICES: Record<string, { text: string; isProblem: boolean }> = {
  idle: { text: "You were signed out after 15 minutes of inactivity. Please sign in again.", isProblem: false },
  "signed-out": { text: "You have signed out.", isProblem: false },
  "no-access": { text: "This account does not have access. Please ask a Super Admin.", isProblem: true },
  // Round C5: a new account's temporary password works for 24 hours.
  "temporary-expired": { text: "That temporary password has run out (it works for 24 hours). Ask a Super Admin for a new one.", isProblem: true },
  // An emailed code worked, but the account may not sign in that way (an
  // admin), or is switched off. The database refused it (slice P4.1).
  "email-code-refused": {
    text: "That sign-in did not give access. Admins and Finance sign in here with their password and authenticator app. Library volunteers: please ask a Super Admin.",
    isProblem: true,
  },
};

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sign-in">["searchParams"] }) {
  const params = await searchParams;
  const reason = typeof params.reason === "string" ? params.reason : "";
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const notice = NOTICES[reason];

  return (
    <>
      <h1 className="page-title text-[32px] md:text-[40px]">Sign In</h1>
      <p className="mt-2 text-icci-ink-60">Use your ICCI admin email and password.</p>
      {notice && (
        <div className="mt-5">
          {/* Always "status", so it is read out but not as an alarm. */}
          <Notice tone={notice.isProblem ? "error" : "info"} role="status">
            {notice.text}
          </Notice>
        </div>
      )}
      <SignInForm next={next} />
      <p className="mt-6 border-t border-icci-gold-300 pt-5 text-sm text-icci-ink-60">
        Library volunteer?{" "}
        <Link href={next === "/" ? "/sign-in/library" : `/sign-in/library?next=${encodeURIComponent(next)}`} className="font-semibold">
          Sign in with an emailed code
        </Link>
        .
      </p>
    </>
  );
}
