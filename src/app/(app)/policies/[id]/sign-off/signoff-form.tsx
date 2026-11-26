"use client";
// Record sign-off: phone-friendly. Tick everyone on one signed sheet, enter
// the date, and add a scan if there is one. Saved together or not at all.
import Link from "next/link";
import { useActionState } from "react";
import { buttonClass, fieldClass } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { recordSignoffs, type SignoffFormState } from "../../signoff-actions";

export type Candidate = { id: string; name: string; note: string | null; isMe: boolean };

export function SignoffForm({
  policyId,
  versionId,
  approvedOn,
  today,
  candidates,
  ticked = null,
  grid = null,
}: {
  policyId: string;
  versionId: string;
  approvedOn: string;
  today: string;
  candidates: Candidate[];
  /** A7: the person whose grid square was clicked starts ticked. */
  ticked?: string | null;
  /** A7: the grid's filter when opened from the grid ("" = no filter); Save and Cancel go back there. */
  grid?: string | null;
}) {
  const [state, action, pending] = useActionState<SignoffFormState, FormData>(recordSignoffs.bind(null, policyId, versionId), { error: null });
  return (
    <form action={action} className="mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card" aria-label="Record sign-off">
      {grid !== null && <input type="hidden" name="grid" value={grid} />}
      <fieldset>
        <legend className="font-semibold">Who signed</legend>
        <p className="text-sm">Tick everyone whose signature is on this sheet.</p>
        <div className="mt-2 grid gap-1 sm:grid-cols-2" data-testid="signoff-people">
          {candidates.map((c) => (
            <label key={c.id} className={`flex min-h-11 items-center gap-3 ${c.isMe ? "opacity-60" : ""}`}>
              <input type="checkbox" name="people" value={c.id} disabled={c.isMe} defaultChecked={c.id === ticked} className="h-5 w-5" />
              <span dir="auto">
                {c.name}
                {c.note && <span className="block text-sm">{c.note}</span>}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="signed_on" className="font-semibold">
          Date signed
        </label>
        <p id="signed_hint" className="text-sm">
          As written on the sheet.
        </p>
        <input id="signed_on" type="date" name="signed_on" required min={approvedOn} max={today} aria-describedby="signed_hint" className={fieldClass} />
      </div>
      <div>
        <label htmlFor="scan" className="font-semibold">
          Scan of the signed sheet (optional)
        </label>
        <p id="scan_hint" className="text-sm">
          A PDF or photo, 6 MB at most. It shows signatures, so only admins can open it.
        </p>
        <input
          id="scan"
          type="file"
          name="scan"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          aria-describedby="scan_hint"
          className={`${fieldClass} py-2.5`}
        />
      </div>
      <FormError message={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href={grid !== null ? `/policies/grid${grid ? `?${grid}` : ""}` : `/policies/${policyId}`} className="inline-flex min-h-11 items-center px-2 font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
