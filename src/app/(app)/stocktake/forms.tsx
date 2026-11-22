"use client";
// The stocktake forms. Scanning screens are phone-first: big buttons, one tap
// for "Seen here", a number keypad for shelves.
import { BarcodeCamera } from "@/components/shell/camera-scanner";
import { Stepper } from "@/components/ui/stepper";
import { labelFromScan } from "@/lib/items/scan";
import { startTransition, useActionState, type FormEvent } from "react";
import { FormError } from "@/app/sign-in/ui";
import { fieldClass } from "../items/ui";
import {
  decideDifference,
  openLabel,
  recordScan,
  startStocktake,
  submitStocktake,
  type StocktakeFormState,
} from "./actions";

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 min-h-12 w-full px-6 text-lg sm:w-auto";
const none: StocktakeFormState = { error: null };

/** Sends the form without React clearing it, so typed text survives a problem. */
function keep(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    startTransition(() => action(data));
  };
}

export function StartForm({ rooms }: { rooms: { id: string; path: string; busy: boolean }[] }) {
  const [state, action, pending] = useActionState(startStocktake, none);
  return (
    <form onSubmit={keep(action)} className="mt-3 space-y-3 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      <label className="block">
        <span className="font-semibold">Room</span>
        <select name="room" required defaultValue="" className={fieldClass}>
          <option value="" disabled>
            Pick a room
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id} disabled={r.busy}>
              {r.path}
              {r.busy ? " (already under way)" : ""}
            </option>
          ))}
        </select>
      </label>
      <p className="text-sm">Everything in the room is included: its store rooms and their shelves too.</p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Starting…" : "Start the stocktake"}
      </button>
    </form>
  );
}

/**
 * The camera inside the app (owner's report 21 Nov 2026: during a stocktake
 * the camera did not open). Each label it reads opens straight in this
 * stocktake, like a typed number. Shown where the browser can read codes
 * (Chrome on Android); elsewhere the phone's own Camera app still works.
 */
export function StocktakeCamera({ stocktakeId }: { stocktakeId: number }) {
  return (
    <BarcodeCamera
      target={{
        formats: ["qr_code"],
        accept: labelFromScan,
        hrefFor: (label) => `/stocktake/${stocktakeId}/scan?label=${label}`,
        title: "Scan the next label",
        hint: "Point the camera at the square code on the item's or shelf's label.",
        wrongCode: "That code is not an ICCI item label. Point the camera at the square code on an item label.",
        testId: "stocktake-camera",
      }}
    />
  );
}

export function LabelBox({ stocktakeId }: { stocktakeId: number }) {
  const [state, action, pending] = useActionState(openLabel.bind(null, stocktakeId), none);
  return (
    <form onSubmit={keep(action)} className="space-y-2">
      <label className="block">
        <span className="font-semibold">Or type a label number</span>
        <span className="mt-1 flex gap-2">
          <input name="label" required autoComplete="off" placeholder="e.g. ICCI-000123 or 123" className={`${fieldClass} mt-0!`} />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! shadow-sm no-underline transition-colors duration-150 hover:bg-icci-green-900 shrink-0 disabled:opacity-60"
          >
            Open
          </button>
        </span>
      </label>
      <FormError message={state.error} />
    </form>
  );
}

export function ScanForm(props: {
  stocktakeId: number;
  serial: string;
  kind: "fixed_asset" | "consumable" | "unknown";
  unit?: string;
}) {
  const [state, action, pending] = useActionState(recordScan.bind(null, props.stocktakeId, props.serial, props.kind), none);
  return (
    <form onSubmit={keep(action)} className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      {props.kind === "consumable" && (
        <label className="block">
          <span className="font-semibold">How many are on the shelf?</span>
          <span className="mt-2 flex flex-wrap items-center gap-3">
            <Stepper name="quantity" required min={0} autoFocus />
            <span className="text-lg">{props.unit}</span>
          </span>
        </label>
      )}
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending
          ? "Saving…"
          : props.kind === "fixed_asset"
            ? "Seen here"
            : props.kind === "consumable"
              ? "Save number"
              : "Note this label"}
      </button>
    </form>
  );
}

export function SendForm({ stocktakeId, differences }: { stocktakeId: number; differences: number }) {
  const [state, action, pending] = useActionState(submitStocktake.bind(null, stocktakeId), none);
  return (
    <form action={action} className="sticky bottom-0 mt-6 space-y-2 border-t-2 border-icci-gold bg-icci-page py-3">
      <p>
        {differences === 0
          ? "No differences: sending closes the stocktake. Nothing changes."
          : `Sending closes the stocktake. The ${differences === 1 ? "difference waits" : `${differences} differences wait`} for a different admin to approve. Nothing changes until then.`}
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Sending…" : "Send for approval"}
      </button>
    </form>
  );
}

export function DecideDifferenceForm({
  stocktakeId,
  differenceId,
  askCondition = false,
}: {
  stocktakeId: number;
  differenceId: number;
  /** A "found" difference: the approver says what condition the asset is in now. */
  askCondition?: boolean;
}) {
  const [state, action, pending] = useActionState(decideDifference.bind(null, stocktakeId, differenceId), none);
  return (
    <form onSubmit={keep(action)} className="mt-3 space-y-3">
      {askCondition && (
        <fieldset>
          <legend className="font-semibold">
            Condition now <span className="text-sm font-normal">(needed if you approve)</span>
          </legend>
          <div className="mt-1 flex flex-wrap gap-2">
            {(["good", "fair"] as const).map((c) => (
              <label key={c} className="flex min-h-11 items-center gap-2 px-4 rounded-xl border border-[#c9d3cf] bg-white transition-colors duration-150 hover:border-icci-green/60 has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:font-semibold">
                <input type="radio" name="found_condition" value={c} />
                {c === "good" ? "Good" : "Fair"}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label className="block">
        <span className="font-semibold">Note</span> <span className="text-sm">(needed if you reject)</span>
        <input name="note" maxLength={1000} className={fieldClass} />
      </label>
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 px-5"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={pending}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-error/50 bg-white px-5 py-2 font-semibold text-icci-error! transition-colors duration-150 hover:border-icci-error hover:bg-[var(--icci-bad-fill)] disabled:opacity-60"
        >
          Reject
        </button>
      </div>
    </form>
  );
}
