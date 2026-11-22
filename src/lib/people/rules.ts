// Plain rules for the people directory (slice P2.1): what the add and edit
// form accepts, the same-name warning, and status words. The database
// enforces the same rules itself (migration 0017).
import type { Tone } from "@/lib/items/rules";
import { UUID } from "@/lib/forms";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export type PersonValues = {
  full_name: string;
  person_role_id: string;
  section_id: string;
  phone: string | null;
  email: string | null;
  start_date: string | null;
};

/** 6 to 20 digits; + only at the start; spaces, brackets and dashes allowed. */
export function isPhone(raw: string): boolean {
  if (!/^\+?[0-9 ()-]+$/.test(raw)) return false;
  const digits = raw.replace(/[^0-9]/g, "").length;
  return digits >= 6 && digits <= 20;
}

/** One @, nothing blank either side, and a dot after it. */
export function isEmail(raw: string): boolean {
  return raw.length <= 200 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw);
}

function isDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = new Date(`${raw}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw;
}

/** Collapses runs of spaces, so "Test  Amina " is saved as "Test Amina". */
export function tidyName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function parsePersonForm(get: Get): Result<PersonValues> {
  const full_name = tidyName(get("full_name"));
  if (!full_name) return { ok: false, error: "Please enter the person's full name." };
  if (full_name.length > 200) return { ok: false, error: "The name is too long (200 characters at most)." };
  const person_role_id = get("person_role_id");
  if (!UUID.test(person_role_id)) return { ok: false, error: "Please pick a role." };
  const section_id = get("section_id");
  if (!UUID.test(section_id)) return { ok: false, error: "Please pick a section." };

  const phone = get("phone").trim();
  if (phone && !isPhone(phone)) {
    return { ok: false, error: "That does not look like a phone number. Use digits, with + spaces or brackets if needed." };
  }
  const email = get("email").trim().toLowerCase();
  if (email && !isEmail(email)) return { ok: false, error: "That does not look like an email address." };
  const start_date = get("start_date").trim();
  if (start_date && !isDate(start_date)) return { ok: false, error: "The start date is not a real date." };

  return {
    ok: true,
    values: { full_name, person_role_id, section_id, phone: phone || null, email: email || null, start_date: start_date || null },
  };
}

/** People with the same name (ignoring capitals and spaces), except `exceptId`. */
export function sameNameAs<T extends { id: string; full_name: string }>(name: string, people: T[], exceptId?: string): T[] {
  const key = tidyName(name).toLowerCase();
  return people.filter((p) => p.id !== exceptId && tidyName(p.full_name).toLowerCase() === key);
}

export const PERSON_STATUS: Record<"active" | "off", { word: string; tone: Tone }> = {
  active: { word: "Active", tone: "green" },
  off: { word: "Switched off", tone: "grey" },
};

export function friendlyPeopleError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/switched off/i.test(message)) return message;
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/phone/i.test(message)) return "That does not look like a phone number.";
  if (/email/i.test(message)) return "That does not look like an email address.";
  if (/full_name/i.test(message)) return "Please check the name (1 to 200 characters).";
  return "That could not be saved. Please check the details and try again.";
}

/** Who may see and change people (the database refuses everyone else anyway). */
export const MAY_SEE_PEOPLE = ["super_admin", "centre_admin"];

// ---------------------------------------------------------------------------
// Linking a person to an admin account (P2.2): Super Admin only, never their
// own account, one person per account. The database enforces all of it.

export type Account = { id: string; display_name: string; role: string; active: boolean };
export type AccountChoice = Account & { disabled: boolean; note: string | null };

/**
 * The accounts a Super Admin may link this person to, with why some cannot be
 * picked. `linkedTo` maps account id → the name of the OTHER person it is
 * linked to (leave out this person's own link).
 */
export function accountChoices(accounts: Account[], linkedTo: Map<string, string>, myAccountId: string): AccountChoice[] {
  return accounts.map((a) => {
    if (a.id === myAccountId) return { ...a, disabled: true, note: "your own account" };
    const other = linkedTo.get(a.id);
    if (other) return { ...a, disabled: true, note: `linked to ${other}` };
    return { ...a, disabled: false, note: a.active ? null : "switched off" };
  });
}
