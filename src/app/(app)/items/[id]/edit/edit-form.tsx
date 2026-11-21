"use client";
// Edit an item's details (designed for a PC). Location, condition, kind and
// label are not on this form: the database refuses changes to them here.
import { useActionState, useRef, startTransition } from "react";
import { FormError } from "@/app/sign-in/ui";
import type { CategoryGroup } from "@/lib/categories/rules";
import { CategoryOptions } from "../../../categories/options";
import { updateItem, type ItemFormState } from "../../actions";
import type { ItemRow } from "../../data";
import { PhotoInput } from "../../photo-input";
import { fieldClass } from "../../ui";

export function EditForm({ item, categoryGroups }: { item: ItemRow; categoryGroups: CategoryGroup[] }) {
  const [state, action, pending] = useActionState<ItemFormState, FormData>(updateItem.bind(null, item.id), { error: null });
  const photo = useRef<File | null>(null);

  return (
    <form
      className="mt-4 grid gap-4 rounded-2xl border border-icci-line bg-white shadow-card p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (photo.current) data.set("photo", photo.current);
        startTransition(() => action(data));
      }}
    >
      <label className="block sm:col-span-2">
        <span className="font-semibold">Name</span>
        <input name="name" required maxLength={200} defaultValue={item.name} className={fieldClass} />
      </label>
      <label className="block">
        <span className="font-semibold">Category</span>
        <select name="category_id" required defaultValue={item.category_id} className={fieldClass}>
          <CategoryOptions groups={categoryGroups} />
        </select>
      </label>

      {item.kind === "fixed_asset" ? (
        <>
          <label className="block">
            <span className="font-semibold">Value (euros)</span>
            <input
              name="value"
              inputMode="decimal"
              placeholder="e.g. 125.50"
              defaultValue={item.value_cents == null ? "" : (item.value_cents / 100).toFixed(2)}
              className={fieldClass}
            />
          </label>
          <label className="block">
            <span className="font-semibold">Purchase date</span>
            <input name="purchase_date" type="date" defaultValue={item.purchase_date ?? ""} className={fieldClass} />
          </label>
          <label className="block">
            <span className="font-semibold">Warranty end</span>
            <input name="warranty_end" type="date" defaultValue={item.warranty_end ?? ""} className={fieldClass} />
          </label>
        </>
      ) : (
        <>
          <label className="block">
            <span className="font-semibold">Counted in (unit)</span>
            <input name="unit" required maxLength={40} defaultValue={item.unit ?? ""} className={fieldClass} />
          </label>
          <label className="block">
            <span className="font-semibold">Minimum level</span>
            <input
              name="minimum_level"
              required
              type="number"
              min={0}
              step={1}
              defaultValue={item.minimum_level ?? 0}
              className={fieldClass}
            />
          </label>
        </>
      )}

      <label className="block sm:col-span-2">
        <span className="font-semibold">Notes</span>
        <textarea name="notes" rows={3} maxLength={2000} defaultValue={item.notes ?? ""} className={fieldClass} />
      </label>
      <div className="sm:col-span-2">
        <PhotoInput label={item.photo_path ? "Replace the photo (the old one is kept)" : "Add a photo"} onPhoto={(f) => (photo.current = f)} />
      </div>
      <div className="sm:col-span-2">
        <FormError message={state.error} />
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 px-6"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
