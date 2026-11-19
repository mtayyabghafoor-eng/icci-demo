"use client";
// The stock forms. Phone-first: big boxes, a number keypad, three fields or fewer.
import { startTransition, useActionState, type FormEvent } from "react";
import { FormError } from "@/app/sign-in/ui";
import { decideCorrection, recordOne, recordWeeklyCount, requestCorrection, type StockFormState } from "./actions";
import { Stepper } from "@/components/ui/stepper";
import { fieldClass } from "../items/ui";

const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 min-h-12 w-full px-6 text-lg sm:w-auto";
const none: StockFormState = { error: null };

/** Sends the form without React clearing it, so typed numbers survive a problem. */
function keep(action: (data: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    startTransition(() => action(data));
  };
}

function NumberBox(props: { name: string; label: string; unit: string; autoFocus?: boolean; min?: number }) {
  return (
    <label className="block">
      <span className="font-semibold">{props.label}</span>
      <span className="mt-2 flex flex-wrap items-center gap-3">
        <Stepper name={props.name} required min={props.min ?? 0} autoFocus={props.autoFocus} />
        <span className="text-lg">{props.unit}</span>
      </span>
    </label>
  );
}

/** "Count this shelf" or "Add stock" for one item. */
export function QuantityForm({ itemId, kind, unit }: { itemId: string; kind: "count" | "restock"; unit: string }) {
  const [state, action, pending] = useActionState(recordOne.bind(null, itemId, kind), none);
  return (
    <form onSubmit={keep(action)} className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      <NumberBox
        name="quantity"
        label={kind === "count" ? "How many are on the shelf now?" : "How many are you adding?"}
        unit={unit}
        min={kind === "restock" ? 1 : 0}
        autoFocus
      />
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Saving…" : kind === "count" ? "Save count" : "Add stock"}
      </button>
    </form>
  );
}

export function CorrectionForm({ itemId, entryId, unit }: { itemId: string; entryId: number; unit: string }) {
  const [state, action, pending] = useActionState(requestCorrection.bind(null, itemId, entryId), none);
  return (
    <form onSubmit={keep(action)} className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      <NumberBox name="quantity" label="What should the number have been?" unit={unit} autoFocus />
      <label className="block">
        <span className="font-semibold">Reason</span>
        <textarea name="reason" required rows={3} maxLength={1000} placeholder="e.g. Typed 10 instead of 12" className={fieldClass} />
      </label>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Sending…" : "Send for approval"}
      </button>
    </form>
  );
}

export function DecideForm({ adjustmentId }: { adjustmentId: number }) {
  const [state, action, pending] = useActionState(decideCorrection.bind(null, adjustmentId), none);
  return (
    <form onSubmit={keep(action)} className="mt-3 space-y-3">
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

export type CountRow = { itemId: string; name: string; label: string; place: string; unit: string; lastQuantity: number | null };

/** The weekly count: one box per shelf item. Empty boxes are skipped. */
export function WeeklyCountForm({ roomId, rows }: { roomId: string; rows: CountRow[] }) {
  const [state, action, pending] = useActionState(recordWeeklyCount.bind(null, roomId), none);
  return (
    <form onSubmit={keep(action)} className="mt-4">
      <ol className="space-y-2">
        {rows.map((r) => {
          const problem = state.fieldErrors?.[r.itemId];
          return (
            <li key={r.itemId} id={`row-${r.label}`} className="rounded-2xl border border-icci-line bg-white shadow-card p-4">
              <label className="grid items-center gap-x-3 gap-y-1 sm:grid-cols-[1fr_auto]">
                <span>
                  <span className="block font-semibold">{r.name}</span>
                  <span className="block text-sm">
                    {r.label} · {r.place} · now: {r.lastQuantity == null ? "not counted yet" : `${r.lastQuantity} ${r.unit}`}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <Stepper
                    name={`qty:${r.itemId}`}
                    aria-label={`Count of ${r.name} (${r.label})`}
                    what={r.name}
                    min={0}
                    enterKeyHint="next"
                    aria-invalid={problem ? true : undefined}
                    className={problem ? "border-icci-error!" : undefined}
                  />
                  <span className="w-14 text-sm">{r.unit}</span>
                </span>
              </label>
              {problem && <p className="mt-1 text-sm text-icci-error">{problem}</p>}
            </li>
          );
        })}
      </ol>
      <div className="sticky bottom-0 mt-4 space-y-2 border-t-2 border-icci-gold bg-icci-page py-3">
        <FormError message={state.error} />
        <button type="submit" disabled={pending} className={primary}>
          {pending ? "Saving…" : "Save count"}
        </button>
      </div>
    </form>
  );
}
