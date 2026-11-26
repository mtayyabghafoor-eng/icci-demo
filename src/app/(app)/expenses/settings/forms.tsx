"use client";
// The small forms on Expense settings (slice P5.1): add a spend category,
// add a fund (restricted or not, fixed once added), rename either while it
// is unused, and ask for, confirm or turn down a new amount (migration
// 0052). Errors show beside the form.
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass, Input } from "@/components/ui";
import { addListEntry, askSettingChange, decideSettingChange, renameListEntry, type ExpenseFormState } from "./actions";

const start: ExpenseFormState = { error: null };

export function AddCategoryForm() {
  const [state, action, pending] = useActionState(addListEntry.bind(null, "category"), start);
  return (
    <form action={action} className="space-y-3" aria-label="Add a spend category">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="font-semibold">New category</span>
          <Input name="name" required maxLength={100} dir="auto" className="mt-1" />
        </label>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : "Add category"}
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function AddFundForm() {
  const [state, action, pending] = useActionState(addListEntry.bind(null, "fund"), start);
  return (
    <form action={action} className="space-y-3" aria-label="Add a fund">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="font-semibold">New fund</span>
          <Input name="name" required maxLength={100} dir="auto" className="mt-1" />
        </label>
        <fieldset className="flex flex-wrap gap-x-5">
          <legend className="sr-only">Is this fund restricted?</legend>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input type="radio" name="restricted" value="yes" required className="h-5 w-5 accent-icci-green-dark" />
            Restricted
          </label>
          <label className="flex min-h-11 items-center gap-2 font-semibold">
            <input type="radio" name="restricted" value="no" className="h-5 w-5 accent-icci-green-dark" />
            Unrestricted
          </label>
        </fieldset>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : "Add fund"}
        </button>
      </div>
      <p className="text-sm text-icci-ink-60">
        A restricted fund may only pay for what its donors gave it for (for example Zakat or Fitra). This choice cannot be changed later.
      </p>
      <FormError message={state.error} />
    </form>
  );
}

export function RenameForm({ kind, id, name }: { kind: "category" | "fund"; id: string; name: string }) {
  const [state, action, pending] = useActionState(renameListEntry.bind(null, kind, id), start);
  return (
    <form action={action} className="mt-2 space-y-3" aria-label={`Rename ${name}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="font-semibold">Name</span>
          <Input name="name" required maxLength={100} defaultValue={name} dir="auto" className="mt-1" />
        </label>
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

/** Ask for a new amount. It takes effect only when a different Super Admin confirms it. */
export function AmountForm({ settingKey, label, euros }: { settingKey: string; label: string; euros: string }) {
  const [state, action, pending] = useActionState(askSettingChange.bind(null, settingKey), start);
  const id = `amount-${settingKey}`;
  return (
    <form action={action} className="mt-2 space-y-3" aria-label={`Change ${label}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={id} className="w-48">
          <span className="font-semibold">New amount in euro</span>
          <Input id={id} name="amount" required inputMode="decimal" defaultValue={euros} className="mt-1" />
        </label>
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Sending…" : "Ask for this change"}
        </button>
      </div>
      <p className="text-sm text-icci-ink-60">A second Super Admin must confirm the new amount before it is used.</p>
      <FormError message={state.error} />
    </form>
  );
}

/** Confirm or turn down another Super Admin's request (with an optional reason), or cancel your own. */
export function ChangeDecisionForm({ changeId, mine }: { changeId: number; mine: boolean }) {
  const [confirmState, confirm, confirming] = useActionState(decideSettingChange.bind(null, changeId, "confirmed"), start);
  const [downState, turnDown, turningDown] = useActionState(decideSettingChange.bind(null, changeId, "turned_down"), start);
  const [cancelState, cancel, cancelling] = useActionState(decideSettingChange.bind(null, changeId, "cancelled"), start);
  if (mine) {
    return (
      <form action={cancel} className="mt-2 space-y-2" aria-label="Cancel my request">
        <button type="submit" disabled={cancelling} className={buttonClass("secondary")}>
          {cancelling ? "Cancelling…" : "Cancel my request"}
        </button>
        <FormError message={cancelState.error} />
      </form>
    );
  }
  return (
    <div className="mt-2 space-y-3">
      <form action={confirm} aria-label="Confirm the new amount">
        <button type="submit" disabled={confirming} className={buttonClass("primary")}>
          {confirming ? "Confirming…" : "Confirm the new amount"}
        </button>
        <FormError message={confirmState.error} />
      </form>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Turn down</summary>
        <form action={turnDown} className="mt-2 space-y-3" aria-label="Turn down the new amount">
          <label className="block max-w-md">
            <span className="font-semibold">Reason (optional)</span>
            <Input name="note" maxLength={500} dir="auto" className="mt-1" />
          </label>
          <button type="submit" disabled={turningDown} className={buttonClass("danger")}>
            {turningDown ? "Turning down…" : "Turn down this change"}
          </button>
          <FormError message={downState.error} />
        </form>
      </details>
    </div>
  );
}
