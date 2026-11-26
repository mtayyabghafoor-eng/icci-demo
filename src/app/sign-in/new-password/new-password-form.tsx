"use client";
// Round C5: the last step of a first sign-in. Choose your own password.
import { useActionState } from "react";
import { chooseOwnPassword, signOut, type FormState } from "../actions";
import { fieldClass, FormError, SecondaryButton, SubmitButton } from "../ui";

export function NewPasswordForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(chooseOwnPassword, { error: null });
  return (
    <>
      <form action={action} className="mt-6 space-y-5" aria-label="Choose your own password">
        <input type="hidden" name="next" value={next} />
        <FormError message={state.error} />
        <label className="block">
          <span className="text-[15px] font-semibold">New password</span>
          <span className="block text-sm text-icci-ink-60">At least 12 characters, with at least one letter and one number.</span>
          <input name="password" type="password" required minLength={12} autoComplete="new-password" className={fieldClass} />
        </label>
        <label className="block">
          <span className="text-[15px] font-semibold">The same password again</span>
          <input name="again" type="password" required minLength={12} autoComplete="new-password" className={fieldClass} />
        </label>
        <SubmitButton pendingText="Saving…">Save my password and continue</SubmitButton>
      </form>
      <form action={() => signOut()} className="mt-3">
        <SecondaryButton>Cancel and sign out</SecondaryButton>
      </form>
    </>
  );
}
