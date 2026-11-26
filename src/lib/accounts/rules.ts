// The accounts screen's plain rules (Round C5): who may use it, the form, the
// temporary password, and how each account's state is said in words.
import { randomInt } from "node:crypto";
import type { Tone } from "@/lib/items/rules";

export const MAY_MANAGE_ACCOUNTS = ["super_admin"];

export const ROLE_CHOICES = [
  { code: "centre_admin", label: "Centre Admin", hint: "Uses every module, approves entries, publishes the rota and policies." },
  { code: "finance", label: "Finance", hint: "Expenses, the monthly export, the Board report and the asset register." },
  { code: "super_admin", label: "Super Admin", hint: "Everything a Centre Admin can, plus accounts and the audit log." },
  { code: "library_operator", label: "Library Operator", hint: "The lending library only. Signs in with an emailed code, no password." },
] as const;
export type RoleCode = (typeof ROLE_CHOICES)[number]["code"];

export type AccountRow = {
  id: string;
  display_name: string;
  role: string;
  role_label: string;
  sign_in_method: string;
  active: boolean;
  email: string;
  temporary_password_until: string | null;
  has_authenticator: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  person_id: string | null;
  person_name: string | null;
};

export type NewAccount = { display_name: string; email: string; role: RoleCode };

/** The "Add an account" form. */
export function parseNewAccount(get: (name: string) => string): { ok: true; values: NewAccount } | { ok: false; error: string } {
  const display_name = get("display_name").trim().replace(/\s+/g, " ");
  if (!display_name) return { ok: false, error: "Enter the name to show for this account." };
  if (display_name.length > 80) return { ok: false, error: "Keep the name to 80 characters or fewer." };
  const email = get("email").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: "Enter an email address, for example name@example.com." };
  const role = get("role");
  if (!ROLE_CHOICES.some((r) => r.code === role)) return { ok: false, error: "Choose the role." };
  return { ok: true, values: { display_name, email, role: role as RoleCode } };
}

/**
 * A one-time temporary password: four groups of four letters and numbers,
 * easy to read aloud or type (no 0/O, 1/l/I). Always meets the password
 * rule (12 or more characters, letters and numbers; scripts/password-rule.mjs).
 */
export function temporaryPassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  for (;;) {
    const groups = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => all[randomInt(all.length)]).join(""));
    const p = groups.join("-");
    if (/[A-Za-z]/.test(p) && /[0-9]/.test(p)) return p;
  }
}

/** Where an account stands, in words, with a colour. */
export function accountState(a: Pick<AccountRow, "active" | "temporary_password_until" | "has_authenticator" | "sign_in_method">, now = Date.now()): { word: string; tone: Tone } {
  if (!a.active) return { word: "Switched off", tone: "grey" };
  if (a.temporary_password_until) {
    return Date.parse(a.temporary_password_until) < now ? { word: "Temporary password ran out", tone: "red" } : { word: "Waiting for first sign-in", tone: "amber" };
  }
  if (a.sign_in_method === "authenticator" && !a.has_authenticator) return { word: "Authenticator to set up", tone: "amber" };
  return { word: "Active", tone: "green" };
}

export const EVENT_WORDS: Record<string, string> = {
  created: "Account added",
  temporary_password: "New temporary password given",
  two_factor_reset: "Two-factor reset (authenticator removed)",
  set_up_finished: "First sign-in finished: own password chosen, authenticator set up",
  switched_off: "Switched off",
  switched_on: "Switched back on",
};

/** The database's refusals are already plain words; anything else is not shown. */
export function friendlyAccountError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/already been registered|already registered|email_exists/i.test(message)) return "That email address already has a sign-in.";
  if (/Super Admin|own account|role|name|exist|account|password|code/i.test(message)) return message;
  return "That could not be done. Please try again.";
}
