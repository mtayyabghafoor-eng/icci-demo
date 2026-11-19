import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";
import { SetUpForm } from "./set-up-form";

export const metadata: Metadata = { title: "Set Up Two-Factor Sign-In | ICCI Control Dashboard" };

export default function SetUpPage(props: PageProps<"/sign-in/set-up">) {
  return (
    <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sign-in/set-up">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  // Already set up: go to the code page instead.
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.length) {
    redirect(next === "/" ? "/sign-in/code" : `/sign-in/code?next=${encodeURIComponent(next)}`);
  }

  return (
    <>
      <h1 className="page-title text-[32px] md:text-[40px]">Set Up Two-Factor Sign-In</h1>
      <p className="mt-2 text-icci-ink-60">
        This is needed once. After this, each sign-in asks for your password and a code from your phone.
      </p>
      <SetUpForm next={next} />
    </>
  );
}
