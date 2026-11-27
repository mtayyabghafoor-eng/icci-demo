"use client";
// The lending forms (slice P4.4). Phone-first: big buttons (Return is one
// tap), three fields or fewer, the due date filled in (21 days) and
// changeable. Names are shown as typed, Arabic included (dir="auto").
import { useActionState, useRef } from "react";
import { BarcodeCamera } from "@/components/shell/camera-scanner";
import { labelFromScan } from "@/lib/items/scan";
import { buttonClass, ConfirmSubmit, fieldClass, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import type { MarkKind } from "@/lib/library/lists";
import { CONTACT_KIND_LABEL, type ContactKind } from "@/lib/library/loans";
import type { LibraryFormState } from "./actions";
import {
  addBorrower,
  findCopy,
  lendToBorrower,
  lendToNewBorrower,
  markCopy,
  moveDueDate,
  returnCopy,
  saveBorrower,
  setBorrowerActive,
  undoReturn,
} from "./loan-actions";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";
type Typed = Record<string, string> | undefined;

/** Lend or Return without the camera: type the label number. */
export function FindCopyForm({ purpose }: { purpose: "lend" | "return" }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(findCopy.bind(null, purpose), { error: null });
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} key={state.attempt ?? 0} action={action} className={box} aria-label="Find the book">
      {/* D6: on Android phones and tablets (and a PC with a webcam) the book's label is scanned here. */}
      <BarcodeCamera
        target={{
          formats: ["qr_code"],
          accept: labelFromScan,
          hrefFor: (label) => label,
          title: "Scan the book's label",
          hint: "Point the camera at the square code on the label inside the book.",
          wrongCode: "That code is not an ICCI label. Point the camera at the square code on the book's label.",
          testId: `${purpose}-camera`,
          onValue: (label) => {
            const box = form.current?.querySelector<HTMLInputElement>('input[name="label"]');
            if (!box) return;
            box.value = label;
            form.current?.requestSubmit();
          },
        }}
      />
      <div>
        <label htmlFor="label" className="font-semibold">
          Label number
        </label>
        <input
          id="label"
          name="label"
          required
          defaultValue={state.values?.label ?? ""}
          autoCapitalize="characters"
          placeholder="ICCI-000123"
          className={`${fieldClass} font-mono text-lg`}
        />
      </div>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full sm:w-auto sm:px-8")}>
        {pending ? "Finding…" : "Find the book"}
      </button>
    </form>
  );
}

export type BorrowerDetails = { id: string; full_name: string; contact_kind: ContactKind; contact: string };

function BorrowerFields({ borrower, typed }: { borrower?: BorrowerDetails; typed?: Typed }) {
  const kind = typed?.contact_kind ?? borrower?.contact_kind ?? "phone";
  return (
    <>
      <div>
        <label htmlFor="full_name" className="font-semibold">
          Name
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          maxLength={100}
          autoComplete="off"
          defaultValue={typed?.full_name ?? borrower?.full_name ?? ""}
          dir="auto"
          className={`${fieldClass} text-lg`}
        />
      </div>
      <fieldset>
        <legend className="font-semibold">One way to contact them</legend>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
          {(Object.keys(CONTACT_KIND_LABEL) as ContactKind[]).map((k) => (
            <label
              key={k}
              className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-icci-field bg-white px-2 font-semibold has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:text-icci-green-dark"
            >
              <input type="radio" name="contact_kind" value={k} required defaultChecked={kind === k} className="h-4 w-4" />
              {CONTACT_KIND_LABEL[k]}
            </label>
          ))}
        </div>
        <label htmlFor="contact" className="sr-only">
          Phone number or email address
        </label>
        <input
          id="contact"
          name="contact"
          required
          maxLength={200}
          autoComplete="off"
          defaultValue={typed?.contact ?? borrower?.contact ?? ""}
          placeholder="Phone number or email address"
          className={`${fieldClass} mt-2`}
        />
        <p className="mt-1 text-sm">Only one. No address or other details are kept.</p>
      </fieldset>
    </>
  );
}

