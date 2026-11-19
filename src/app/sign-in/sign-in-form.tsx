"use client";
import { useActionState } from "react";
import { signIn, type FormState } from "./actions";
import { fieldClass, FormError, SubmitButton } from "./ui";

export function SignInForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(signIn, { error: null });
  return (
    <form action={action} className="mt-6 space-y-5">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="text-[15px] font-semibold">Email address</span>
        <input name="email" type="email" required autoComplete="username" className={fieldClass} />
      </label>
      <label className="block">
        <span className="text-[15px] font-semibold">Password</span>
        <input name="password" type="password" required autoComplete="current-password" className={fieldClass} />
      </label>
      <FormError message={state.error} />
      <SubmitButton pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-sm text-icci-ink-60">Forgotten your password or lost your phone? Ask a Super Admin to reset your account.</p>
    </form>
  );
}
