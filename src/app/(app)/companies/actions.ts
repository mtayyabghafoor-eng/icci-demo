"use server";
// What happens when the company and make-and-model forms are sent (slice
// P1.19). Runs on the web server as the signed-in admin: the database's rules
// decide what is allowed.
import { redirect } from "next/navigation";
import { friendlyCompanyError, parseCompanyForm, parseModelForm } from "@/lib/companies/rules";
import { formGetAll, formGetter, UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

export type CompanyFormState = { error: string | null };

type Table = "companies" | "product_models";
const PAGE: Record<Table, string> = { companies: "/companies", product_models: "/models" };

async function save(table: Table, id: string | null, values: Record<string, unknown>): Promise<CompanyFormState> {
  const supabase = await createClient();
  const q = id ? supabase.from(table).update(values).eq("id", id) : supabase.from(table).insert(values);
  const { data, error } = await q.select("id");
  if (error) return { error: friendlyCompanyError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE[table]}/${data[0].id}?done=${id ? "saved" : "added"}`);
}

export async function saveCompany(id: string | null, _state: CompanyFormState, form: FormData): Promise<CompanyFormState> {
  if (id && !UUID.test(id)) return { error: "This company could not be found." };
  const parsed = parseCompanyForm(formGetter(form), formGetAll(form));
  if (!parsed.ok) return { error: parsed.error };
  return save("companies", id, parsed.values);
}

export async function saveModel(id: string | null, _state: CompanyFormState, form: FormData): Promise<CompanyFormState> {
  if (id && !UUID.test(id)) return { error: "This make and model could not be found." };
  const parsed = parseModelForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  return save("product_models", id, parsed.values);
}

/** Switch a company or a make and model off (or back on). Never deleted. */
export async function setActive(table: Table, id: string, active: boolean): Promise<CompanyFormState> {
  if (!UUID.test(id)) return { error: "This record could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).update({ active }).eq("id", id).select("id");
  if (error) return { error: friendlyCompanyError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE[table]}/${id}?done=${active ? "switched-on" : "switched-off"}`);
}
