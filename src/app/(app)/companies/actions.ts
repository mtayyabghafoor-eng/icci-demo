"use server";
// What happens when the company and make-and-model forms are sent (slice
// P1.19). Runs on the web server as the signed-in admin: the database's rules
// decide what is allowed.
import { redirect } from "next/navigation";
import { friendlyCompanyError, parseCompanyForm, parseModelForm } from "@/lib/companies/rules";
import { formGetAll, formGetter, UUID } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { NOT_FOUND, anyBad, isUuid, orNull } from "@/lib/action-input";

export type CompanyFormState = { error: string | null };

type Table = "companies" | "product_models";
const PAGE: Record<Table, string> = { companies: "/companies", product_models: "/models" };

type Saved = PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;
type Db = Awaited<ReturnType<typeof createClient>>;

async function save(table: Table, id: string | null, write: (db: Db) => Saved): Promise<CompanyFormState> {
  const { data, error } = await write(await createClient());
  if (error) return { error: friendlyCompanyError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE[table]}/${data[0].id}?done=${id ? "saved" : "added"}`);
}

export async function saveCompany(id: string | null, _state: CompanyFormState, form: FormData): Promise<CompanyFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(orNull(isUuid)(id))) return { error: NOT_FOUND };
  if (id && !UUID.test(id)) return { error: "This company could not be found." };
  const parsed = parseCompanyForm(formGetter(form), formGetAll(form));
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;
  return save("companies", id, (db) => (id ? db.from("companies").update(v).eq("id", id) : db.from("companies").insert(v)).select("id"));
}

export async function saveModel(id: string | null, _state: CompanyFormState, form: FormData): Promise<CompanyFormState> {
  // Round C3: what the browser handed over is checked first.
  if (anyBad(orNull(isUuid)(id))) return { error: NOT_FOUND };
  if (id && !UUID.test(id)) return { error: "This make and model could not be found." };
  const parsed = parseModelForm(formGetter(form));
  if (!parsed.ok) return { error: parsed.error };
  const v = parsed.values;
  return save("product_models", id, (db) =>
    (id ? db.from("product_models").update(v).eq("id", id) : db.from("product_models").insert(v)).select("id"),
  );
}

/** Switch a company or a make and model off (or back on). Never deleted. */
export async function setActive(table: Table, id: string, active: boolean): Promise<CompanyFormState> {
  // Round C3: only these two lists, whatever the browser sends.
  if (table !== "companies" && table !== "product_models") return { error: "This record could not be found." };
  if (!UUID.test(id)) return { error: "This record could not be found." };
  if (typeof active !== "boolean") return { error: "This record could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from(table).update({ active }).eq("id", id).select("id");
  if (error) return { error: friendlyCompanyError(error.message) };
  if (!data?.length) return { error: "Your account is not allowed to do this." };
  redirect(`${PAGE[table]}/${id}?done=${active ? "switched-on" : "switched-off"}`);
}
