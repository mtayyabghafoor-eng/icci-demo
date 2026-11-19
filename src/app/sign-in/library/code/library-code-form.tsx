"use client";
import Link from "next/link";
import { useActionState } from "react";
import { Notice } from "@/components/ui";
import { resendLibraryCode, verifyLibraryCode, type FormState } from "../../actions";
import { CodeInput, FormError, SecondaryButton, SubmitButton } from "../../ui";

export function LibraryCodeForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyLibraryCode, { error: null });
  const [resent, resend] = useActionState<FormState & { sent?: boolean }>(resendLibraryCode, { error: null });
  return (
    <>
      <form action={action} className="mt-6 space-y-5">
        <input type="hidden" name="next" value={next} />
        <CodeInput label="6-digit code" />
        <FormError message={state.error} />
        <SubmitButton pendingText="Checking…">Sign in</SubmitButton>
      </form>
      <form action={resend} className="mt-3 space-y-3">
        {resent.sent && (
          <Notice tone="info" role="status">
            If a minute has passed since the last code, a new one is on its way. Only the newest code works.
          </Notice>
        )}
        <FormError message={resent.error} />
        <SecondaryButton>Email me a new code</SecondaryButton>
      </form>
      <p className="mt-5 text-sm text-icci-ink-60">
        Wrong address?{" "}
        <Link href="/sign-in/library" className="font-semibold">
          Enter a different email
        </Link>
        . No email after five minutes? Check your junk folder, or ask a Super Admin.
      </p>
    </>
  );
}
