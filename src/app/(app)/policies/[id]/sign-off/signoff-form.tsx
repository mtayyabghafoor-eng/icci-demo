"use client";
// Record sign-off: phone-friendly. Tick everyone on one signed sheet, enter
// the date, and add a scan if there is one. Saved together or not at all.
import Link from "next/link";
import { useActionState, useState } from "react";
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
  // D6: a name filter over a long list of tick boxes (people already ticked
  // always stay in view), and the Save button says how many are ticked.
  const [find, setFind] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(ticked ? [ticked] : []));
  const words = find.trim().toLowerCase();
  const shows = (c: Candidate) => !words || picked.has(c.id) || `${c.name} ${c.note ?? ""}`.toLowerCase().includes(words);
  return (
    <form action={action} className="mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card" aria-label="Record sign-off">
      {grid !== null && <input type="hidden" name="grid" value={grid} />}
      <fieldset>
        <legend className="font-semibold">Who signed</legend>
        <p className="text-sm">Tick everyone whose signature is on this sheet.</p>
        {candidates.length > 12 && (
          <label className="mt-3 block max-w-md">
            <span className="text-sm font-semibold text-icci-ink-60">Find a name or section</span>
            <input
              type="search"
              value={find}
              onChange={(e) => setFind(e.target.value)}
              placeholder="Type part of a name"
              className={fieldClass}
              dir="auto"
              data-testid="signoff-find"
            />
          </label>
        )}
        <div className="mt-2 grid gap-1 sm:grid-cols-2" data-testid="signoff-people">
          {candidates.map((c) => (
            <label key={c.id} hidden={!shows(c)} className={`flex min-h-11 items-center gap-3 ${c.isMe ? "opacity-60" : ""}`}>
              <input
                type="checkbox"
                name="people"
                value={c.id}
                disabled={c.isMe}
                defaultChecked={c.id === ticked}
                onChange={(e) =>
                  setPicked((was) => {
                    const next = new Set(was);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
                className="h-5 w-5"
              />
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
          {pending ? "Saving…" : picked.size > 0 ? `Save (${picked.size} ${picked.size === 1 ? "person" : "people"} ticked)` : "Save"}
        </button>
        <Link href={grid !== null ? `/policies/grid${grid ? `?${grid}` : ""}` : `/policies/${policyId}`} className="inline-flex min-h-11 items-center px-2 font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
