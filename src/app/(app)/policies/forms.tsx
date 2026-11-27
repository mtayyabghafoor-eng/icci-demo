"use client";
// The policy forms (slice P2.5): add or change a policy (title, owner and,
// when adding, who must sign), and upload or change a draft version (name,
// approval date, next review date, PDF). The next review date fills itself
// in as one year after approval until the admin changes it.
import { useActionState, useState } from "react";
import { buttonClass, fieldClass, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { MAX_REVIEW_YEARS, REVIEW_YEARS, suggestedReview } from "@/lib/policies/rules";
import { addPolicy, savePolicy, saveDraft, uploadVersion, type PolicyFormState } from "./actions";

export type Choice = { id: string; name: string };

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

export function RoleBoxes({ roles, picked, quiet = false }: { roles: Choice[]; picked: Set<string>; quiet?: boolean }) {
  return (
    <fieldset>
      <legend className={quiet ? "sr-only" : "font-semibold"}>Who must sign it</legend>
      <p className="text-sm">Everyone switched on with a ticked role must sign the current version.</p>
      <div className="mt-2 grid gap-1 sm:grid-cols-2">
        {roles.map((r) => (
          <label key={r.id} className="flex min-h-11 items-center gap-3">
            <input type="checkbox" name="roles" value={r.id} defaultChecked={picked.has(r.id)} className="h-5 w-5" />
            <span dir="auto">{r.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PolicyForm({
  people,
  roles,
  policy,
}: {
  people: Choice[];
  roles?: Choice[];
  policy?: { id: string; title: string; owner_person_id: string };
}) {
  const act = policy ? savePolicy.bind(null, policy.id) : addPolicy;
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(act, { error: null });
  return (
    <form action={action} className={box} aria-label={policy ? "Change the policy" : "Add a policy"}>
      <div>
        <label htmlFor="title" className="font-semibold">
          Title
        </label>
        <input id="title" name="title" required maxLength={150} defaultValue={policy?.title} className={fieldClass} dir="auto" />
      </div>
      <div>
        <label htmlFor="owner_person_id" className="font-semibold">
          Owner
        </label>
        <p id="owner_hint" className="text-sm">
          The person responsible for keeping this policy up to date.
        </p>
        <select id="owner_person_id" name="owner_person_id" required aria-describedby="owner_hint" defaultValue={policy?.owner_person_id ?? ""} className={fieldClass}>
          <option value="" disabled>
            Pick a person
          </option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      {roles && <RoleBoxes roles={roles} picked={new Set()} />}
      <FormError message={state.error} />
      <SaveBar cancelHref={policy ? `/policies/${policy.id}` : "/policies"}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : policy ? "Save" : "Add policy"}
        </button>
      </SaveBar>
    </form>
  );
}

export function VersionForm({
  policyId,
  today,
  draft,
}: {
  policyId: string;
  today: string;
  draft?: { id: string; version_label: string; approved_on: string; next_review_on: string };
}) {
  const act = draft ? saveDraft.bind(null, policyId, draft.id) : uploadVersion.bind(null, policyId);
  const [state, action, pending] = useActionState<PolicyFormState, FormData>(act, { error: null });
  const [approved, setApproved] = useState(draft?.approved_on ?? "");
  const [review, setReview] = useState(draft?.next_review_on ?? "");
  const [reviewTouched, setReviewTouched] = useState(Boolean(draft));

  return (
    <form action={action} className={box} aria-label={draft ? "Change the draft" : "Upload a new version"}>
      <div>
        <label htmlFor="version_label" className="font-semibold">
          Version name
        </label>
        <p id="label_hint" className="text-sm">
          For example &ldquo;v2&rdquo; or &ldquo;2026&rdquo;.
        </p>
        <input dir="auto" id="version_label" name="version_label" required maxLength={20} aria-describedby="label_hint" defaultValue={draft?.version_label} className={fieldClass} />
      </div>
      <div>
        <label htmlFor="approved_on" className="font-semibold">
          Approval date
        </label>
        <p id="approved_hint" className="text-sm">
          The day this version was approved (for example, at a board meeting).
        </p>
        <input
          id="approved_on"
          type="date"
          name="approved_on"
          required
          max={today}
          aria-describedby="approved_hint"
          value={approved}
          onChange={(e) => {
            setApproved(e.target.value);
            if (!reviewTouched) setReview(suggestedReview(e.target.value));
          }}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="next_review_on" className="font-semibold">
          Next review date
        </label>
        <p id="review_hint" className="text-sm">
          Filled in as {REVIEW_YEARS} year after approval. Change it if the policy says otherwise (at most {MAX_REVIEW_YEARS} years).
        </p>
        <input
          id="next_review_on"
          type="date"
          name="next_review_on"
          required
          min={approved || undefined}
          aria-describedby="review_hint"
          value={review}
          onChange={(e) => {
            setReviewTouched(true);
            setReview(e.target.value);
          }}
          className={fieldClass}
        />
      </div>
      <div>
        <label htmlFor="pdf" className="font-semibold">
          {draft ? "New PDF (only if it has changed)" : "PDF"}
        </label>
        <p id="pdf_hint" className="text-sm">
          The policy document as a PDF, 10 MB at most. {draft ? "The earlier PDF is kept, never deleted." : ""}
        </p>
        <input id="pdf" type="file" name="pdf" accept="application/pdf" required={!draft} aria-describedby="pdf_hint" className={`${fieldClass} py-2.5`} />
      </div>
      {/* D7: the same policy in Arabic, read right to left as a flip book. */}
      <div>
        <label htmlFor="pdf_ar" className="font-semibold">
          {draft ? "Arabic PDF (only to add or change it)" : "Arabic PDF (optional)"}
        </label>
        <p id="pdf_ar_hint" className="text-sm">
          The same policy in Arabic, 10 MB at most. It opens as a book that turns from right to left.
        </p>
        <input id="pdf_ar" type="file" name="pdf_ar" accept="application/pdf" aria-describedby="pdf_ar_hint" className={`${fieldClass} py-2.5`} />
      </div>
      <p className="text-sm">This is saved as a draft. Another admin then checks it and publishes it.</p>
      <FormError message={state.error} />
      <SaveBar cancelHref={`/policies/${policyId}`}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : draft ? "Save draft" : "Upload draft"}
        </button>
      </SaveBar>
    </form>
  );
}
