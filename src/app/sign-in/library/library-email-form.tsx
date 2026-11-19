"use client";
import { useActionState } from "react";
import { sendLibraryCode, type FormState } from "../actions";
import { fieldClass, FormError, SubmitButton } from "../ui";

export function LibraryEmailForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(sendLibraryCode, { error: null });
  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-[15px] font-semibold">Email address</span>
        <input name="email" type="email" required autoComplete="email" inputMode="email" className={fieldClass} />
      </label>
      <FormError message={state.error} />
      <SubmitButton pendingText="Sending…">Email me a code</SubmitButton>
    </form>
  );
}
