"use client";
// The small forms on Expense settings (slice P5.1): add a spend category,
// add a fund (restricted or not, fixed once added), rename either, and
// change one of the two amounts. Errors show beside the form.
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass, Input } from "@/components/ui";
import { addListEntry, renameListEntry, saveSetting, type ExpenseFormState } from "./actions";

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

export function AmountForm({ settingKey, label, euros }: { settingKey: string; label: string; euros: string }) {
  const [state, action, pending] = useActionState(saveSetting.bind(null, settingKey), start);
  const id = `amount-${settingKey}`;
  return (
    <form action={action} className="mt-2 space-y-3" aria-label={`Change ${label}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={id} className="w-48">
          <span className="font-semibold">Amount in euro</span>
          <Input id={id} name="amount" required inputMode="decimal" defaultValue={euros} className="mt-1" />
        </label>
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Saving…" : "Save amount"}
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
