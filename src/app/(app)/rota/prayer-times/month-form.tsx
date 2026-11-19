"use client";
// The month grid on the Prayer times page: one row per day, a box for each
// prayer, and on Fridays two more for Jumu'ah. Sent all at once; if the
// database refuses, the message names the day and every typed time stays.
import { useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass } from "@/components/ui";
import { cellName, PRAYERS, TIME_KEYS, TIME_LABEL, type DayTimes, type TimeKey } from "@/lib/rota/rules";
import { cx } from "@/lib/ui/text";
import { savePrayerMonth, type MonthFormState } from "../actions";

export type GridDay = { date: string; short: string; full: string; friday: boolean; today: boolean; saved: DayTimes | null };

const box =
  "block min-h-11 w-[6.6rem] rounded-lg border border-[#c9d3cf] bg-white px-1.5 text-base tabular-nums text-icci-text " +
  "hover:border-icci-green/60 focus:border-icci-green focus:outline-3 focus:outline-offset-2 focus:outline-icci-focus";

export function MonthForm({ month, days }: { month: string; days: GridDay[] }) {
  const [state, action, pending] = useActionState<MonthFormState, FormData>(savePrayerMonth.bind(null, month), { error: null, values: null });
  const valueOf = (d: GridDay, k: TimeKey) => state.values?.[cellName(d.date, k)] ?? d.saved?.[k] ?? "";
  const save = (
    <button type="submit" disabled={pending} className={buttonClass("primary")}>
      {pending ? "Saving…" : "Save this month"}
    </button>
  );

  return (
    // A new key after each refusal puts the typed values back into the boxes.
    <form key={JSON.stringify(state.values)} action={action} aria-label="Prayer times for the month" className="mt-4 space-y-4">
      <FormError message={state.error} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-icci-ink-60">Hours and minutes, 24-hour clock. Jumu&rsquo;ah boxes appear on Fridays only.</p>
        {save}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-icci-line bg-white shadow-card">
        <table className="w-full border-collapse text-left">
          <thead className="bg-icci-green-50 text-[13px] font-semibold uppercase tracking-wide text-icci-green-dark">
            <tr>
              <th scope="col" className="px-3 py-3">
                Day
              </th>
              {TIME_KEYS.map((k) => (
                <th key={k} scope="col" className="whitespace-nowrap px-1.5 py-3">
                  {TIME_LABEL[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr
                key={d.date}
                data-testid="prayer-day"
                data-date={d.date}
                className={cx("border-t border-icci-line", d.friday && "bg-icci-gold-100/60", d.today && "outline-2 -outline-offset-2 outline-icci-green")}
              >
                <th scope="row" className="whitespace-nowrap px-3 py-1.5 font-semibold">
                  <span title={d.full}>{d.short}</span>
                  {d.today && <span className="ml-2 text-xs font-bold uppercase text-icci-green">Today</span>}
                  {!d.saved && <span className="sr-only"> (not entered yet)</span>}
                </th>
                {TIME_KEYS.map((k) => (
                  <td key={k} className="px-1.5 py-1.5">
                    {PRAYERS.includes(k as (typeof PRAYERS)[number]) || d.friday ? (
                      <input
                        type="time"
                        step={60}
                        name={cellName(d.date, k)}
                        defaultValue={valueOf(d, k)}
                        aria-label={`${TIME_LABEL[k]} on ${d.full}`}
                        className={box}
                      />
                    ) : (
                      <span aria-hidden className="text-icci-ink-60">
                        —
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">{save}</div>
    </form>
  );
}
