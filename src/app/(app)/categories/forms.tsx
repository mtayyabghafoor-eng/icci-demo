"use client";
// The category forms (slice P1.17): add or rename a category, move a
// sub-category to another main category, and switch a category off or back
// on. Nothing is ever deleted.
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { CATEGORY_ICON_KEYS, CATEGORY_ICON_WORDS } from "@/lib/categories/icons";
import { MAX_CATEGORY_NAME } from "@/lib/categories/rules";
import { fieldClass } from "../items/ui";
import { addCategory, saveCategory, setCategoryActive, type CategoryFormState } from "./actions";
import { CategoryIcon } from "./icon";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

export function CategoryForm({
  parentId,
  category,
  mains,
  isSub,
  cancelHref,
}: {
  /** Adding: the main category it goes inside (null for a new main category). */
  parentId?: string | null;
  /** Renaming: the category as it is now. */
  category?: { id: string; name: string; parent_id: string | null; icon?: string };
  /** Renaming a sub-category: the main categories it may move to. */
  mains?: { id: string; name: string }[];
  isSub: boolean;
  cancelHref: string;
}) {
  const act = category ? saveCategory.bind(null, category.id) : addCategory.bind(null, parentId ?? null);
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(act, { error: null });
  const word = isSub ? "sub-category" : "main category";
  return (
    <form action={action} className={box} aria-label={category ? `Rename this ${word}` : `Add a ${word}`}>
      <div>
        <label htmlFor="name" className="font-semibold">
          Name
        </label>
        <p id="name_hint" className="text-sm">
          {isSub
            ? "The kind of thing, in plain words, for example “Lawnmowers” or “Air conditioners”. Each name is used once in the whole list."
            : "A broad group, for example “Kitchen and catering”. Each name is used once in the whole list."}
        </p>
        <input
          id="name"
          name="name"
          required
          maxLength={MAX_CATEGORY_NAME}
          defaultValue={category?.name}
          aria-describedby="name_hint"
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      {!isSub && (
        <fieldset>
          <legend className="font-semibold">Picture</legend>
          <p className="text-sm">Shown on the category&apos;s tile, always with its name.</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {CATEGORY_ICON_KEYS.map((key) => (
              <label
                key={key}
                className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-[#c9d3cf] bg-white px-3 has-[:checked]:border-icci-green-dark has-[:checked]:bg-icci-green-50"
              >
                <input type="radio" name="icon" value={key} defaultChecked={(category?.icon ?? "other") === key} className="accent-icci-green-dark" />
                <CategoryIcon icon={key} size={20} className="text-icci-green-dark" />
                <span className="text-sm">{CATEGORY_ICON_WORDS[key]}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {category && isSub && mains && (
        <div>
          <label htmlFor="parent_id" className="font-semibold">
            Main category
          </label>
          <p id="parent_hint" className="text-sm">
            Every item in it moves along with it. The audit log keeps the change.
          </p>
          <select id="parent_id" name="parent_id" defaultValue={category.parent_id ?? ""} aria-describedby="parent_hint" className={fieldClass}>
            {mains.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : category ? "Save" : `Add ${word}`}
        </button>
        <Link href={cancelHref} className={buttonClass("outline")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Switch off (or back on). The database refuses a main category whose sub-categories are still on. */
export function SwitchCategory({ categoryId, active, isSub }: { categoryId: string; active: boolean; isSub: boolean }) {
  const [state, action, pending] = useActionState<CategoryFormState, FormData>(setCategoryActive.bind(null, categoryId, !active), { error: null });
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm">
        {active
          ? isSub
            ? "Switch off a sub-category that is no longer used. Items already in it keep it, but new items cannot be put in it. It is never deleted and can be switched back on."
            : "Switch off a main category that is no longer used. Switch off its sub-categories first. It is never deleted and can be switched back on."
          : "Switched off: new items cannot be put here. Switch it back on to use it again."}
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass(active ? "danger" : "outline")}>
        {pending ? "Saving…" : active ? "Switch off" : "Switch back on"}
      </button>
    </form>
  );
}
