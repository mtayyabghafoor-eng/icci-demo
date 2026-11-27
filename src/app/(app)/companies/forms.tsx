"use client";
// The company and make-and-model forms (slice P1.19), and the switch
// off / back on button they share. Nothing is ever deleted.
import { useActionState } from "react";
import { buttonClass, Field, Input, Select, Textarea, SaveBar } from "@/components/ui";
import { FormError } from "@/app/sign-in/ui";
import type { CategoryGroup } from "@/lib/categories/rules";
import { COMPANY_KINDS, type CompanyRow, type ModelRow } from "@/lib/companies/rules";
import { CategoryOptions } from "../categories/options";
import { saveCompany, saveModel, setActive, type CompanyFormState } from "./actions";

const box = "mt-4 space-y-5 rounded-2xl border border-icci-line bg-white p-5 shadow-card";
type Choice = { id: string; name: string };

function Buttons({ pending, editing, add, cancelHref }: { pending: boolean; editing: boolean; add: string; cancelHref: string }) {
  return (
    <SaveBar cancelHref={cancelHref}>
      <button type="submit" disabled={pending} className={buttonClass("primary")}>
        {pending ? "Saving…" : editing ? "Save" : add}
      </button>
    </SaveBar>
  );
}

export function CompanyForm({ company, cancelHref }: { company?: CompanyRow; cancelHref: string }) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(saveCompany.bind(null, company?.id ?? null), { error: null });
  return (
    <form action={action} className={box} aria-label={company ? "Change this company" : "Add a company"}>
      <Field id="name" label="Name" help="As on their invoices or van, for example “Demo Gates and Barriers Ltd”.">
        <Input dir="auto" id="name" name="name" required maxLength={120} defaultValue={company?.name} autoComplete="off" />
      </Field>
      <fieldset>
        <legend className="text-[15px] font-semibold">What they do for us</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(COMPANY_KINDS).map(([key, word]) => (
            <label key={key} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-xl border border-icci-field bg-white px-3 has-[:checked]:border-icci-green-dark has-[:checked]:bg-icci-green-50">
              <input type="checkbox" name="kinds" value={key} defaultChecked={company?.kinds.includes(key as never)} className="accent-icci-green-dark" />
              <span className="text-sm">{word}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="phone" label="Phone" optional help="The number to ring for a fault or a callout.">
          <Input id="phone" name="phone" type="tel" maxLength={30} defaultValue={company?.phone ?? ""} />
        </Field>
        <Field id="email" label="Email" optional>
          <Input id="email" name="email" type="email" maxLength={200} defaultValue={company?.email ?? ""} />
        </Field>
      </div>
      <Field id="website" label="Website" optional>
        <Input dir="auto" id="website" name="website" maxLength={200} defaultValue={company?.website ?? ""} placeholder="www.example.ie" />
      </Field>
      <Field id="notes" label="Notes" optional help="For example an account number, or “ask for the service desk”. No personal details.">
        <Textarea dir="auto" id="notes" name="notes" maxLength={1000} defaultValue={company?.notes ?? ""} />
      </Field>
      <FormError message={state.error} />
      <Buttons pending={pending} editing={Boolean(company)} add="Add company" cancelHref={cancelHref} />
    </form>
  );
}

export function ModelForm({
  model,
  makers,
  services,
  categoryGroups,
  cancelHref,
}: {
  model?: ModelRow;
  makers: Choice[];
  services: Choice[];
  categoryGroups: CategoryGroup[];
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(saveModel.bind(null, model?.id ?? null), { error: null });
  return (
    <form action={action} className={box} aria-label={model ? "Change this make and model" : "Add a make and model"}>
      <Field id="maker_company_id" label="Maker" help="Not in the list? Add the maker as a company first.">
        <Select id="maker_company_id" name="maker_company_id" required defaultValue={model?.maker_company_id ?? ""}>
          <option value="" disabled>
            Choose the maker
          </option>
          {makers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="model_name" label="Model" help="As written on the maker's plate, for example “WX-200”.">
        <Input dir="auto" id="model_name" name="model_name" required maxLength={120} defaultValue={model?.model_name} autoComplete="off" />
      </Field>
      <Field id="category_id" label="Category">
        <Select id="category_id" name="category_id" required defaultValue={model?.category_id ?? ""}>
          <option value="" disabled>
            Choose a category
          </option>
          <CategoryOptions groups={categoryGroups} />
        </Select>
      </Field>
      <Field id="service_company_id" label="Service company" optional help="Who repairs this model, if the same for every unit.">
        <Select id="service_company_id" name="service_company_id" defaultValue={model?.service_company_id ?? ""}>
          <option value="">Nobody set</option>
          {services.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="warranty_months" label="Usual warranty (months)" optional help="Fills in the warranty end date when a unit is given this model.">
        <Input id="warranty_months" name="warranty_months" type="number" min={1} max={240} inputMode="numeric" defaultValue={model?.warranty_months ?? ""} />
      </Field>
      <Field id="notes" label="Notes" optional>
        <Textarea dir="auto" id="notes" name="notes" maxLength={1000} defaultValue={model?.notes ?? ""} />
      </Field>
      <FormError message={state.error} />
      <Buttons pending={pending} editing={Boolean(model)} add="Add make and model" cancelHref={cancelHref} />
    </form>
  );
}

/** Switch a company or a make and model off (or back on). */
export function SwitchActive({ table, id, active, what }: { table: "companies" | "product_models"; id: string; active: boolean; what: string }) {
  const [state, action, pending] = useActionState<CompanyFormState, FormData>(setActive.bind(null, table, id, !active), { error: null });
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm">
        {active
          ? `Switch off a ${what} no longer used. Items keep it, but it cannot be newly picked. It is never deleted and can be switched back on.`
          : `Switched off: it cannot be newly picked. Switch it back on to use it again.`}
      </p>
      <FormError message={state.error} />
      <button type="submit" disabled={pending} className={buttonClass(active ? "danger" : "outline")}>
        {pending ? "Saving…" : active ? "Switch off" : "Switch back on"}
      </button>
    </form>
  );
}
