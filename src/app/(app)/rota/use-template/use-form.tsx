"use client";
// One "Use this template" button (slice P3.4). For an Eid template it asks
// which day of the week is Eid. The database checks everything again.
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass } from "@/components/ui";
import { fieldClass } from "../../items/ui";
import { applyTemplate, type UseTemplateState } from "../templates/actions";

export function UseTemplateForm({
  weekId,
  monday,
  templateId,
  name,
  days,
  disabledReason,
}: {
  weekId: string;
  monday: string;
  templateId: string;
  name: string;
  /** The week's days, for an Eid template; empty for a week template. */
  days: { value: string; label: string }[];
  disabledReason: string | null;
}) {
  const [state, action, pending] = useActionState<UseTemplateState, FormData>(applyTemplate.bind(null, weekId, monday, templateId), { error: null });
  return (
    <form action={action} className="mt-3 space-y-3" aria-label={`Use ${name}`}>
      {days.length > 0 && (
        <label className="block max-w-xs">
          <span className="font-semibold">Which day is Eid?</span>
          <select name="on_day" required className={fieldClass} defaultValue="" disabled={!!disabledReason}>
            <option value="" disabled>
              Pick the day
            </option>
            {days.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <FormError message={state.error} />
      {disabledReason ? (
        <p className="text-[15px] text-icci-ink-60">{disabledReason}</p>
      ) : (
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding the slots…" : `Use ${name}`}
        </button>
      )}
    </form>
  );
}
