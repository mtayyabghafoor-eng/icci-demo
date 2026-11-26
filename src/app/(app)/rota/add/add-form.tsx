"use client";
// The Add a slot form: day, slot, place (optional), times (shifts and on
// call only; prayers take theirs from Prayer times) and a short note.
import { useActionState, useState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass, fieldClass } from "@/components/ui";
import type { SlotGroup } from "@/lib/rota/rules";
import { addSlot, type AddSlotState } from "../week-actions";

export type Option = { value: string; label: string };
export type SlotOption = Option & { group: SlotGroup };

export function AddSlotForm({
  weekId,
  monday,
  days,
  slots,
  places,
}: {
  weekId: string;
  monday: string;
  days: Option[];
  slots: SlotOption[];
  places: Option[];
}) {
  const [state, action, pending] = useActionState<AddSlotState, FormData>(addSlot.bind(null, weekId, monday), { error: null });
  const [slot, setSlot] = useState(slots.find((s) => s.group === "shift")?.value ?? slots[0]?.value ?? "");
  const group = slots.find((s) => s.value === slot)?.group;
  const timed = group === "shift" || group === "on_call";

  return (
    <form action={action} className="space-y-4" aria-label="Add a slot">
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="font-semibold">Day</span>
          <select name="assignment_date" required className={fieldClass} defaultValue={days[0]?.value}>
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Slot</span>
          <select name="slot_type_id" required className={fieldClass} value={slot} onChange={(e) => setSlot(e.target.value)}>
            {slots.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        {timed && (
          <>
            <label>
              <span className="font-semibold">Start time</span>
              <input type="time" step={60} name="start_time" required={group === "shift"} className={fieldClass} />
            </label>
            <label>
              <span className="font-semibold">End time</span>
              <input type="time" step={60} name="end_time" required={group === "shift"} className={fieldClass} />
            </label>
          </>
        )}
        <label>
          <span className="font-semibold">Place</span> <span className="text-icci-ink-60">(optional)</span>
          <select name="location_id" className={fieldClass} defaultValue="">
            <option value="">No particular place</option>
            {places.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="font-semibold">Note</span> <span className="text-icci-ink-60">(optional)</span>
          <input name="note" maxLength={200} className={fieldClass} dir="auto" />
        </label>
      </div>
      <p className="text-sm text-icci-ink-60">
        {group === "on_call"
          ? "Leave both times empty for on call all day."
          : timed
            ? "A night shift across midnight is two slots: one until 23:59 and one from 00:00 the next day."
            : "Prayer and Jumu'ah slots take their time from Prayer times."}
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Adding…" : "Add the slot"}
      </button>
    </form>
  );
}
