"use client";
// Add a document, and hide a wrong one with a reason (slice P1.20).
import { useActionState } from "react";
import { buttonClass, Field, Input, Select, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { DOCUMENT_KINDS, DOCUMENT_MAX_MB } from "@/lib/documents/rules";
import { addDocument, hideDocument, type DocumentFormState, type DocumentOwner } from "./actions";

export function AddDocumentForm({ owner, returnTo, defaultKind }: { owner: DocumentOwner; returnTo: string; defaultKind: string }) {
  const [state, action, pending] = useActionState<DocumentFormState, FormData>(addDocument.bind(null, owner, returnTo), { error: null });
  return (
    <form action={action} className="mt-3 space-y-4 rounded-xl border border-icci-line bg-icci-green-50 p-4" aria-label="Add a document">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="doc-kind" label="Kind">
          <Select id="doc-kind" name="kind" defaultValue={defaultKind}>
            {Object.entries(DOCUMENT_KINDS).map(([k, w]) => (
              <option key={k} value={k}>
                {w}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="doc-title" label="Title" optional help="For example “User manual (English)”.">
          <Input id="doc-title" name="title" maxLength={120} />
        </Field>
      </div>
      <Field id="doc-file" label="File" help={`A PDF, or a photo (JPEG, PNG or WebP), up to ${DOCUMENT_MAX_MB} MB.`}>
        <input id="doc-file" name="file" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm" />
      </Field>
      <FormError message={state.error} />
      <SaveBar>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Adding…" : "Add document"}
        </button>
      </SaveBar>
    </form>
  );
}

export function HideDocumentForm({ id, title, returnTo }: { id: number; title: string; returnTo: string }) {
  const [state, action, pending] = useActionState<DocumentFormState, FormData>(hideDocument.bind(null, id, returnTo), { error: null });
  return (
    <details className="mt-1">
      <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-icci-green">Hide this document</summary>
      <form action={action} className="mt-2 space-y-3" aria-label={`Hide ${title}`}>
        <Field id={`hide-${id}`} label="Why is it being hidden?" help="It stays in the record, but is no longer listed.">
          <Input id={`hide-${id}`} name="reason" maxLength={500} required />
        </Field>
        <FormError message={state.error} />
        <button type="submit" disabled={pending} className={buttonClass("danger")}>
          {pending ? "Hiding…" : "Hide document"}
        </button>
      </form>
    </details>
  );
}
