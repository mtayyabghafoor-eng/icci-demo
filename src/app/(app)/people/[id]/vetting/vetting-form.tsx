"use client";
// Record vetting: phone-friendly, three fields (what happened, the date, and
// for a vetting the expiry). The expiry fills itself in as 3 years after the
// vetted date; the admin can change it for this person.
import { useActionState, useState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { defaultExpiry, isDate, VETTING_KIND_LABEL, VETTING_YEARS, type VettingKind } from "@/lib/vetting/rules";
import { recordVetting, type VettingFormState } from "../../vetting-actions";
import { fieldClass, SaveBar } from "@/components/ui";

const KINDS: VettingKind[] = ["vetted", "applied", "not_required"];

export function VettingForm({ personId, today }: { personId: string; today: string }) {
  const [state, action, pending] = useActionState<VettingFormState, FormData>(recordVetting.bind(null, personId), { error: null });
  const [kind, setKind] = useState<VettingKind | "">("");
  const [date, setDate] = useState("");
  const [expiry, setExpiry] = useState("");
  const [expiryTouched, setExpiryTouched] = useState(false);

  function changeDate(value: string) {
    setDate(value);
    if (!expiryTouched) setExpiry(isDate(value) ? defaultExpiry(value) : "");
  }

  return (
    <form action={action} className="mt-4 space-y-5 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      <fieldset>
        <legend className="font-semibold">What happened?</legend>
        <div className="mt-2 grid gap-2">
          {KINDS.map((k) => (
            <label key={k} className="flex min-h-11 items-center gap-3 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3">
              <input type="radio" name="kind" value={k} required checked={kind === k} onChange={() => setKind(k)} className="h-5 w-5" />
              <span>{VETTING_KIND_LABEL[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="happened_on" className="font-semibold">
          Date
        </label>
        <p id="happened_on_hint" className="text-sm">
          {kind === "applied" ? "When the application was sent." : kind === "vetted" ? "The date on the vetting outcome." : "When this was decided."}
        </p>
        <input
          id="happened_on"
          aria-describedby="happened_on_hint"
          type="date"
          name="happened_on"
          required
          max={today}
          value={date}
          onChange={(e) => changeDate(e.target.value)}
          className={fieldClass}
        />
      </div>

      {kind === "vetted" && (
        <div>
          <label htmlFor="expires_on" className="font-semibold">
            Expires on
          </label>
          <p id="expires_on_hint" className="text-sm">
            Filled in as {VETTING_YEARS} years after the vetted date. Change it if this person needs a different period.
          </p>
          <input
            id="expires_on"
            aria-describedby="expires_on_hint"
            type="date"
            name="expires_on"
            required
            min={date || undefined}
            value={expiry}
            onChange={(e) => {
              setExpiryTouched(true);
              setExpiry(e.target.value);
            }}
            className={fieldClass}
          />
        </div>
      )}

      <p className="text-sm">Only the status and dates are kept. Do not write down or upload the disclosure itself.</p>
      <FormError message={state.error} />
      <SaveBar cancelHref={`/people/${personId}`}>
        <button type="submit" disabled={pending} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 px-6">
          {pending ? "Saving…" : "Save"}
        </button>
      </SaveBar>
    </form>
  );
}
