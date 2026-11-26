"use client";
// The two small forms on the Training types page: add a type, and change a
// type's name or usual length. Errors are shown beside the form.
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { MAX_YEARS, type TrainingType } from "@/lib/training/rules";
import { addTrainingType, saveTrainingType, type TrainingFormState } from "../../training-actions";
import { fieldClass } from "@/components/ui";

const primary =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60";
const secondary =
  "inline-flex min-h-11 items-center justify-center rounded-[10px] border border-icci-field bg-white px-4 py-2 font-semibold text-icci-text transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 disabled:opacity-60";

function Fields({ prefix, name, years }: { prefix: string; name?: string; years?: number | null }) {
  return (
    <>
      <label className="min-w-56 flex-1">
        <span className="font-semibold">Name</span>
        <input id={`${prefix}-name`} name="name" required maxLength={100} defaultValue={name} className={fieldClass} dir="auto" />
      </label>
      <label className="w-44">
        <span className="font-semibold">Usual length (years)</span>
        <input
          id={`${prefix}-years`}
          name="usual_years"
          type="number"
          min={1}
          max={MAX_YEARS}
          step={1}
          inputMode="numeric"
          defaultValue={years ?? ""}
          className={fieldClass}
          aria-describedby="years-hint"
        />
      </label>
    </>
  );
}

export function AddTypeForm() {
  const [state, action, pending] = useActionState<TrainingFormState, FormData>(addTrainingType, { error: null });
  return (
    <form action={action} className="mt-3 space-y-3" aria-label="Add a training type">
      <div className="flex flex-wrap items-end gap-3">
        <Fields prefix="new" />
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}

export function EditTypeForm({ type }: { type: TrainingType }) {
  const [state, action, pending] = useActionState<TrainingFormState, FormData>(saveTrainingType.bind(null, type.id), { error: null });
  return (
    <form action={action} className="mt-2 space-y-3" aria-label={`Change ${type.name}`}>
      <div className="flex flex-wrap items-end gap-3">
        <Fields prefix={type.id} name={type.name} years={type.usual_years} />
        <button type="submit" disabled={pending} className={secondary}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
