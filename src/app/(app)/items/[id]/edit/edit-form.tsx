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

type Choice = { id: string; name: string };

function Pick({ name, label, choices, value, empty, wide = false }: { name: string; label: string; choices: Choice[]; value: string | null; empty: string; wide?: boolean }) {
  return (
    <label className={wide ? "block sm:col-span-2" : "block"}>
      <span className="font-semibold">{label}</span>
      <select name={name} defaultValue={value ?? ""} className={fieldClass}>
        <option value="">{empty}</option>
        {choices.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EditForm({
  item,
  categoryGroups,
  models,
  companies,
}: {
  item: ItemRow;
  categoryGroups: CategoryGroup[];
  /** P1.19: "Maker · Model" choices and company choices. */
  models: Choice[];
  companies: Choice[];
}) {
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

      {/* P1.19: make, model and who looks after it. */}
      <p className="sm:col-span-2 mt-2 border-t border-icci-line pt-4 font-bold text-icci-green-dark">Make, model and who looks after it</p>
      {item.kind === "fixed_asset" && (
        <>
          <Pick name="model_id" label="Make and model" choices={models} value={item.model_id} empty="Not recorded" />
          <label className="block">
            <span className="font-semibold">Maker&apos;s serial number</span>
            <input name="maker_serial" maxLength={80} defaultValue={item.maker_serial ?? ""} className={fieldClass} placeholder="From the maker's plate" />
          </label>
        </>
      )}
      <Pick name="supplier_company_id" label="Supplied by" choices={companies} value={item.supplier_company_id} empty="Not recorded" />
      {item.kind === "fixed_asset" && (
        <Pick name="service_company_id" label="Serviced by (this item only)" choices={companies} value={item.service_company_id} empty="Use the model's or category's" />
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
