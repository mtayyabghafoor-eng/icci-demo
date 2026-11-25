"use client";
// "Report a problem": phone-first. What is wrong, where (unless it came from
// an asset's page), and a photo in one tap. Priority starts on Normal and
// "Reported by" starts with you, so most reports need only the description.
import { startTransition, useActionState, useRef, useState, type FormEvent } from "react";
import { FormError } from "@/app/sign-in/ui";
import Link from "next/link";
import {
  PRIORITY_LABEL,
  STATUS_BUTTON,
  statusChoices,
  TICKET_PRIORITIES,
  type TicketPriority,
  type TicketStatus,
  type TicketStep,
} from "@/lib/tickets/rules";
import { PhotoInput } from "../items/photo-input";
import { fieldClass } from "../items/ui";
import { recordTicketStep, reportProblem, type TicketFormState } from "./actions";

const none: TicketFormState = { error: null };
const primary =
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-6 text-lg font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 sm:w-auto";
const choice =
  "flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 px-3 rounded-xl border border-[#87948f] bg-white transition-colors duration-150 hover:border-icci-green/60 has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:font-semibold";

export function ReportProblemForm({
  itemId,
  damageId = null,
  canMarkDamaged = false,
  places,
  people,
  myPersonId,
}: {
  /** A4: offer "It is broken or damaged" (an asset in good or fair condition). */
  canMarkDamaged?: boolean;
  /** Set when reporting from an asset's page: the place is then the asset's own. */
  itemId: string | null;
  /** P3.6: the damage report this ticket comes from, if any. */
  damageId?: number | null;
  places: { id: string; path: string }[];
  /** Switched-on people, in name order. */
  people: { id: string; full_name: string }[];
  myPersonId: string | null;
}) {
  const [state, send, pending] = useActionState(reportProblem.bind(null, itemId, damageId), none);
  const [who, setWho] = useState(myPersonId ?? "");
  const photo = useRef<File | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (photo.current) data.set("photo", photo.current);
    startTransition(() => send(data));
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
      <label className="block">
        <span className="font-semibold">What is wrong?</span>
        <textarea
          name="description"
          required
          rows={3}
          maxLength={2000}
          placeholder="e.g. The tap in the wudu area drips all the time"
          className={fieldClass}
          dir="auto"
        />
      </label>
      {canMarkDamaged && (
        // A4 (owner's choice): one report. The tick also marks the item damaged, with the same words.
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#87948f] bg-white px-4 py-3 has-[:checked]:border-icci-error/60 has-[:checked]:bg-[var(--icci-bad-fill)]">
          <input type="checkbox" name="damaged" value="yes" className="mt-1 h-5 w-5 shrink-0" data-testid="mark-damaged" />
          <span>
            <span className="block font-semibold">It is broken or damaged</span>
            <span className="block text-sm text-icci-ink-60">Also marks the item damaged until it is repaired. Leave it off for a small fault.</span>
          </span>
        </label>
      )}
      {!itemId && (
        <label className="block">
          <span className="font-semibold">Where?</span>
          <select name="location_id" required defaultValue="" className={fieldClass}>
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
      <PhotoInput label="Photo (optional)" onPhoto={(f) => (photo.current = f)} />
      <fieldset>
        <legend className="font-semibold">How urgent?</legend>
        <div className="mt-1 flex gap-2">
          {[...TICKET_PRIORITIES].reverse().map((p) => (
            <label key={p} className={choice}>
              <input type="radio" name="priority" value={p} defaultChecked={p === "normal"} />
              {PRIORITY_LABEL[p].word}
            </label>
          ))}
        </div>
      </fieldset>
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
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={primary}>
        {pending ? "Sending…" : "Report the problem"}
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// P3.6: the steps on a ticket's page. Each form saves one history entry.

const secondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50 disabled:opacity-60";
const smallPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-5 font-semibold text-white! no-underline shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60";

/** One step's form: sends what it holds (and a photo, if one was taken) to the server. */
function StepForm({
  ticketId,
  step,
  children,
  button,
  photo,
  testId,
}: {
  ticketId: number;
  step: TicketStep;
  children?: React.ReactNode;
  button: string;
  photo?: React.RefObject<File | null>;
  testId: string;
}) {
  const [state, send, pending] = useActionState(recordTicketStep.bind(null, ticketId, step), none);
  return (
    <form
      data-testid={testId}
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        if (photo?.current) data.set("photo", photo.current);
        startTransition(() => send(data));
      }}
    >
      {children}
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={smallPrimary}>
        {pending ? "Saving…" : button}
      </button>
    </form>
  );
}

function NoteBox({ label, required = false, hint }: { label: string; required?: boolean; hint?: string }) {
  return (
    <label className="block">
      <span className="font-semibold">{label}</span>
      <textarea name="note" required={required} rows={2} maxLength={2000} placeholder={hint} className={fieldClass} dir="auto" />
    </label>
  );
}

/** A folding section, so the page stays short on a phone. */
function Fold({ title, children, testId }: { title: string; children: React.ReactNode; testId: string }) {
  return (
    <details className="rounded-xl border border-icci-line bg-white px-4 py-1" data-testid={testId}>
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">{title}</summary>
      <div className="pb-4 pt-1">{children}</div>
    </details>
  );
}

export function TicketActions({
  ticketId,
  status,
  priority,
  assignedPersonId,
  people,
  companies = [],
  suggestedCompany = null,
}: {
  ticketId: number;
  status: TicketStatus;
  priority: TicketPriority;
  assignedPersonId: string | null;
  /** Switched-on people, in name order. */
  people: { id: string; full_name: string; role: string }[];
  /** P1.21: switched-on companies, and the one "If this goes wrong" says to call. */
  companies?: { id: string; name: string }[];
  suggestedCompany?: string | null;
}) {
  const notePhoto = useRef<File | null>(null);
  const noteFold = (
    <Fold title="Add a note" testId="fold-note">
      <StepForm ticketId={ticketId} step="note" button="Add note" photo={notePhoto} testId="form-note">
        <NoteBox label="Note" required hint="e.g. Part ordered, about a week" />
        <PhotoInput label="Photo (optional)" onPhoto={(f) => (notePhoto.current = f)} />
      </StepForm>
    </Fold>
  );

  if (status === "closed") {
    return (
      <div className="space-y-3" data-testid="ticket-actions">
        <Fold title="Reopen this ticket" testId="fold-reopen">
          <StepForm ticketId={ticketId} step="reopen" button="Reopen" testId="form-reopen">
            <NoteBox label="Why is it being reopened?" required hint="e.g. Dripping again after the rain" />
          </StepForm>
        </Fold>
        {noteFold}
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="ticket-actions">
      <div className="flex flex-wrap gap-2">
        <Link href={`/tickets/${ticketId}/close`} className={smallPrimary}>
          Close ticket
        </Link>
        {statusChoices(status).map((s) => (
          <StatusButton key={s} ticketId={ticketId} status={s} />
        ))}
      </div>
      <Fold title={assignedPersonId ? "Assign to someone else" : "Assign"} testId="fold-assign">
        <StepForm ticketId={ticketId} step="assign" button="Assign" testId="form-assign">
          <label className="block">
            <span className="font-semibold">Assign to</span>
            <select name="person" required defaultValue="" className={fieldClass}>
              <option value="" disabled>
                Pick a person
              </option>
              {people
                .filter((p) => p.id !== assignedPersonId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({p.role})
                  </option>
                ))}
            </select>
          </label>
          <NoteBox label="Note (optional)" hint="e.g. Plumber booked for Tuesday" />
        </StepForm>
      </Fold>
      <Fold title="Change priority" testId="fold-priority">
        <StepForm ticketId={ticketId} step="priority" button="Change priority" testId="form-priority">
          <fieldset>
            <legend className="font-semibold">New priority</legend>
            <div className="mt-1 flex gap-2">
              {[...TICKET_PRIORITIES].reverse().map((p) => (
                <label key={p} className={choice}>
                  <input type="radio" name="priority" value={p} required disabled={p === priority} />
                  {PRIORITY_LABEL[p].word}
                  {p === priority ? " (now)" : ""}
                </label>
              ))}
            </div>
          </fieldset>
          <NoteBox label="Note (optional)" hint="e.g. Water is reaching the carpet" />
        </StepForm>
      </Fold>
      <Fold title="Passed to a company" testId="fold-refer">
        <StepForm ticketId={ticketId} step="refer" button="Record it" testId="form-refer">
          <p className="text-sm">When the problem is handed to an outside company. The assignee stays the person following it up.</p>
          <label className="block">
            <span className="font-semibold">Company</span>
            <select name="company" required defaultValue={suggestedCompany ?? ""} className={fieldClass}>
              <option value="" disabled>
                Pick a company
              </option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Their job number (optional)</span>
            <input name="job_ref" maxLength={60} className={fieldClass} placeholder="e.g. the number they gave on the phone" />
          </label>
          <NoteBox label="Note (optional)" hint="e.g. Engineer coming Thursday morning" />
        </StepForm>
      </Fold>
      {noteFold}
    </div>
  );
}

/** "Mark in progress", "Mark waiting" or "Back to open", in one tap. */
function StatusButton({ ticketId, status }: { ticketId: number; status: Exclude<TicketStatus, "closed"> }) {
  const [state, send, pending] = useActionState(recordTicketStep.bind(null, ticketId, "status"), none);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData();
        data.set("status", status);
        startTransition(() => send(data));
      }}
    >
      <button type="submit" disabled={pending} className={secondary}>
        {STATUS_BUTTON[status]}
      </button>
      <FormError message={state.error} />
    </form>
  );
}

