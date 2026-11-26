"use client";
// Record training: phone-friendly, three fields (type, date done, expiry).
// The expiry fills itself in from the type's usual length; the admin can
// change it, or empty it for training that does not expire.
import Link from "next/link";
import { useActionState, useState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { suggestedExpiry, usualLengthText, type TrainingType } from "@/lib/training/rules";
import { recordTraining, type TrainingFormState } from "../../training-actions";
import { fieldClass } from "@/components/ui";

export function TrainingForm({ personId, today, types }: { personId: string; today: string; types: TrainingType[] }) {
  const [state, action, pending] = useActionState<TrainingFormState, FormData>(recordTraining.bind(null, personId), { error: null });
  const [typeId, setTypeId] = useState("");
  const [date, setDate] = useState("");
  const [expiry, setExpiry] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);
  const type = types.find((t) => t.id === typeId) ?? null;

  function refill(nextType: TrainingType | null, nextDate: string) {
    if (!expiryTouched) setExpiry(suggestedExpiry(nextDate, nextType?.usual_years ?? null));
  }

  if (types.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-icci-line bg-white p-5 shadow-card">
        No training types are switched on. Add one on the <Link href="/people/training/types">Training types</Link> page first.
      </p>
    );
  }

  return (
    <form action={action} className="mt-4 space-y-5 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      <div>
        <label htmlFor="training_type_id" className="font-semibold">
          Training
        </label>
        <select
          id="training_type_id"
          name="training_type_id"
          required
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            refill(types.find((t) => t.id === e.target.value) ?? null, date);
          }}
          className={fieldClass}
        >
          <option value="" disabled>
            Pick the training
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {type && <p className="mt-1 text-sm">{usualLengthText(type.usual_years)}.</p>}
      </div>

      <div>
        <label htmlFor="completed_on" className="font-semibold">
          Date done
        </label>
        <p id="completed_on_hint" className="text-sm">
          The day the course was finished, as on the certificate.
        </p>
        <input
          id="completed_on"
          aria-describedby="completed_on_hint"
          type="date"
          name="completed_on"
          required
          max={today}
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            refill(type, e.target.value);
          }}
          className={fieldClass}
        />
      </div>

      <div>
        <label htmlFor="expires_on" className="font-semibold">
          Expires on
        </label>
        <p id="expires_on_hint" className="text-sm">
          Filled in from the usual length. Change it if this certificate says otherwise, or leave it empty if it does not expire.
        </p>
        <input
          id="expires_on"
          aria-describedby="expires_on_hint"
          type="date"
          name="expires_on"
          min={date || undefined}
          value={expiry}
          onChange={(e) => {
            setExpiryTouched(true);
            setExpiry(e.target.value);
          }}
          className={fieldClass}
        />
      </div>

      <p className="text-sm">Only the type and dates are kept. Do not upload the certificate itself.</p>
      <FormError message={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 px-6">
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href={`/people/${personId}`} className="inline-flex min-h-11 items-center px-2 font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