/** A date as YYYY-MM-DD, n days after another (no time zones involved). */
function plusDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function DueField({ due, today, max, typed, label = "Due back" }: { due: string; today: string; max: string; typed?: Typed; label?: string }) {
  const box = useRef<HTMLInputElement>(null);
  // E8: one tap moves the date on by a week or two, from the date shown.
  const add = (n: number) => {
    if (!box.current) return;
    const next = plusDays(box.current.value || due, n);
    box.current.value = next > max ? max : next;
  };
  return (
    <div>
      <label htmlFor="due_on" className="font-semibold">
        {label}
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <input
          ref={box}
          id="due_on"
          name="due_on"
          type="date"
          required
          min={today}
          max={max}
          defaultValue={typed?.due_on ?? due}
          className={`${fieldClass} mt-0! max-w-56`}
        />
        <span className="flex gap-2">
          {[7, 14].map((n) => (
            <button key={n} type="button" onClick={() => add(n)} className={buttonClass("outline")} data-testid={`due-plus-${n}`}>
              +{n} days
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

/** Add a borrower, or correct their details. */
export function BorrowerForm({ borrower }: { borrower?: BorrowerDetails }) {
  const act = borrower ? saveBorrower.bind(null, borrower.id) : addBorrower;
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(act, { error: null });
  const cancel = borrower ? `/library/borrowers/${borrower.id}` : "/library/borrowers";
  return (
    <form key={state.attempt ?? 0} action={action} className={box} aria-label={borrower ? "Correct the details" : "Add a borrower"}>
      <BorrowerFields borrower={borrower} typed={state.values} />
      <FormError message={state.error} />
      <SaveBar cancelHref={cancel}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Saving…" : borrower ? "Save" : "Add the borrower"}
        </button>
      </SaveBar>
    </form>
  );
}

/** Switch a borrower off (nothing on loan) or back on. */
export function SwitchBorrowerForm({ borrowerId, active }: { borrowerId: string; active: boolean }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(setBorrowerActive.bind(null, borrowerId, !active), { error: null });
  return (
    <form action={action} className="space-y-2">
      <button type="submit" disabled={pending} className={buttonClass(active ? "danger" : "outline")}>
        {pending ? "Saving…" : active ? "Switch off" : "Switch back on"}
      </button>
      <FormError message={state.error} />
    </form>
  );
}

/** Lend to a borrower we have: confirm the due date. */
export function LendForm({ copyId, borrowerId, due, today, max }: { copyId: string; borrowerId: string; due: string; today: string; max: string }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(lendToBorrower.bind(null, copyId, borrowerId), { error: null });
  return (
    <form key={state.attempt ?? 0} action={action} className={box} aria-label="Lend the book">
      <DueField due={due} today={today} max={max} typed={state.values} />
      <FormError message={state.error} />
      <SaveBar cancelHref="/library">
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Lending…" : "Lend the book"}
        </button>
      </SaveBar>
    </form>
  );
}

/** Lend to someone new: name, one contact, due date. */
export function NewBorrowerLendForm({ copyId, due, today, max }: { copyId: string; due: string; today: string; max: string }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(lendToNewBorrower.bind(null, copyId), { error: null });
  return (
    <form key={state.attempt ?? 0} action={action} className={box} aria-label="New borrower">
      <BorrowerFields typed={state.values} />
      <DueField due={due} today={today} max={max} typed={state.values} />
      <FormError message={state.error} />
      <SaveBar cancelHref="/library">
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "sm:px-8")}>
          {pending ? "Lending…" : "Add and lend the book"}
        </button>
      </SaveBar>
    </form>
  );
}

/** Return: one tap. */
export function ReturnForm({ copyId }: { copyId: string }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(returnCopy.bind(null, copyId), { error: null });
  return (
    <form action={action} className="space-y-2" aria-label="Return the book">
      <button type="submit" disabled={pending} className={buttonClass("primary", "lg", "w-full")}>
        {pending ? "Returning…" : "Return this book"}
      </button>
      <FormError message={state.error} />
    </form>
  );
}

/** Move the due date (folded away under the Return button). */
export function MoveDueForm({ copyId, loanId, due, today, max }: { copyId: string; loanId: number; due: string; today: string; max: string }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(moveDueDate.bind(null, copyId, loanId), { error: null });
  return (
    <form key={state.attempt ?? 0} action={action} className="space-y-3" aria-label="Move the due date">
      <DueField due={due} today={today} max={max} typed={state.values} label="New due date" />
      {/* D6: one tap for the usual extensions, counted from today. */}
      <div className="flex flex-wrap gap-2" data-testid="due-quick">
        {[7, 14, 21].map((n) => {
          const d = new Date(`${today}T12:00:00Z`);
          d.setUTCDate(d.getUTCDate() + n);
          const iso = d.toISOString().slice(0, 10);
          if (iso > max) return null;
          return (
            <button
              key={n}
              type="button"
              className={buttonClass("ghost", "md", "border border-icci-line")}
              onClick={(e) => {
                const box = e.currentTarget.form?.querySelector<HTMLInputElement>('input[name="due_on"]');
                if (box) box.value = iso;
              }}
            >
              +{n} days
            </button>
          );
        })}
      </div>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass("outline")}>
        {pending ? "Saving…" : "Move the due date"}
      </button>
    </form>
  );
}

/** "Returned by mistake, still on loan". */
export function UndoReturnForm({ copyId, loanId }: { copyId: string; loanId: number }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(undoReturn.bind(null, copyId, loanId), { error: null });
  return (
    <form action={action} className="space-y-2" aria-label="Returned by mistake">
      <button type="submit" disabled={pending} className={buttonClass("outline")}>
        {pending ? "Saving…" : "Returned by mistake: still on loan"}
      </button>
      <FormError message={state.error} />
    </form>
  );
}

const MARK_BUTTON: Record<MarkKind, { idle: string; busy: string; variant: "primary" | "outline" }> = {
  lost: { idle: "Mark this copy lost", busy: "Saving…", variant: "outline" },
  withdrawn: { idle: "Withdraw this copy for good", busy: "Saving…", variant: "outline" },
  found: { idle: "Mark this copy found", busy: "Saving…", variant: "primary" },
};

/** Lost, withdrawn or found: one button each (each is a new entry in the record). */
export function MarkCopyForm({ copyId, kind }: { copyId: string; kind: MarkKind }) {
  const [state, action, pending] = useActionState<LibraryFormState, FormData>(markCopy.bind(null, copyId, kind), { error: null });
  const b = MARK_BUTTON[kind];
  return (
    <form action={action} className="space-y-2" aria-label={b.idle}>
      {kind === "withdrawn" ? (
        // A1: withdrawing is for good, so it asks once more.
        <ConfirmSubmit
          disabled={pending}
          label={pending ? b.busy : b.idle}
          title="Withdraw this copy for good?"
          confirmLabel="Yes, withdraw it"
        >
          It leaves the library for good and can never be lent again. Its record and past loans stay in the history.
        </ConfirmSubmit>
      ) : (
        <button type="submit" disabled={pending} className={buttonClass(b.variant, kind === "found" ? "lg" : undefined, kind === "found" ? "w-full" : undefined)}>
          {pending ? b.busy : b.idle}
        </button>
      )}
      <FormError message={state.error} />
    </form>
  );
}