/** "Close a ticket": closing note, optional cost, and "Mark repaired" when the asset is damaged. */
export function CloseTicketForm({ ticketId, canMarkRepaired }: { ticketId: number; canMarkRepaired: boolean }) {
  // A4: a ticket on a damaged item is usually closed because it was repaired, so the tick starts on.
  const [repair, setRepair] = useState(canMarkRepaired);
  return (
    <div className="mt-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
      <StepForm ticketId={ticketId} step="close" button="Close ticket" testId="form-close">
        <NoteBox label="Closing note: what was done?" required hint="e.g. Washer replaced and tested" />
        <label className="block">
          <span className="font-semibold">Cost in euro (optional)</span>
          <input name="cost" inputMode="decimal" placeholder="e.g. 45.50" className={fieldClass} />
          <span className="mt-1 block text-sm">For information only. This is not an expense claim.</span>
        </label>
        {canMarkRepaired && (
          <fieldset className="rounded-xl border border-icci-line px-4 py-3">
            <label className="flex min-h-11 items-center gap-2 font-semibold">
              <input type="checkbox" checked={repair} onChange={(e) => setRepair(e.target.checked)} />
              Also mark the asset repaired
            </label>
            {repair && (
              <div className="mt-1 flex gap-3">
                {(["good", "fair"] as const).map((c) => (
                  <label key={c} className={choice}>
                    <input type="radio" name="repaired" value={c} required defaultChecked={c === "good"} />
                    {c === "good" ? "Good" : "Fair"}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        )}
      </StepForm>
    </div>
  );
}
