"use client";
// The buttons on the label screens.
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { LABELS_PER_SHEET, MAX_LABELS_PER_PRINT } from "@/lib/labels/sheet";
import { createLabelSheet, reprintLabelSheet, type LabelFormState } from "./actions";
import { fieldClass } from "@/components/ui";

const none: LabelFormState = { error: null };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 min-h-12 px-6 text-lg";
const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white font-semibold text-icci-green! transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 disabled:opacity-60 px-4";

export function PrintLabelsForm({ nextSerial }: { nextSerial: string }) {
  const [state, send, pending] = useActionState(createLabelSheet, none);
  return (
    <form action={send} className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      <p>
        The next label number is <strong data-testid="next-serial">{nextSerial}</strong>.
      </p>
      <label className="block max-w-xs">
        <span className="font-semibold">How many labels?</span>
        <input
          name="count"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LABELS_PER_PRINT}
          defaultValue={LABELS_PER_SHEET}
          required
          className={fieldClass}
        />
      </label>
      <p className="text-sm">
        {LABELS_PER_SHEET} labels fill one A4 sheet. Up to {MAX_LABELS_PER_PRINT} at once (ten sheets). The numbers are
        kept for these labels even if the sheet is never printed.
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Creating…" : "Create and print"}
      </button>
    </form>
  );
}

export function PrintAgainButton({ runId }: { runId: number }) {
  const [state, send, pending] = useActionState(reprintLabelSheet.bind(null, runId), none);
  return (
    <form action={send} className="space-y-2">
      <button type="submit" disabled={pending} className={secondary}>
        {pending ? "Opening…" : "Print again"}
      </button>
      <FormError message={state.error} />
    </form>
  );
}

export function PrintNowButton() {
  return (
    <button type="button" onClick={() => window.print()} className={primary}>
      Print
    </button>
  );
}
