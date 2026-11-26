"use client";
// The place forms (slice P1.12): add or rename a place (name and notes), and
// switch it off or back on. The kind of place is never asked: a new place is
// a building, or the next kind down inside the place it is added to.
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, fieldClass } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { MAX_PLACE_NAME, MAX_PLACE_NOTES } from "@/lib/places/rules";
import { addPlace, savePlace, setPlaceActive, type PlaceFormState } from "./actions";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

export function PlaceForm({
  parentId,
  place,
  kindWord,
  cancelHref,
}: {
  parentId?: string | null;
  place?: { id: string; name: string; notes: string | null };
  kindWord: string;
  cancelHref: string;
}) {
  const act = place ? savePlace.bind(null, place.id) : addPlace.bind(null, parentId ?? null);
  const [state, action, pending] = useActionState<PlaceFormState, FormData>(act, { error: null });
  return (
    <form action={action} className={box} aria-label={place ? `Rename this ${kindWord.toLowerCase()}` : `Add a ${kindWord.toLowerCase()}`}>
      <div>
        <label htmlFor="name" className="font-semibold">
          Name
        </label>
        <p id="name_hint" className="text-sm">
          As it is called in the Centre, for example &ldquo;Main hall&rdquo;, &ldquo;Store 2&rdquo; or &ldquo;Shelf B3&rdquo;. It is printed large on the
          label.
        </p>
        <input
          id="name"
          name="name"
          required
          maxLength={MAX_PLACE_NAME}
          defaultValue={place?.name}
          aria-describedby="name_hint"
          autoComplete="off"
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="notes" className="font-semibold">
          Notes (optional)
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={MAX_PLACE_NOTES} defaultValue={place?.notes ?? ""} className={fieldClass} />
      </div>
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : place ? "Save" : `Add ${kindWord.toLowerCase()}`}
        </button>
        <Link href={cancelHref} className={buttonClass("outline")}>
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** Switch off (or back on). The database refuses while the place still holds things. */
export function SwitchPlace({ placeId, active }: { placeId: string; active: boolean }) {
  const [state, action, pending] = useActionState<PlaceFormState, FormData>(setPlaceActive.bind(null, placeId, !active), { error: null });
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm">
        {active
          ? "Switch off a place that is no longer used. It is never deleted: its history stays, and it can be switched back on. Anything still in it must be moved first."
          : "Switched off: nothing new can be put here. Switch it back on to use it again."}
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass(active ? "danger" : "outline")}>
        {pending ? "Saving…" : active ? "Switch off" : "Switch back on"}
      </button>
    </form>
  );
}
