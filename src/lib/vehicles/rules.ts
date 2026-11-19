// Plain rules for vehicles (slice P2.7): the vehicle and renewal forms, status
// words and colours, and worst-first order. The database enforces the same
// rules and works out each status (migration 0025). Owner's choices, 16 Nov
// 2026: renewals are dated entries with history; "NCT not needed yet" is
// allowed; the keeper is any switched-on person, or nobody.
import type { Tone } from "@/lib/items/rules";
import { addYears, isDate } from "@/lib/vetting/rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export const MAY_SEE_VEHICLES = ["super_admin", "centre_admin"];
/** "Due soon" when this many days or fewer are left (matches the 60-day reminder). */
export const DUE_WITHIN_DAYS = 60;
export const MAX_RENEWAL_YEARS = 3;

export type RenewalKind = "tax" | "insurance" | "nct";
export const RENEWAL_KINDS: RenewalKind[] = ["tax", "insurance", "nct"];
export const KIND_LABEL: Record<RenewalKind, string> = { tax: "Motor tax", insurance: "Insurance", nct: "NCT" };

export type DateStatus = "expired" | "none" | "due" | "valid" | "not_needed";

export const DATE_STATUS: Record<DateStatus, { word: string; tone: Tone }> = {
  expired: { word: "Expired", tone: "red" },
  none: { word: "Not recorded", tone: "red" },
  due: { word: "Due soon", tone: "amber" },
  valid: { word: "Valid", tone: "green" },
  not_needed: { word: "Not needed yet", tone: "grey" },
};
const RANK: Record<DateStatus, number> = { expired: 0, none: 1, due: 2, valid: 3, not_needed: 4 };

/** One row of the database's vehicle_status view. */
export type VehicleRow = {
  id: string;
  item_id: string;
  registration: string;
  make_model: string | null;
  keeper_person_id: string | null;
  nct_needed: boolean;
  active: boolean;
  item_name: string;
  label_serial: string;
  condition: string;
  tax_until: string | null;
  tax_status: DateStatus;
  insurance_until: string | null;
  insurance_status: DateStatus;
  nct_until: string | null;
  nct_status: DateStatus;
};
export const VEHICLE_COLUMNS =
  "id, item_id, registration, make_model, keeper_person_id, nct_needed, active, item_name, label_serial, condition, tax_until, tax_status, insurance_until, insurance_status, nct_until, nct_status";

export type Renewal = {
  id: number;
  vehicle_id: string;
  kind: RenewalKind;
  renewed_on: string;
  valid_until: string;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string | null;
  created_at: string;
};
export const RENEWAL_COLUMNS = "id, vehicle_id, kind, renewed_on, valid_until, withdrawn_at, withdrawn_by, withdrawn_reason, created_by, created_at";

export function dateOf(v: VehicleRow, kind: RenewalKind): { until: string | null; status: DateStatus } {
  if (kind === "tax") return { until: v.tax_until, status: v.tax_status };
  if (kind === "insurance") return { until: v.insurance_until, status: v.insurance_status };
  return { until: v.nct_until, status: v.nct_status };
}

/** The worst of a vehicle's three dates. */
export function worstStatus(v: VehicleRow): DateStatus {
  return RENEWAL_KINDS.map((k) => dateOf(v, k).status).sort((a, b) => RANK[a] - RANK[b])[0];
}

/** Worst first (by the worst of its three dates, then the soonest date), then by registration. */
export function worstFirst(rows: VehicleRow[]): VehicleRow[] {
  const soonest = (v: VehicleRow) =>
    RENEWAL_KINDS.map((k) => dateOf(v, k).until)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ?? "9999-12-31";
  return [...rows].sort(
    (a, b) => RANK[worstStatus(a)] - RANK[worstStatus(b)] || soonest(a).localeCompare(soonest(b)) || a.registration.localeCompare(b.registration),
  );
}

/** The "valid until" the renewal form fills in: one year after the renewal date. */
export const suggestedUntil = (renewedOn: string) => (isDate(renewedOn) ? addYears(renewedOn, 1) : "");

// ---------------------------------------------------------------------------
// Forms

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "ab 12-c 3" → "AB 12-C 3": capitals, single spaces. */
export function tidyRegistration(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toUpperCase();
}

export type VehicleValues = { registration: string; make_model: string | null; keeper_person_id: string | null; nct_needed: boolean };

export function parseVehicleForm(get: Get): Result<VehicleValues> {
  const registration = tidyRegistration(get("registration"));
  if (!registration) return { ok: false, error: "Please enter the registration." };
  if (!/^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$/.test(registration)) {
    return { ok: false, error: "The registration can only have letters, numbers, spaces and dashes (15 characters at most)." };
  }
  const make_model = get("make_model").trim().replace(/\s+/g, " ") || null;
  if (make_model && make_model.length > 100) return { ok: false, error: "The make and model is too long (100 characters at most)." };
  const keeper = get("keeper_person_id").trim();
  if (keeper && !UUID.test(keeper)) return { ok: false, error: "Please pick the keeper from the list." };
  return { ok: true, values: { registration, make_model, keeper_person_id: keeper || null, nct_needed: get("nct_not_needed") !== "yes" } };
}

export type RenewalValues = { kind: RenewalKind; renewed_on: string; valid_until: string };

export function parseRenewalForm(get: Get, today: string): Result<RenewalValues> {
  const kind = get("kind") as RenewalKind;
  if (!RENEWAL_KINDS.includes(kind)) return { ok: false, error: "Please pick what was renewed." };
  const renewed_on = get("renewed_on").trim();
  if (!renewed_on) return { ok: false, error: "Please enter the date it was renewed." };
  if (!isDate(renewed_on)) return { ok: false, error: "The renewal date is not a real date." };
  if (renewed_on > today) return { ok: false, error: "The renewal date cannot be in the future." };
  const valid_until = get("valid_until").trim();
  if (!valid_until) return { ok: false, error: 'Please enter the "valid until" date.' };
  if (!isDate(valid_until)) return { ok: false, error: 'The "valid until" date is not a real date.' };
  if (valid_until <= renewed_on) return { ok: false, error: 'The "valid until" date must be after the renewal date.' };
  if (valid_until > addYears(renewed_on, MAX_RENEWAL_YEARS)) {
    return { ok: false, error: `The "valid until" date cannot be more than ${MAX_RENEWAL_YEARS} years after the renewal.` };
  }
  return { ok: true, values: { kind, renewed_on, valid_until } };
}

export function friendlyVehicleError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/vehicles_unique_registration/i.test(message)) return "Another vehicle already has that registration.";
  if (/vehicles_item_id_key/i.test(message)) return "That asset already has vehicle details.";
  if (/registration_check|vehicles_registration/i.test(message)) return "The registration can only have letters, numbers, spaces and dashes.";
  // The database's own messages are already written in plain words.
  if (/keeper|switched off|disposed|fixed asset|future|valid until|years|reason|already withdrawn|could not be found|cannot be/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}
