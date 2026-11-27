"use client";
// Add or edit a person (designed for a PC first; works on a phone).
// Only the fields PLAN.md allows: name, role, section, phone, email, start date.
import Link from "next/link";
import { startTransition, useActionState } from "react";
import { FormError } from "@/app/sign-in/ui";
import { savePerson, type PersonFormState } from "./actions";
import type { ListEntry, PersonRow } from "./data";
import { fieldClass, SaveBar } from "@/components/ui";

type Props = { person: PersonRow | null; roles: ListEntry[]; sections: ListEntry[] };

export function PersonForm({ person, roles, sections }: Props) {
  const [state, action, pending] = useActionState<PersonFormState, FormData>(savePerson.bind(null, person?.id ?? null), { error: null });
  const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark font-semibold text-white! shadow-sm transition-colors duration-150 hover:bg-icci-green-900 disabled:opacity-60 px-6";

  return (
    <form
      className="mt-4 grid gap-4 rounded-2xl border border-icci-line bg-white shadow-card p-5 sm:grid-cols-2"
      onSubmit={(e) => {
        // Sent this way so the boxes keep what was typed when a warning shows.
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const data = new FormData(e.currentTarget, submitter);
        startTransition(() => action(data));
      }}
    >
      <label className="block sm:col-span-2">
        <span className="font-semibold">Full name</span>
        <input name="full_name" required maxLength={200} defaultValue={person?.full_name ?? ""} className={fieldClass} dir="auto" />
      </label>
      <label className="block">
        <span className="font-semibold">Role</span>
        <select name="person_role_id" required defaultValue={person?.person_role_id ?? ""} className={fieldClass}>
          <option value="" disabled>
            Pick a role
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
              {r.active ? "" : " (switched off)"}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold">Section</span>
        <select name="section_id" required defaultValue={person?.section_id ?? ""} className={fieldClass}>
          <option value="" disabled>
            Pick a section
          </option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.active ? "" : " (switched off)"}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="font-semibold">Phone</span> <span className="text-sm">(optional)</span>
        <input name="phone" type="tel" maxLength={30} defaultValue={person?.phone ?? ""} className={fieldClass} />
      </label>
      <label className="block">
        <span className="font-semibold">Email</span> <span className="text-sm">(optional)</span>
        <input name="email" type="email" maxLength={200} defaultValue={person?.email ?? ""} className={fieldClass} />
      </label>
      <label className="block">
        <span className="font-semibold">Start date</span> <span className="text-sm">(optional)</span>
        <input name="start_date" type="date" defaultValue={person?.start_date ?? ""} className={fieldClass} />
      </label>
      <p className="text-sm sm:col-span-2">
        Nothing else is kept about a person: no address, date of birth, notes or documents.
      </p>

      {state.sameName && state.sameName.length > 0 && (
        <div role="alert" data-testid="same-name-warning" className="rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3 sm:col-span-2">
          <p className="font-semibold">There is already a person called this:</p>
          <ul className="mt-1 list-disc pl-6">
            {state.sameName.map((p) => (
              <li key={p.id}>
                <Link href={`/people/${p.id}`}>{p.full_name}</Link>
                {p.active ? "" : " (switched off)"}
              </li>
            ))}
          </ul>
          <p className="mt-1">Two people can share a name. Save only if this is a different person.</p>
          <button
            type="submit"
            name="same_name_ok"
            value="yes"
            disabled={pending}
            className={`${button} mt-2`}
          >
            Yes, this is a different person: save
          </button>
        </div>
      )}

      <div className="sm:col-span-2">
        <FormError message={state.error} />
      </div>
      <SaveBar cancelHref={person ? `/people/${person.id}` : "/people"} className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className={button}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </SaveBar>
    </form>
  );
}
