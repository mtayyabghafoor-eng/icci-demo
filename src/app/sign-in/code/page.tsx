import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@/components/ui";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";
import { CodeForm } from "./code-form";

export const metadata: Metadata = { title: "Enter Your Code | ICCI Control Dashboard" };

export default function CodePage(props: PageProps<"/sign-in/code">) {
  return (
    <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sign-in/code">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  // No authenticator yet: set one up first.
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (!factors?.totp.length) {
    redirect(next === "/" ? "/sign-in/set-up" : `/sign-in/set-up?next=${encodeURIComponent(next)}`);
  }

  return (
    <>
      <h1 className="page-title text-[32px] md:text-[40px]">Enter Your Code</h1>
      <p className="mt-2 text-icci-ink-60">Open the authenticator app on your phone and enter the 6-digit code it shows for ICCI.</p>
      <CodeForm next={next} />
    </>
  );
}
