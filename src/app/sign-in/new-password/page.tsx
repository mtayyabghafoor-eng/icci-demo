// Round C5: the last step of a first sign-in with a temporary password.
// Reached only with the authenticator just set up (the gatekeeper lets a
// fully signed-in person in here, and nowhere else is any use to them yet:
// the database gives the account nothing until this is done).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { safeNextPath } from "@/lib/auth/rules";
import { createClient } from "@/lib/supabase/server";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Choose Your Password | ICCI Control Dashboard" };

export default function NewPasswordPage(props: PageProps<"/sign-in/new-password">) {
  return (
    <Suspense fallback={<Skeleton lines={3} label="Loading" />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/sign-in/new-password">["searchParams"] }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);
  const supabase = await createClient();
  const { data: state } = await supabase.rpc("my_set_up_state");
  // Nothing to choose: carry on (or back to sign-in if the time ran out).
  if (state === "ready") redirect(next);
  if (state !== "choose_password") redirect("/sign-in?reason=temporary-expired");

  return (
    <>
      <h1 className="page-title text-[32px] md:text-[40px]">Choose Your Password</h1>
      <p className="mt-2 text-icci-ink-60">
        Your authenticator is set up. Last step: replace the temporary password with one only you know. After this, each sign-in asks for this
        password and a code from your phone.
      </p>
      <NewPasswordForm next={next} />
    </>
  );
}
