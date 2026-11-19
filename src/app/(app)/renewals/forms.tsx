"use client";
// The renewal forms (slice P2.8): add a renewal or change its details
// (title, category, owner, documents needed, notes; a new one also has its
// first due date), and "Mark renewed" (renewed on, next due; next due fills
// itself in a year later until the admin changes it).
import Link from "next/link";
import { useActionState, useState } from "react";
import { buttonClass } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { CATEGORIES, MAX_DUE_YEARS, suggestedNextDue } from "@/lib/renewals/rules";
import { fieldClass } from "../items/ui";
import { addRenewal, markRenewed, saveRenewal, type RenewalFormState } from "./actions";

export type Choice = { id: string; name: string };

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

export type RenewalDetails = {
  id: string;
  title: string;
  category: string;
  owner_person_id: string | null;
  documents_needed: string | null;
  notes: string | null;
};

export function RenewalForm({ people, renewal }: { people: Choice[]; renewal?: RenewalDetails }) {
  const act = renewal ? saveRenewal.bind(null, renewal.id) : addRenewal;
  const [state, action, pending] = useActionState<RenewalFormState, FormData>(act, { error: null });
  return (
    <form action={action} className={box} aria-label={renewal ? "Change renewal details" : "Add a renewal"}>
      <div>
        <label htmlFor="title" className="font-semibold">
          What needs renewing
        </label>
        <p id="title_hint" className="text-sm">
          For example &ldquo;Building insurance&rdquo; or &ldquo;Lift safety inspection&rdquo;.
        </p>
        <input id="title" name="title" required maxLength={150} dir="auto" defaultValue={renewal?.title} aria-describedby="title_hint" className={fieldClass} />
      </div>
      <div>
        <label htmlFor="category" className="font-semibold">
          Category
        </label>
        <select id="category" name="category" required defaultValue={renewal?.category ?? ""} className={fieldClass}>
          <option value="" disabled>
            Pick one
          </option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {!renewal && (
        <div>
          <label htmlFor="due_on" className="font-semibold">
            Due date
          </label>
          <p id="due_hint" className="text-sm">
            When it must be renewed by. It may already have passed (at most {MAX_DUE_YEARS} years ahead).
          </p>
          <input id="due_on" type="date" name="due_on" required aria-describedby="due_hint" className={fieldClass} />
        </div>
      )}
      <div>
        <label htmlFor="owner_person_id" className="font-semibold">
          Owner
        </label>
        <p id="owner_hint" className="text-sm">
          Who makes sure it is renewed. Optional.
        </p>
        <select id="owner_person_id" name="owner_person_id" aria-describedby="owner_hint" defaultValue={renewal?.owner_person_id ?? ""} className={fieldClass}>
          <option value="">Nobody</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="documents_needed" className="font-semibold">
          Documents needed (optional)
        </label>
        <p id="docs_hint" className="text-sm">
          What to have ready, for example &ldquo;last inspection report&rdquo;. Only the list, not the documents.
        </p>
        <textarea
          id="documents_needed"
          name="documents_needed"
          rows={3}
          maxLength={1000}
          dir="auto"
          defaultValue={renewal?.documents_needed ?? ""}
          aria-describedby="docs_hint"
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="notes" className="font-semibold">
          Notes (optional)
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={2000} dir="auto" defaultValue={renewal?.notes ?? ""} className={fieldClass} />
      </div>
      <FormError message={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : renewal ? "Save" : "Add renewal"}
        </button>
        <Link href={renewal ? `/renewals/${renewal.id}` : "/renewals"} className="inline-flex min-h-11 items-center px-2 font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function RenewedForm({ renewalId, today }: { renewalId: string; today: string }) {
  const [state, action, pending] = useActionState<RenewalFormState, FormData>(markRenewed.bind(null, renewalId), { error: null });
  const [renewed, setRenewed] = useState("");
  const [due, setDue] = useState("");
  const [touched, setTouched] = useState(false);
  return (
    <form action={action} className={box} aria-label="Mark renewed">
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
            if (!touched) setDue(suggestedNextDue(e.target.value));
          }}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="due_on" className="font-semibold">
          Next due
        </label>
        <p id="next_hint" className="text-sm">
          Filled in as one year later. Change it to match the new certificate or contract.
        </p>
        <input
          id="due_on"
          type="date"
          name="due_on"
          required
          min={renewed || undefined}
          aria-describedby="next_hint"
          value={due}
          onChange={(e) => {
            setTouched(true);
            setDue(e.target.value);
          }}
          className={fieldClass}
        />
      </div>
      <FormError message={state.error} />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : "Save"}
        </button>
        <Link href={`/renewals/${renewalId}`} className="inline-flex min-h-11 items-center px-2 font-semibold">
          Cancel
        </Link>
      </div>
    </form>
  );
}
