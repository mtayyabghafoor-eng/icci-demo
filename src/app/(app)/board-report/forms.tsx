"use client";
// The "Make the final copy" button, with the "Are you sure?" sheet (A1).
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { ConfirmSubmit } from "@/components/ui";
import { makeFinalCopy, type CopyState } from "./actions";

const none: CopyState = { error: null };

export function FinalCopyForm({ month, monthText, waiting }: { month: string; monthText: string; waiting: number }) {
  const [state, send] = useActionState(() => makeFinalCopy(month), none);
  return (
    <form action={send} className="space-y-2" data-testid="final-copy-form">
      <ConfirmSubmit kind="primary" label="Make the final copy" title={`Make the final copy for ${monthText}?`} confirmLabel="Yes, make it" testId="make-final-copy">
        {waiting > 0
          ? `${waiting} ${waiting === 1 ? "claim" : "claims"} dated in ${monthText} ${waiting === 1 ? "is" : "are"} still waiting; if approved later, ${waiting === 1 ? "it counts" : "they count"} in the month approved. `
          : ""}
        The numbers are frozen as they are now. Making it again later keeps both copies.
      </ConfirmSubmit>
      <FormError message={state.error} />
    </form>
  );
}
