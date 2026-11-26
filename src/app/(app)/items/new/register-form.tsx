"use client";
// Register an item, phone-first: three fields or fewer per step.
//   Step 1: what is it (label, kind, name)
//   Step 2: where is it (category, location, photo)
//   Step 3, consumables only: how is it counted (unit, minimum level)
import { useActionState, useRef, useState, startTransition } from "react";
import { FormError } from "@/app/sign-in/ui";
import type { CategoryGroup } from "@/lib/categories/rules";
import { CategoryOptions } from "../../categories/options";
import { registerItem, type ItemFormState } from "../actions";
import { PhotoInput } from "../photo-input";
import { fieldClass } from "@/components/ui";

type Option = { id: string; path: string };

export function RegisterForm(props: {
  label: string;
  /** Main categories with their sub-categories (items go in a sub-category, P1.17). */
  categoryGroups: CategoryGroup[];
  allPlaces: Option[];
  stockPlaces: Option[];
  /** A place chosen before (from a place page, slice P1.12), filled in if it fits. */
  place?: string;
}) {
  const [state, action, pending] = useActionState<ItemFormState, FormData>(registerItem, { error: null });
  const [step, setStep] = useState(1);
  const [kind, setKind] = useState<"fixed_asset" | "consumable" | "">("");
  const photo = useRef<File | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastStep = kind === "consumable" ? 3 : 2;
  const places = kind === "consumable" ? props.stockPlaces : props.allPlaces;

  /** Checks only the fields on the step being shown. */
  function stepIsValid(n: number) {
    const fields = formRef.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[data-step="${n}"]`) ?? [];
    for (const f of fields) if (!f.reportValidity()) return false;
    return true;
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="mt-4 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!stepIsValid(step)) return;
        if (step < lastStep) return setStep(step + 1);
        const data = new FormData(e.currentTarget);
        if (photo.current) data.set("photo", photo.current);
        startTransition(() => action(data));
      }}
    >
      <p className="text-sm font-semibold text-icci-green-dark">
        Step {step} of {lastStep}
      </p>

      <fieldset hidden={step !== 1} className="space-y-4">
        <legend className="sr-only">What is it?</legend>
        <label className="block">
          <span className="font-semibold">Label number</span>
          <input name="label" data-step="1" required defaultValue={props.label} placeholder="ICCI-000123" className={fieldClass} />
        </label>
        <div>
          <span className="font-semibold">Kind of item</span>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(
              [
                ["fixed_asset", "Fixed asset", "One thing, e.g. a chair"],
                ["consumable", "Consumable", "Stock on a shelf, e.g. soap"],
              ] as const
            ).map(([value, title, hint]) => (
              <label
                key={value}
                className={`flex min-h-16 cursor-pointer flex-col justify-center rounded-md border-2 bg-white px-3 py-2 ${kind === value ? "border-icci-green-dark bg-icci-panel" : "border-icci-text/30"}`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  data-step="1"
                  required
                  className="sr-only"
                  checked={kind === value}
                  onChange={() => setKind(value)}
                />
                <span className="font-semibold">{title}</span>
                <span className="text-sm">{hint}</span>
              </label>
            ))}
          </div>
        </div>
        <label className="block">
          <span className="font-semibold">Name</span>
          <input name="name" data-step="1" required maxLength={200} className={fieldClass} />
        </label>
      </fieldset>

      <fieldset hidden={step !== 2} className="space-y-4">
        <legend className="sr-only">Where is it?</legend>
        <label className="block">
          <span className="font-semibold">Category</span>
          <select name="category_id" data-step="2" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Choose a category
            </option>
            <CategoryOptions groups={props.categoryGroups} />
          </select>
        </label>
        <label className="block">
          <span className="font-semibold">{kind === "consumable" ? "Store room or shelf" : "Location"}</span>
          <select
            name="location_id"
            data-step="2"
            required
            defaultValue={places.some((p) => p.id === props.place) ? props.place : ""}
            className={fieldClass}
            key={kind}
          >
            <option value="" disabled>
              Choose where it is
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.path}
              </option>
            ))}
          </select>
        </label>
        <PhotoInput label="Photo (optional)" onPhoto={(f) => (photo.current = f)} />
      </fieldset>

      {kind === "consumable" && (
        <fieldset hidden={step !== 3} className="space-y-4">
          <legend className="sr-only">How is it counted?</legend>
          <label className="block">
            <span className="font-semibold">Counted in (unit)</span>
            <input name="unit" data-step="3" required maxLength={40} placeholder="box, roll, bottle…" className={fieldClass} />
          </label>
          <label className="block">
            <span className="font-semibold">Minimum level</span>
            <input name="minimum_level" data-step="3" required type="number" min={0} step={1} inputMode="numeric" className={fieldClass} />
            <span className="text-sm">Below this, it shows on the low-stock list.</span>
          </label>
        </fieldset>
      )}

      <FormError message={state.error} />
      <div className="flex gap-2">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 w-1/3"
          >
            Back
          </button>
        )}
        {step < lastStep ? (
          <button type="submit" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900 flex-1">
            Next
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900 flex-1 disabled:opacity-60"
          >
            {pending ? "Registering…" : "Register item"}
          </button>
        )}
      </div>
    </form>
  );
}
