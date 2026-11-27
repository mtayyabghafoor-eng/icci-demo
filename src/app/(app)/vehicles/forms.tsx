"use client";
// The vehicle forms (slice P2.7): add or change vehicle details
// (registration, make and model, keeper, "NCT not needed yet"), and record a
// renewal (what, renewed on, valid until; valid until fills itself in a year
// later until the admin changes it).
import { useActionState, useState } from "react";
import { buttonClass, fieldClass, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { KIND_LABEL, MAX_RENEWAL_YEARS, RENEWAL_KINDS, suggestedUntil, type RenewalKind } from "@/lib/vehicles/rules";
import { addVehicle, recordRenewal, saveVehicle, type VehicleFormState } from "./actions";

export type Choice = { id: string; name: string };

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

export function VehicleForm({
  people,
  assets,
  vehicle,
}: {
  people: Choice[];
  assets?: Choice[];
  vehicle?: { id: string; registration: string; make_model: string | null; keeper_person_id: string | null; nct_needed: boolean };
}) {
  const act = vehicle ? saveVehicle.bind(null, vehicle.id) : addVehicle;
  const [state, action, pending] = useActionState<VehicleFormState, FormData>(act, { error: null });
  return (
    <form action={action} className={box} aria-label={vehicle ? "Change vehicle details" : "Register a vehicle"}>
      {assets && (
        <div>
          <label htmlFor="item_id" className="font-semibold">
            Asset
          </label>
          <p id="item_hint" className="text-sm">
            The labelled asset in the &ldquo;Vehicles&rdquo; category.
          </p>
          <select id="item_id" name="item_id" required defaultValue="" aria-describedby="item_hint" className={fieldClass}>
            <option value="" disabled>
              Pick the asset
            </option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label htmlFor="registration" className="font-semibold">
          Registration
        </label>
        <input
          id="registration"
          name="registration"
          required
          maxLength={15}
          defaultValue={vehicle?.registration}
          autoCapitalize="characters"
          className={`${fieldClass} uppercase`}
        />
      </div>
      <div>
        <label htmlFor="make_model" className="font-semibold">
          Make and model (optional)
        </label>
        <input id="make_model" name="make_model" maxLength={100} defaultValue={vehicle?.make_model ?? ""} className={fieldClass} />
      </div>
      <div>
        <label htmlFor="keeper_person_id" className="font-semibold">
          Keeper
        </label>
        <p id="keeper_hint" className="text-sm">
          Who looks after it day to day. Optional.
        </p>
        <select id="keeper_person_id" name="keeper_person_id" aria-describedby="keeper_hint" defaultValue={vehicle?.keeper_person_id ?? ""} className={fieldClass}>
          <option value="">Nobody</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="nct_not_needed" value="yes" defaultChecked={vehicle ? !vehicle.nct_needed : false} className="h-5 w-5" />
        <span>NCT not needed yet (a newer vehicle)</span>
      </label>
      <FormError message={state.error} />
      <SaveBar cancelHref={vehicle ? `/vehicles/${vehicle.id}` : "/vehicles"}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : vehicle ? "Save" : "Register vehicle"}
        </button>
      </SaveBar>
    </form>
  );
}

export function RenewalForm({ vehicleId, today, kind }: { vehicleId: string; today: string; kind: RenewalKind | "" }) {
  const [state, action, pending] = useActionState<VehicleFormState, FormData>(recordRenewal.bind(null, vehicleId), { error: null });
  const [renewed, setRenewed] = useState("");
  const [until, setUntil] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className={box} aria-label="Record a renewal">
      <div>
        <label htmlFor="kind" className="font-semibold">
          What was renewed
        </label>
        <select id="kind" name="kind" required defaultValue={kind} className={fieldClass}>
          <option value="" disabled>
            Pick one
          </option>
          {RENEWAL_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="renewed_on" className="font-semibold">
          Renewed on
        </label>
        <input
          id="renewed_on"
          type="date"
          name="renewed_on"
          required
          max={today}
          value={renewed}
          onChange={(e) => {
            setRenewed(e.target.value);
            if (!touched) setUntil(suggestedUntil(e.target.value));
          }}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="valid_until" className="font-semibold">
          Valid until
        </label>
        <p id="until_hint" className="text-sm">
          Filled in as one year later. Change it to match the disc, certificate or policy (at most {MAX_RENEWAL_YEARS} years).
        </p>
        <input
          id="valid_until"
          type="date"
          name="valid_until"
          required
          min={renewed || undefined}
          aria-describedby="until_hint"
          value={until}
          onChange={(e) => {
            setTouched(true);
            setUntil(e.target.value);
          }}
          className={fieldClass}
        />
      </div>
      <p className="text-sm">Only the dates are kept. Do not upload the disc, certificate or policy document.</p>
      <FormError message={state.error} />
      <SaveBar cancelHref={`/vehicles/${vehicleId}`}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : "Save"}
        </button>
      </SaveBar>
    </form>
  );
}
