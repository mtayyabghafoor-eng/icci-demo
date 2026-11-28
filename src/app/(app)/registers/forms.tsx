"use client";
// The register forms (Phase 6): record an entry, or correct one (the same
// fields, filled in from the newest version, plus "What was wrong?").
// Funerals: changing the date ticks whoever the rota had on "Funeral on
// call" that day, until the admin ticks people themselves.
import { useActionState, useState, useSyncExternalStore, useTransition } from "react";
import { buttonClass, fieldClass, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import {
  CIVIL,
  EARLIEST,
  MAX_ON_DUTY,
  NAME_MAX,
  REASON_MAX,
  REGISTER,
  SERVICES,
  type AnyRow,
  type FuneralRow,
  type NikahRow,
  type RegisterKind,
  type ShahadaRow,
} from "@/lib/registers/rules";
import { onCallFor, saveEntry, type EntryFormState } from "./actions";
import type { PersonChoice } from "./data";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";

function Text({ name, label, hint, value, required = false }: { name: string; label: string; hint?: string; value?: string | null; required?: boolean }) {
  return (
    <div>
      <label htmlFor={name} className="font-semibold">
        {label}
        {!required && " (optional)"}
      </label>
      {hint && (
        <p id={`${name}_hint`} className="text-sm">
          {hint}
        </p>
      )}
      <input
        dir="auto"
        id={name}
        name={name}
        required={required}
        maxLength={NAME_MAX}
        defaultValue={value ?? ""}
        aria-describedby={hint ? `${name}_hint` : undefined}
        autoComplete="off"
        className={fieldClass}
      />
    </div>
  );
}

function PersonPick({ name, label, hint, people, value }: { name: string; label: string; hint: string; people: PersonChoice[]; value?: string }) {
  return (
    <div>
      <label htmlFor={name} className="font-semibold">
        {label}
      </label>
      <p id={`${name}_hint`} className="text-sm">
        {hint}
      </p>
      <select id={name} name={name} required defaultValue={value ?? ""} aria-describedby={`${name}_hint`} className={fieldClass}>
        <option value="" disabled>
          Pick a person
        </option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.role ? ` (${p.role})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Tick({ name, children, checked }: { name: string; children: React.ReactNode; checked?: boolean }) {
  return (
    <label className="flex min-h-11 items-start gap-3 rounded-xl border border-icci-line px-3 py-2.5">
      <input type="checkbox" name={name} value="yes" required defaultChecked={checked} className="mt-0.5 h-5 w-5 shrink-0" />
      <span>{children}</span>
    </label>
  );
}

function OnDuty({
  people,
  ticked,
  pinned,
  onCall,
  onTick,
}: {
  people: PersonChoice[];
  ticked: Set<string>;
  /** Shown at the top from the start (so a tick never moves a row under the pointer). */
  pinned: string[];
  onCall: string[];
  onTick: (id: string, on: boolean) => void;
}) {
  const first = people.filter((p) => pinned.includes(p.id) || onCall.includes(p.id) || p.imam);
  const rest = people.filter((p) => !first.includes(p));
  const row = (p: PersonChoice) => (
    <label key={p.id} className="flex min-h-11 items-center gap-3 px-1">
      <input type="checkbox" name="on_duty" value={p.id} checked={ticked.has(p.id)} onChange={(e) => onTick(p.id, e.target.checked)} className="h-5 w-5 shrink-0" />
      <span dir="auto">
        {p.name}
        {p.role && <span className="text-sm text-icci-ink-60"> · {p.role}</span>}
        {onCall.includes(p.id) && <span className="text-sm font-semibold text-icci-green"> · on call that day</span>}
      </span>
    </label>
  );
  return (
    <fieldset>
      <legend className="font-semibold">Who was on duty</legend>
      <p className="text-sm">One to {MAX_ON_DUTY} people. Whoever the rota has on &ldquo;Funeral on call&rdquo; that day is ticked for you.</p>
      <div className="mt-2 max-h-80 overflow-y-auto rounded-xl border border-icci-line p-2" data-testid="on-duty">
        {first.map(row)}
        {rest.length > 0 && (
          <details>
            <summary className="inline-flex min-h-11 cursor-pointer items-center px-1 font-semibold text-icci-green">Everyone else ({rest.length})</summary>
            {rest.map(row)}
          </details>
        )}
      </div>
    </fieldset>
  );
}

export function EntryForm({
  kind,
  people,
  today,
  current,
  onCallToday,
}: {
  kind: RegisterKind;
  people: PersonChoice[];
  today: string;
  /** The newest version, when correcting. */
  current?: AnyRow;
  onCallToday?: string[];
}) {
  const cfg = REGISTER[kind];
  const correcting = current !== undefined;
  const act = saveEntry.bind(null, kind, correcting ? current.id : null);
  const [state, action, pending] = useActionState<EntryFormState, FormData>(act, { error: null });
  // Funerals: the on-duty ticks follow the date until changed by hand.
  const [duty, setDuty] = useState<{ ticked: Set<string>; onCall: string[]; touched: boolean }>({
    ticked: new Set(correcting ? (current as FuneralRow).on_duty_person_ids : (onCallToday ?? [])),
    onCall: onCallToday ?? [],
    touched: correcting,
  });
  const [lookingUp, startLookup] = useTransition();
  // True once the page is running in the browser (the tests wait for it).
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const lookUp = (day: string) => {
    if (kind !== "funerals" || !day) return;
    startLookup(async () => {
      const ids = await onCallFor(day);
      setDuty((d) => ({ ...d, ticked: d.touched ? d.ticked : new Set(ids), onCall: ids }));
    });
  };
  const f = current as FuneralRow | undefined;
  const s = current as ShahadaRow | undefined;
  const n = current as NikahRow | undefined;

  return (
    <form action={action} className={box} aria-label={correcting ? `Correct this ${cfg.one}` : cfg.addLabel} data-ready={ready && !lookingUp ? "yes" : undefined}>
      <div>
        <label htmlFor="service_date" className="font-semibold">
          {cfg.dateLabel}
        </label>
        <input
          id="service_date"
          type="date"
          name="service_date"
          required
          min={EARLIEST}
          max={today}
          defaultValue={current?.service_date ?? today}
          onChange={(e) => lookUp(e.target.value)}
          className={fieldClass}
        />
      </div>

      {kind === "funerals" && (
        <>
          <Text name="deceased_name" label="Name of the person who died" value={f?.deceased_name} required />
          <Text name="family_contact_name" label="Family contact" hint="One person the Centre spoke to." value={f?.family_contact_name} required />
          <div>
            <label htmlFor="family_contact_phone" className="font-semibold">
              Family contact&rsquo;s phone (optional)
            </label>
            <input
              id="family_contact_phone"
              name="family_contact_phone"
              type="tel"
              inputMode="tel"
              maxLength={30}
              defaultValue={f?.family_contact_phone ?? ""}
              autoComplete="off"
              className={fieldClass}
            />
          </div>
          <fieldset>
            <legend className="font-semibold">Services the Centre gave</legend>
            <p className="text-sm">Tick at least one.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {SERVICES.map((sv) => (
                <label key={sv.key} className="flex min-h-11 items-center gap-3 rounded-xl border border-icci-line px-3">
                  <input type="checkbox" name="services" value={sv.key} defaultChecked={f ? f[sv.key] : sv.key === "janazah_prayer"} className="h-5 w-5" />
                  <span>{sv.word}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <OnDuty
            people={people}
            ticked={duty.ticked}
            pinned={correcting ? (current as FuneralRow).on_duty_person_ids : []}
            onCall={duty.onCall}
            onTick={(id, on) =>
              setDuty((d) => {
                const ticked = new Set(d.ticked);
                if (on) ticked.add(id);
                else ticked.delete(id);
                return { ...d, ticked, touched: true };
              })
            }
          />
        </>
      )}

      {kind === "shahada" && (
        <>
          <Text name="person_name" label="Name" hint="As the person wishes it written on the certificate." value={s?.person_name} required />
          <PersonPick name="imam_person_id" label="Authenticating imam" hint="From the people directory. Imams are listed first." people={people} value={s?.imam_person_id} />
          <Text name="witness_1" label="First witness" value={s?.witness_1} />
          <Text name="witness_2" label="Second witness" value={s?.witness_2} />
          <Tick name="adult_confirmed" checked={s?.adult_confirmed}>
            The person is 18 or over.
          </Tick>
        </>
      )}

      {kind === "nikah" && (
        <>
          <Text name="spouse_1_name" label="First spouse" value={n?.spouse_1_name} required />
          <Text name="spouse_2_name" label="Second spouse" value={n?.spouse_2_name} required />
          <PersonPick name="officiant_person_id" label="Officiant" hint="From the people directory. Imams are listed first." people={people} value={n?.officiant_person_id} />
          <Text name="witness_1" label="First witness" value={n?.witness_1} required />
          <Text name="witness_2" label="Second witness" value={n?.witness_2} required />
          <Text name="wali_name" label="Wali" value={n?.wali_name} />
          <fieldset>
            <legend className="font-semibold">Also registered as a civil marriage?</legend>
            <p className="text-sm">Only yes or no. Do not record form or registration numbers.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(CIVIL) as (keyof typeof CIVIL)[]).map((c) => (
                <label key={c} className="flex min-h-11 items-center gap-2 rounded-xl border border-icci-line px-3">
                  <input type="radio" name="civil_registration" value={c} required defaultChecked={(n?.civil_registration ?? "unknown") === c} className="h-5 w-5" />
                  <span>{CIVIL[c]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Tick name="adults_confirmed" checked={n?.adults_confirmed}>
            Both spouses are 18 or over.
          </Tick>
        </>
      )}

      {correcting && (
        <div>
          <label htmlFor="correction_reason" className="font-semibold">
            What was wrong?
          </label>
          <p id="reason_hint" className="text-sm">
            Kept with the new version. The old version stays in the history.
          </p>
          <input dir="auto" id="correction_reason" name="correction_reason" required maxLength={REASON_MAX} aria-describedby="reason_hint" className={fieldClass} />
        </div>
      )}

      <p className="text-sm">{cfg.never}</p>
      <FormError message={state.error} />
      <SaveBar cancelHref={correcting ? `/registers/${kind}/${current.first_id}` : `/registers/${kind}`}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "md", "px-6")}>
          {pending ? "Saving…" : correcting ? "Save the correction" : "Save"}
        </button>
      </SaveBar>
    </form>
  );
}
