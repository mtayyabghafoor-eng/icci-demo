"use client";
// The asset forms. Phone-first: big boxes, a one-tap camera button.
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { FormError } from "@/app/sign-in/ui";
import { DISPOSAL_ROUTES, ROUTE_LABEL, type DisposalRoute } from "@/lib/assets/disposal";
import { ASSET_ACTIONS, type AssetAction } from "@/lib/assets/rules";
import { PhotoInput } from "../items/photo-input";
import { fieldClass } from "../items/ui";
import { decideDisposal, recordAssetEvent, type AssetFormState } from "./actions";

const none: AssetFormState = { error: null };
const primary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 min-h-12 w-full px-6 text-lg sm:w-auto";

const NOTE_HINT: Record<AssetAction, string> = {
  move: "e.g. Moved for the Friday talk",
  damage: "e.g. One leg is cracked",
  missing: "e.g. Not in its room at the weekly check",
  repaired: "e.g. Leg glued and tested",
  found: "e.g. Found in the store room",
  dispose: "e.g. Beyond repair; collected on Saturday",
};

export function AssetEventForm({
  itemId,
  action,
  places,
  people,
  myPersonId,
  today,
}: {
  itemId: string;
  action: AssetAction;
  places: { id: string; path: string }[];
  /** Switched-on people, in name order. */
  people: { id: string; full_name: string }[];
  /** The signed-in admin's own person record, if their account is linked. */
  myPersonId: string | null;
  /** Today in Dublin, the latest allowed date of a sale. */
  today?: string;
}) {
  const [state, send, pending] = useActionState(recordAssetEvent.bind(null, itemId, action), none);
  // Starts with you if your account is linked (owner's choice, 15 Nov 2026).
  const [who, setWho] = useState(myPersonId ?? "");
  const [route, setRoute] = useState<DisposalRoute | "">("");
  const photo = useRef<File | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (photo.current) data.set("photo", photo.current);
    startTransition(() => send(data));
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white shadow-card p-5">
      {action === "move" && (
        <label className="block">
          <span className="font-semibold">Where is it going?</span>
          <select name="to_location_id" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              Pick a place
            </option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.path}
              </option>
            ))}
          </select>
        </label>
      )}
      {(action === "found" || action === "repaired") && (
        <fieldset>
          <legend className="font-semibold">What condition is it in now?</legend>
          <div className="mt-1 flex gap-3">
            {(["good", "fair"] as const).map((c) => (
              <label
                key={c}
                className="flex min-h-11 flex-1 cursor-pointer items-center gap-2 px-3 rounded-xl border border-[#c9d3cf] bg-white transition-colors duration-150 hover:border-icci-green/60 has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:font-semibold"
              >
                <input type="radio" name="to_condition" value={c} required defaultChecked={c === "good"} />
                {c === "good" ? "Good" : "Fair"}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {action === "dispose" && (
        <fieldset>
          <legend className="font-semibold">How is it leaving?</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {DISPOSAL_ROUTES.map((r) => (
              <label
                key={r}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-[#c9d3cf] bg-white px-3 py-2 transition-colors duration-150 hover:border-icci-green/60 has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:font-semibold"
              >
                <input type="radio" name="disposal_route" value={r} required checked={route === r} onChange={() => setRoute(r)} />
                {ROUTE_LABEL[r]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {action === "dispose" && (route === "charity" || route === "returned_to_owner") && (
        <label className="block">
          <span className="font-semibold">{route === "charity" ? "Name of the charity" : "Owner's name"}</span>
          <input name="disposal_recipient" required maxLength={200} className={fieldClass} dir="auto" />
        </label>
      )}
      {action === "dispose" && route === "sold" && (
        <div className="grid gap-4 sm:grid-cols-2" data-testid="sale-fields">
          <label className="block">
            <span className="font-semibold">Price (€)</span>
            <input name="sale_price" required inputMode="decimal" placeholder="e.g. 25 or 12.50" className={fieldClass} />
          </label>
          <label className="block">
            <span className="font-semibold">Date of sale</span>
            <input name="sale_date" type="date" required max={today} defaultValue={today} className={fieldClass} />
          </label>
          <label className="block">
            <span className="font-semibold">Buyer&apos;s name</span>
            <input name="sale_buyer" required maxLength={200} className={fieldClass} dir="auto" />
          </label>
          <label className="block">
            <span className="font-semibold">Who took the money</span>
            <input name="sale_money_taken_by" required maxLength={200} className={fieldClass} dir="auto" />
          </label>
          <p className="text-sm text-icci-ink-60 sm:col-span-2">A record of the sale only. The money itself is handled as usual by the Centre.</p>
        </div>
      )}
      <label className="block">
        <span className="font-semibold">Note</span>
        <textarea name="note" required rows={3} maxLength={2000} placeholder={NOTE_HINT[action]} className={fieldClass} />
      </label>
      <label className="block">
        <span className="font-semibold">Reported by</span>
        <select name="reported_by_person_id" required value={who} onChange={(e) => setWho(e.target.value)} className={fieldClass}>
          <option value="" disabled>
            Pick a person
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name}
              {p.id === myPersonId ? " (you)" : ""}
            </option>
          ))}
          <option value="other">Someone else (type the name)</option>
        </select>
      </label>
      {who === "other" && (
        <label className="block">
          <span className="font-semibold">Their name</span>
          <input name="reported_by" required maxLength={200} placeholder="e.g. A visitor told reception" className={fieldClass} dir="auto" />
        </label>
      )}
      <PhotoInput label="Photo (optional)" onPhoto={(f) => (photo.current = f)} />
      {action === "dispose" && (
        <p className="rounded-xl border border-icci-line bg-white px-4 py-3">
          A <strong>different admin</strong> must approve this. Until then the asset stays as it is.
        </p>
      )}
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Saving…" : action === "dispose" ? "Send for approval" : ASSET_ACTIONS[action].button}
      </button>
    </form>
  );
}

export function DecideDisposalForm({ eventId }: { eventId: number }) {
  const [state, send, pending] = useActionState(decideDisposal.bind(null, eventId), none);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.name) data.set(submitter.name, submitter.value);
        startTransition(() => send(data));
      }}
      className="mt-3 space-y-3"
    >
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
          Approve disposal
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
