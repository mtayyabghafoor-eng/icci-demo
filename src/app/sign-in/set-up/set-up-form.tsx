"use client";
import { useActionState } from "react";
import { confirmSetUp, signOut, startSetUp, type FormState, type SetUpState } from "../actions";
import { CodeInput, FormError, SecondaryButton, SubmitButton } from "../ui";

/** Splits the key into groups of four so it is easier to type. */
function grouped(secret: string) {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

export function SetUpForm({ next }: { next: string }) {
  const [setUp, start] = useActionState<SetUpState>(startSetUp, { stage: "start", error: null });
  const [state, confirm] = useActionState<FormState, FormData>(confirmSetUp, { error: null });

  return (
    <>
      <ol className="mt-6 space-y-5">
        <Step n={1}>
          Install an authenticator app on your phone, for example Google Authenticator or Microsoft Authenticator.
        </Step>
        <Step n={2}>
          In the app, add an account and scan the QR code.
          {setUp.stage === "start" ? (
            <form action={start} className="mt-3 space-y-3">
              <FormError message={setUp.error} />
              <SubmitButton pendingText="Preparing…">Show my QR code</SubmitButton>
            </form>
          ) : (
            <>
              <div className="mt-3 flex justify-center rounded-2xl border border-icci-gold-300 bg-white p-4">
                {/* The QR code is made by Supabase as an image built into the page; nothing is fetched. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={setUp.qrCode} alt="QR code to scan with your authenticator app" width={180} height={180} />
              </div>
              <p className="mt-3 text-sm text-icci-ink-60">Cannot scan it? Type this key into the app instead:</p>
              <p data-testid="setup-key" className="mt-1 break-all rounded-xl bg-icci-green-50 px-3 py-2 font-mono text-base">
                {grouped(setUp.secret)}
              </p>
            </>
          )}
        </Step>
        <Step n={3}>Enter the 6-digit code the app now shows.</Step>
      </ol>
      {setUp.stage === "scan" && (
        <form action={confirm} className="mt-6 space-y-5">
          <input type="hidden" name="factorId" value={setUp.factorId} />
          <input type="hidden" name="next" value={next} />
          <CodeInput label="6-digit code" />
          <FormError message={state.error} />
          <SubmitButton pendingText="Checking…">Finish set-up</SubmitButton>
        </form>
      )}
      <form action={signOut.bind(null, "signed-out")} className="mt-3">
        <SecondaryButton>Cancel and sign out</SecondaryButton>
      </form>
    </>
  );
}

/** A numbered step with the number in a gold-ringed circle. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-icci-gold-300 bg-icci-gold-100 text-sm font-bold text-icci-green-dark"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        {children}
      </div>
    </li>
  );
}
