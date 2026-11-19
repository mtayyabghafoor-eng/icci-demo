"use client";
// The two small forms on the Slot types page: add a slot type, and change a
// slot type's name or its "needs Garda vetting" tick. The group and the
// prayer time are chosen once, when it is added. Errors show beside the form.
import { useActionState, useState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass } from "@/components/ui";
import { SLOT_GROUP_LABEL, SLOT_GROUPS, TIME_LABEL, TIMES_FOR_GROUP, type SlotGroup, type SlotType } from "@/lib/rota/rules";
import { fieldClass } from "../../items/ui";
import { addSlotType, saveSlotType, type SlotFormState } from "../actions";

function VettingTick({ id, checked }: { id: string; checked?: boolean }) {
  return (
    <label htmlFor={id} className="flex min-h-11 items-center gap-2.5 font-semibold">
      <input id={id} type="checkbox" name="needs_vetting" defaultChecked={checked} className="h-5 w-5 accent-icci-green-dark" />
      Needs Garda vetting
    </label>
  );
}

export function AddSlotTypeForm() {
  const [state, action, pending] = useActionState<SlotFormState, FormData>(addSlotType, { error: null });
  const [group, setGroup] = useState<SlotGroup>("shift");
  const times = TIMES_FOR_GROUP[group];
  return (
    <form action={action} className="mt-3 space-y-3" aria-label="Add a slot type">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="font-semibold">Name</span>
          <input name="name" required maxLength={60} className={fieldClass} dir="auto" />
        </label>
        <label className="w-44">
          <span className="font-semibold">Group</span>
          <select name="slot_group" value={group} onChange={(e) => setGroup(e.target.value as SlotGroup)} className={fieldClass}>
            {SLOT_GROUPS.map((g) => (
              <option key={g} value={g}>
                {SLOT_GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        {times.length > 0 && (
          <label className="w-44">
            <span className="font-semibold">Prayer time it takes</span>
            <select name="prayer_time" required defaultValue="" className={fieldClass} key={group}>
              <option value="" disabled>
                Pick one
              </option>
              {times.map((k) => (
                <option key={k} value={k}>
                  {TIME_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
        )}
        <VettingTick id="new-needs-vetting" />
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-sm text-icci-ink-60">The group and the prayer time cannot be changed later.</p>
      <FormError message={state.error} />
    </form>
  );
}

export function EditSlotTypeForm({ slot }: { slot: SlotType }) {
  const [state, action, pending] = useActionState<SlotFormState, FormData>(saveSlotType.bind(null, slot.id), { error: null });
  return (
    <form action={action} className="mt-2 space-y-3" aria-label={`Change ${slot.name}`}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1">
          <span className="font-semibold">Name</span>
          <input name="name" required maxLength={60} defaultValue={slot.name} className={fieldClass} dir="auto" />
        </label>
        <VettingTick id={`${slot.id}-needs-vetting`} checked={slot.needs_vetting} />
        <button type="submit" disabled={pending} className={buttonClass("secondary")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <FormError message={state.error} />
    </form>
  );
}
