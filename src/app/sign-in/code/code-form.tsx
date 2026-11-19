"use client";
import { useActionState } from "react";
import { signOut, verifyCode, type FormState } from "../actions";
import { CodeInput, FormError, SecondaryButton, SubmitButton } from "../ui";

export function CodeForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(verifyCode, { error: null });
  return (
    <>
      <form action={action} className="mt-6 space-y-5">
        <input type="hidden" name="next" value={next} />
        <CodeInput label="6-digit code" />
        <FormError message={state.error} />
        <SubmitButton pendingText="Checking…">Continue</SubmitButton>
      </form>
      <form action={signOut.bind(null, "signed-out")} className="mt-3">
        <SecondaryButton>Cancel and sign out</SecondaryButton>
      </form>
    </>
  );
}
