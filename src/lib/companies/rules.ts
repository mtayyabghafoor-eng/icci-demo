// Plain rules for companies and makes and models (slice P1.19) and for
// "If this goes wrong" (P1.21), kept free of the database and the screens
// so they can be unit-tested. The database enforces the same rules itself
// (migration 0044).
import { isEmail, isPhone, tidyName } from "@/lib/people/rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const COMPANY_KINDS = {
  supplier: "Supplier",
  installer: "Installer",
  service: "Service and repair",
  maker: "Maker",
  other: "Other",
} as const;
export type CompanyKind = keyof typeof COMPANY_KINDS;
const KIND_KEYS = Object.keys(COMPANY_KINDS) as CompanyKind[];

export type CompanyRow = {
  id: string;
  name: string;
  kinds: CompanyKind[];
  phone: string | null;
  email: string | null;
  website: string | null;
  notes: string | null;
  active: boolean;
};

export type ModelRow = {
  id: string;
  maker_company_id: string;
  model_name: string;
  category_id: string;
  service_company_id: string | null;
  warranty_months: number | null;
  notes: string | null;
  active: boolean;
};

export const COMPANY_COLUMNS = "id, name, kinds, phone, email, website, notes, active";
export const MODEL_COLUMNS = "id, maker_company_id, model_name, category_id, service_company_id, warranty_months, notes, active";

/** "Supplier, Service and repair" (or "Not said"). */
export function kindWords(kinds: readonly string[]): string {
  const words = KIND_KEYS.filter((k) => kinds.includes(k)).map((k) => COMPANY_KINDS[k]);
  return words.length ? words.join(", ") : "Not said";
}

function optional(get: Get, name: string): string | null {
  return get(name).trim() || null;
}

export type CompanyValues = Omit<CompanyRow, "id" | "active">;

/** The company form. `getAll` returns every ticked "what they do" box. */
export function parseCompanyForm(get: Get, getAll: (name: string) => string[]): Result<CompanyValues> {
  const name = tidyName(get("name"));
  if (!name) return { ok: false, error: "Enter the company's name." };
  if (name.length > 120) return { ok: false, error: "Keep the name to 120 characters or fewer." };
  const kinds = [...new Set(getAll("kinds"))].filter((k): k is CompanyKind => (KIND_KEYS as string[]).includes(k));
  const phone = optional(get, "phone");
  if (phone && !isPhone(phone)) return { ok: false, error: "The phone number does not look right. Use digits, spaces and + only." };
  const email = optional(get, "email");
  if (email && !isEmail(email)) return { ok: false, error: "The email address does not look right." };
  let website = optional(get, "website");
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  if (website && (website.length > 200 || !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(website))) {
    return { ok: false, error: "The website does not look right, for example www.example.ie." };
  }
  const notes = optional(get, "notes");
  if (notes && notes.length > 1000) return { ok: false, error: "Keep the notes to 1,000 characters or fewer." };
  return { ok: true, values: { name, kinds, phone, email, website, notes } };
}

export type ModelValues = Omit<ModelRow, "id" | "active">;

export function parseModelForm(get: Get): Result<ModelValues> {
  const maker_company_id = get("maker_company_id");
  if (!UUID.test(maker_company_id)) return { ok: false, error: "Choose the maker." };
  const model_name = tidyName(get("model_name"));
  if (!model_name) return { ok: false, error: "Enter the model, as written on the maker's plate." };
  if (model_name.length > 120) return { ok: false, error: "Keep the model to 120 characters or fewer." };
  const category_id = get("category_id");
  if (!UUID.test(category_id)) return { ok: false, error: "Choose its category." };
  const service = get("service_company_id");
  if (service && !UUID.test(service)) return { ok: false, error: "Choose the service company from the list." };
  const months = get("warranty_months").trim();
  if (months && (!/^\d{1,3}$/.test(months) || Number(months) < 1 || Number(months) > 240)) {
    return { ok: false, error: "Enter the usual warranty in months, from 1 to 240, or leave it empty." };
  }
  const notes = optional(get, "notes");
  if (notes && notes.length > 1000) return { ok: false, error: "Keep the notes to 1,000 characters or fewer." };
  return {
    ok: true,
    values: { maker_company_id, model_name, category_id, service_company_id: service || null, warranty_months: months ? Number(months) : null, notes },
  };
}

/** The database's refusals in plain words. Its own messages are already plain. */
export function friendlyCompanyError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/companies_unique_name/i.test(message)) return "There is already a company called that.";
  if (/product_models_unique_per_maker/i.test(message)) return "That maker already has a model called that.";
  if (/switched off|sub-category/i.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  return "That could not be saved. Please check the details and try again.";
}

// ---------------------------------------------------------------------------
// If this goes wrong (P1.21)

export type CallSource = "item" | "model" | "sub-category" | "main category";

/**
 * Who to call: the item's own service company, else its model's, else its
 * sub-category's usual company, else its main category's. Null: nobody yet.
 */
export function whoToCall(
  item: { service_company_id: string | null },
  model: { service_company_id: string | null } | null,
  sub: { service_company_id?: string | null } | null,
  main: { service_company_id?: string | null } | null,
): { companyId: string; from: CallSource } | null {
  if (item.service_company_id) return { companyId: item.service_company_id, from: "item" };
  if (model?.service_company_id) return { companyId: model.service_company_id, from: "model" };
  if (sub?.service_company_id) return { companyId: sub.service_company_id, from: "sub-category" };
  if (main?.service_company_id) return { companyId: main.service_company_id, from: "main category" };
  return null;
}

/** The person staff phone: the sub-category's contact person, else its main category's. */
export function contactPerson(sub: { contact_person_id?: string | null } | null, main: { contact_person_id?: string | null } | null): string | null {
  return sub?.contact_person_id ?? main?.contact_person_id ?? null;
}

export type WarrantyStatus = { state: "under" | "ended" | "unknown"; word: string; tone: "green" | "grey" };

/** Under warranty until the end date (the last day counts), Ended, or Not recorded. */
export function warrantyStatus(warrantyEnd: string | null, today: string): WarrantyStatus {
  if (!warrantyEnd) return { state: "unknown", word: "Warranty not recorded", tone: "grey" };
  if (warrantyEnd >= today) return { state: "under", word: "Under warranty", tone: "green" };
  return { state: "ended", word: "Warranty ended", tone: "grey" };
}

/** A model's usual warranty, counted from the purchase date: the last day it still covers. */
export function warrantyEndFrom(purchaseDate: string, months: number): string {
  const [y, m, d] = purchaseDate.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  // 31 January + 1 month: JavaScript rolls into March; use the month's last day instead.
  if (end.getUTCDate() !== d) end.setUTCDate(0);
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

/** "tel:+35300000101": digits and a leading + only. */
export function telLink(phone: string): string {
  return `tel:${phone.trim().startsWith("+") ? "+" : ""}${phone.replace(/[^0-9]/g, "")}`;
}
