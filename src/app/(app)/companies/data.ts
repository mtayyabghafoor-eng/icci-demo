// Reading companies and makes and models (slice P1.19). Row-level security
// decides what each account may see: only Super Admins and Centre Admins.
import type { SupabaseClient } from "@supabase/supabase-js";
import { COMPANY_COLUMNS, MODEL_COLUMNS, type CompanyRow, type ModelRow } from "@/lib/companies/rules";
import { allRows } from "@/lib/supabase/all-rows";

/** The message shown after a company or make-and-model form is saved. */
export const DONE: Record<string, string> = {
  added: "Added.",
  saved: "Changes saved.",
  "switched-off": "Switched off. Its history stays, and it can be switched back on.",
  "switched-on": "Switched back on.",
  "document-added": "Document added.",
  "document-hidden": "Document hidden. It stays in the record.",
};

export async function allCompanies(supabase: SupabaseClient): Promise<CompanyRow[]> {
  const rows = await allRows<CompanyRow>((from, to) => supabase.from("companies").select(COMPANY_COLUMNS).order("id").range(from, to));
  return rows.sort((a, b) => a.name.localeCompare(b.name, "en-IE", { sensitivity: "base" }));
}

export async function allModels(supabase: SupabaseClient): Promise<ModelRow[]> {
  const rows = await allRows<ModelRow>((from, to) => supabase.from("product_models").select(MODEL_COLUMNS).order("id").range(from, to));
  return rows.sort((a, b) => a.model_name.localeCompare(b.model_name, "en-IE", { numeric: true, sensitivity: "base" }));
}

/** Choices for a company drop-down: switched-on companies, plus any already picked. */
export function companyChoices(all: CompanyRow[], ...keep: (string | null | undefined)[]): { id: string; name: string }[] {
  return all.filter((c) => c.active || keep.includes(c.id)).map((c) => ({ id: c.id, name: c.active ? c.name : `${c.name} (switched off)` }));
}

/** Choices for a make-and-model drop-down: "Maker · Model", switched-on ones plus the one already picked. */
export function modelChoices(models: ModelRow[], companies: CompanyRow[], keep?: string | null): { id: string; name: string }[] {
  const maker = new Map(companies.map((c) => [c.id, c.name]));
  return models
    .filter((m) => m.active || m.id === keep)
    .map((m) => ({ id: m.id, name: `${maker.get(m.maker_company_id) ?? "?"} · ${m.model_name}${m.active ? "" : " (switched off)"}` }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-IE", { numeric: true }));
}
