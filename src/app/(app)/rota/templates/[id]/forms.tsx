"use client";
// The Add a template slot form (slice P3.4): day (or several days at once)
// for a week template, slot, times (shifts and on call only), how many
// people, place and a short note. A one-day (Eid) template has no day.
import { useActionState, useState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass } from "@/components/ui";
import type { SlotGroup } from "@/lib/rota/rules";
import { DAY_CHOICES, type TemplateKind } from "@/lib/rota/templates";
import { fieldClass } from "../../../items/ui";
import { addTemplateSlot, type TemplateSlotState } from "../actions";

export type Option = { value: string; label: string };
export type SlotOption = Option & { group: SlotGroup };

export function AddTemplateSlotForm({ templateId, kind, slots, places }: { templateId: string; kind: TemplateKind; slots: SlotOption[]; places: Option[] }) {
  const [state, action, pending] = useActionState<TemplateSlotState, FormData>(addTemplateSlot.bind(null, templateId), { error: null });
  const [slot, setSlot] = useState(slots.find((s) => s.group === "shift")?.value ?? slots[0]?.value ?? "");
  const group = slots.find((s) => s.value === slot)?.group;
  const timed = group === "shift" || group === "on_call";

  return (
    <form action={action} className="space-y-4" aria-label="Add a template slot">
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "week" && (
          <label>
            <span className="font-semibold">Day</span>
            <select name="days" required className={fieldClass} defaultValue="every">
              {DAY_CHOICES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
        )}
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
          <span className="font-semibold">How many people</span>
          <input type="number" name="people_count" min={1} max={20} step={1} defaultValue={1} required className={fieldClass} />
        </label>
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
        <label className="sm:col-span-2">
          <span className="font-semibold">Note</span> <span className="text-icci-ink-60">(optional, printed on the rota)</span>
          <input name="note" maxLength={200} className={fieldClass} dir="auto" />
        </label>
      </div>
      <p className="text-sm text-icci-ink-60">
        {group === "on_call"
          ? "Leave both times empty for on call all day."
          : timed
            ? "A night shift across midnight is two slots: one until 23:59 and one from 00:00 the next day."
            : "Prayer and Jumu'ah slots take their time from Prayer times. Use this for an extra person on a prayer."}
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Adding…" : "Add to the template"}
      </button>
    </form>
  );
}
