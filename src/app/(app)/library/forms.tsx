"use client";
// The library forms (slice P4.2). Phone-first: big fields, the label filled
// in from the scan, title, author and language up front; ISBN, publisher and
// year folded away as optional. Arabic is typed and shown right to left
// (dir="auto" follows what is typed).
import { useActionState } from "react";
import { buttonClass, fieldClass, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import { LANGUAGE_LABEL, type Language } from "@/lib/library/rules";
import { addBook, addCopy, saveBook, saveCopyNote, type LibraryFormState } from "./actions";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

/** What was typed before a refusal, so nothing has to be typed twice. */
type Typed = Record<string, string> | undefined;

export type BookDetails = {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  published_year: number | null;
  language: Language;
};

function LabelField({ label, hint, typed }: { label: string; hint: string; typed?: Typed }) {
  return (
    <div>
      <label htmlFor="label" className="font-semibold">
        Label number
      </label>
      <p id="label_hint" className="text-sm">
        {hint}
      </p>
      <input
        id="label"
        name="label"
        required
        defaultValue={label || typed?.label || ""}
        readOnly={!!label}
        inputMode="text"
        autoCapitalize="characters"
        placeholder="ICCI-000123"
        aria-describedby="label_hint"
        className={`${fieldClass} font-mono ${label ? "bg-icci-green-50" : ""}`}
      />
    </div>
  );
}

function CopyNoteField({ typed }: { typed?: Typed }) {
  return (
    <div>
      <label htmlFor="copy_note" className="font-semibold">
        Note about this copy (optional)
      </label>
      <input
        id="copy_note"
        name="copy_note"
        maxLength={200}
        defaultValue={typed?.copy_note ?? ""}
        placeholder="For example: donated, spine torn"
        dir="auto"
        className={fieldClass}
      />
    </div>
  );
}

function BookFields({ book, typed }: { book?: BookDetails; typed?: Typed }) {
  const v = (name: string, saved: string | number | null | undefined) => typed?.[name] ?? (saved == null ? "" : String(saved));
  const more = !!(v("isbn", book?.isbn) || v("publisher", book?.publisher) || v("year", book?.published_year));
  return (
    <>
      <div>
        <label htmlFor="title" className="font-semibold">
          Title
        </label>
        <input id="title" name="title" required maxLength={300} defaultValue={v("title", book?.title)} dir="auto" className={`${fieldClass} text-lg`} />
      </div>
      <div>
        <label htmlFor="author" className="font-semibold">
          Author (optional)
        </label>
        <input id="author" name="author" maxLength={200} defaultValue={v("author", book?.author)} dir="auto" className={fieldClass} />
      </div>
      <fieldset>
        <legend className="font-semibold">Language</legend>
        <div className="mt-1.5 grid grid-cols-3 gap-2">
          {(Object.keys(LANGUAGE_LABEL) as Language[]).map((code) => (
            <label
              key={code}
              className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-icci-field bg-white px-2 font-semibold has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:text-icci-green-dark"
            >
              <input type="radio" name="language" value={code} required defaultChecked={v("language", book?.language) === code} className="h-4 w-4" />
              {LANGUAGE_LABEL[code]}
            </label>
          ))}
        </div>
      </fieldset>
      <details open={more} className="rounded-xl border border-icci-line px-4 py-2">
        <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">ISBN, publisher and year (optional)</summary>
        <div className="space-y-5 pb-3 pt-2">
          <div>
            <label htmlFor="isbn" className="font-semibold">
              ISBN
            </label>
            <p id="isbn_hint" className="text-sm">
              The 13 digits under the barcode on the back cover (10 on older books). Leave empty if there is none.
            </p>
            <input id="isbn" name="isbn" inputMode="numeric" maxLength={30} defaultValue={v("isbn", book?.isbn)} aria-describedby="isbn_hint" className={`${fieldClass} font-mono`} />
          </div>
          <div>
            <label htmlFor="publisher" className="font-semibold">
              Publisher
            </label>
            <input id="publisher" name="publisher" maxLength={200} defaultValue={v("publisher", book?.publisher)} dir="auto" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="year" className="font-semibold">
              Year
            </label>
            <input id="year" name="year" inputMode="numeric" maxLength={4} defaultValue={v("year", book?.published_year)} placeholder="1998" className={`${fieldClass} max-w-32`} />
          </div>
        </div>
      </details>
    </>
  );
}

function Buttons({ pending, saveText, cancel }: { pending: boolean; saveText: string; cancel: string }) {
  return (
    <SaveBar cancelHref={cancel}>
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
        {pending ? "Saving…" : saveText}
      </button>
    </SaveBar>
  );
}

/** Add a book: its label, the book's details, and an optional copy note. */
export function NewBookForm({
  label,
  initial,
  enteredBy = "typed",
}: {
  label: string;
  /** Details looked up from the ISBN (slice P4.3), for checking. */
  initial?: Record<string, string>;
  enteredBy?: "typed" | "looked_up";
}) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(addBook, { error: null });
  const shown = state.values ?? initial;
  return (
    <form key={state.attempt ?? 0} action={action} className={box} aria-label="Add a book">
      <input type="hidden" name="entered_by" value={enteredBy} />
      <LabelField
        label={label}
        typed={shown}
        hint={label ? "From the label you scanned." : "Scan the label with the phone's Camera app, or type the number printed on it."}
      />
      <BookFields typed={shown} />
      <CopyNoteField typed={shown} />
      <FormError message={state.error} />
      <Buttons pending={pending} saveText="Add the book" cancel="/library" />
    </form>
  );
}

/** Correct a book's details. */
export function EditBookForm({ book }: { book: BookDetails }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(saveBook.bind(null, book.id), { error: null });
  return (
    <form key={state.attempt ?? 0} action={action} className={box} aria-label="Correct the details">
      <BookFields book={book} typed={state.values} />
      <FormError message={state.error} />
      <Buttons pending={pending} saveText="Save" cancel={`/library/books/${book.id}`} />
    </form>
  );
}

/** Another copy of a book we have: its label and an optional note. */
export function NewCopyForm({ bookId, label }: { bookId: string; label: string }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(addCopy.bind(null, bookId), { error: null });
  return (
    <form key={state.attempt ?? 0} action={action} className={box} aria-label="Add a copy">
      <LabelField
        label={label}
        typed={state.values}
        hint={label ? "From the label you scanned." : "The new copy's own label. Scan it, or type the number printed on it."}
      />
      <CopyNoteField typed={state.values} />
      <FormError message={state.error} />
      <Buttons pending={pending} saveText="Add the copy" cancel={`/library/books/${bookId}`} />
    </form>
  );
}

/** A copy's short note. */
export function CopyNoteForm({ copyId, note }: { copyId: string; note: string | null }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(saveCopyNote.bind(null, copyId), { error: null });
  return (
    <form key={state.attempt ?? 0} action={action} className="mt-3 space-y-3" aria-label="Change the note">
      <div>
        <label htmlFor="copy_note" className="font-semibold">
          Note about this copy
        </label>
        <input id="copy_note" name="copy_note" maxLength={200} defaultValue={state.values?.copy_note ?? note ?? ""} dir="auto" className={fieldClass} />
      </div>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass("outline")}>
        {pending ? "Saving…" : "Save the note"}
      </button>
    </form>
  );
}
