"use client";
// The accounts screen's forms (Round C5). A temporary password is shown once,
// on this screen only: it is never put in the address, an email or a log.
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, ConfirmSubmit, fieldClass, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { ROLE_CHOICES } from "@/lib/accounts/rules";
import { addAccount, giveTemporaryPassword, resetTwoFactor, type AccountFormState } from "./actions";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

/** The one time a temporary password is shown. */
function ShownOnce({ shown }: { shown: NonNullable<AccountFormState["shown"]> }) {
  return (
    <section className="mt-4 rounded-2xl border-2 border-icci-gold bg-icci-gold-100 p-5" data-testid="shown-once" aria-live="polite">
      <h2 className="text-lg font-bold text-icci-green-dark">{shown.password ? "Temporary password, shown only once" : "Account added"}</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[10rem_1fr]">
        <dt className="font-semibold">Name</dt>
        <dd>{shown.name}</dd>
        <dt className="font-semibold">Email</dt>
        <dd>{shown.email}</dd>
        {shown.password && (
          <>
            <dt className="font-semibold">Temporary password</dt>
            <dd className="font-mono text-xl tracking-wide" data-testid="temporary-password">
              {shown.password}
            </dd>
          </>
        )}
      </dl>
      {shown.password ? (
        <p className="mt-3 text-sm">
          Give it to them in person or by phone, never by email. It works for 24 hours. At their first sign-in they set up their authenticator
          app and choose their own password; until then the account sees nothing. Once you leave this page it cannot be shown again (you can give
          a new one).
        </p>
      ) : (
        <p className="mt-3 text-sm">The Library Operator signs in with a code emailed to this address. There is no password.</p>
      )}
      <Link href={`/accounts/${shown.id}`} className={buttonClass("primary", "md", "mt-4")}>
        Open the account
      </Link>
    </section>
  );
}

export function AddAccountForm() {
  const [state, action, pending] = useActionState<AccountFormState, FormData>(addAccount, { error: null });
  if (state.shown) return <ShownOnce shown={state.shown} />;
  return (
    <form action={action} className={box} aria-label="Add an account">
      <FormError message={state.error} />
      <div>
        <label htmlFor="display_name" className="font-semibold">
          Name to show
        </label>
        <input id="display_name" name="display_name" required maxLength={80} autoComplete="off" className={fieldClass} />
      </div>
      <div>
        <label htmlFor="email" className="font-semibold">
          Email address
        </label>
        <p id="email_hint" className="text-sm">
          The address they sign in with. Use the Centre address where they have one.
        </p>
        <input id="email" name="email" type="email" required maxLength={254} autoComplete="off" aria-describedby="email_hint" className={fieldClass} />
      </div>
      <fieldset>
        <legend className="font-semibold">Role</legend>
        <div className="mt-2 space-y-2">
          {ROLE_CHOICES.map((r, i) => (
            <label key={r.code} className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-icci-field bg-white px-3.5 py-2.5">
              <input type="radio" name="role" value={r.code} defaultChecked={i === 0} required className="mt-1.5" />
              <span>
                <span className="font-semibold">{r.label}</span>
                <span className="block text-sm">{r.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <SaveBar cancelHref="/accounts">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md")}>
          {pending ? "Adding…" : "Add the account"}
        </button>
      </SaveBar>
    </form>
  );
}

/** A new temporary password for an existing account (forgotten password, or the 24 hours ran out). */
export function TemporaryPasswordForm({ accountId, name }: { accountId: string; name: string }) {
  const [state, action] = useActionState<AccountFormState, FormData>(giveTemporaryPassword.bind(null, accountId), { error: null });
  if (state.shown) return <ShownOnce shown={state.shown} />;
  return (
    <form action={action} aria-label="Give a new temporary password">
      <FormError message={state.error} />
      <ConfirmSubmit
        label="Give a new temporary password"
        title={`Give ${name} a new temporary password?`}
        confirmLabel="Yes, give a new password"
        kind="outline"
        testId="temporary-password-button"
      >
        Their present password stops working now. The new one is shown to you once and works for 24 hours; the account sees nothing until they
        choose their own password at their next sign-in.
      </ConfirmSubmit>
    </form>
  );
}

/** Lost phone: remove the authenticator, so it is set up again at the next sign-in. */
export function ResetTwoFactorForm({ accountId, name }: { accountId: string; name: string }) {
  const [state, action] = useActionState<AccountFormState, FormData>(resetTwoFactor.bind(null, accountId), { error: null });
  return (
    <form action={action} aria-label="Reset two-factor">
      <FormError message={state.error} />
      <ConfirmSubmit label="Reset two-factor" title={`Reset ${name}'s two-factor?`} confirmLabel="Yes, reset two-factor" testId="reset-two-factor-button">
        Their authenticator app stops working for this account. At their next sign-in, with their password, they scan a new QR code. Use this when a
        phone is lost or replaced.
      </ConfirmSubmit>
    </form>
  );
}
