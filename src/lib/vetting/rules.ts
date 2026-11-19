// Plain rules for Garda vetting (slice P2.3): dates, the Record vetting form,
// status words and colours, worst-first order and the CSV file. The database
// enforces the same rules itself and works out each status (migration 0020).
// Owner's choices, 15 Nov 2026: 3 years by default, changeable per person;
// one admin is enough, but never for their own vetting.
import { csvCell } from "@/lib/assets/lists";
import { formatDate, type Tone } from "@/lib/items/rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

/** The usual re-vetting period. Each entry's expiry can be changed. */
export const VETTING_YEARS = 3;
/** "Due" when the expiry is this many days away or fewer. */
export const DUE_WITHIN_DAYS = 60;
/** The latest expiry the database accepts, counted from the vetted date. */
export const MAX_YEARS = 10;

export type VettingKind = "applied" | "vetted" | "not_required";
export type VettingStatus = "valid" | "due" | "applied" | "none" | "expired" | "not_required";

export const VETTING_KIND_LABEL: Record<VettingKind, string> = {
  applied: "Applied for vetting",
  vetted: "Vetted",
  not_required: "Marked not required",
};

export const VETTING_STATUS: Record<VettingStatus, { word: string; tone: Tone }> = {
  valid: { word: "Valid", tone: "green" },
  due: { word: "Due soon", tone: "amber" },
  applied: { word: "Applied", tone: "amber" },
  none: { word: "Not vetted", tone: "red" },
  expired: { word: "Expired", tone: "red" },
  not_required: { word: "Not required", tone: "grey" },
};

/** Worst first, for the vetting list. */
const RANK: Record<VettingStatus, number> = { expired: 0, none: 1, due: 2, applied: 3, valid: 4, not_required: 5 };

/** One row of the database's people_vetting view. */
export type VettingRow = {
  person_id: string;
  full_name: string;
  person_role_id: string;
  section_id: string;
  active: boolean;
  needs_vetting: boolean;
  status: VettingStatus;
  vetted_on: string | null;
  expires_on: string | null;
  /** A re-vetting (or first) application made on or after the latest vetting. */
  applied_on: string | null;
};
export const VETTING_ROW_COLUMNS =
  "person_id, full_name, person_role_id, section_id, active, needs_vetting, status, vetted_on, expires_on, applied_on";

/** One entry in someone's vetting history. */
export type VettingRecord = {
  id: number;
  person_id: string;
  kind: VettingKind;
  happened_on: string;
  expires_on: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string | null;
  created_at: string;
};
export const VETTING_RECORD_COLUMNS =
  "id, person_id, kind, happened_on, expires_on, withdrawn_at, withdrawn_by, withdrawn_reason, created_by, created_at";

// ---------------------------------------------------------------------------
// Dates, as "YYYY-MM-DD" text, worked out at midday world time so a clock
// change can never move a date.

const toDate = (iso: string) => new Date(`${iso}T12:00:00Z`);
const toIso = (d: Date) => d.toISOString().slice(0, 10);

export function isDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false;
  const d = toDate(raw);
  return !Number.isNaN(d.getTime()) && toIso(d) === raw;
}

export function addDays(iso: string, days: number): string {
  const d = toDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Same day and month, `years` later; 29 February becomes 28 February when needed. */
export function addYears(iso: string, years: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y + years, m - 1, d, 12));
  if (target.getUTCMonth() !== m - 1) target.setUTCDate(0); // rolled into March
  return toIso(target);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

export const defaultExpiry = (vettedOn: string) => addYears(vettedOn, VETTING_YEARS);

/** Today's date in Dublin (the same "today" the database uses). */
export function todayInDublin(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
}

// ---------------------------------------------------------------------------
// Forms

export type VettingValues = { kind: VettingKind; happened_on: string; expires_on: string | null };

export function parseVettingForm(get: Get, today: string): Result<VettingValues> {
  const kind = get("kind");
  if (!(kind in VETTING_KIND_LABEL)) return { ok: false, error: "Please say what happened: applied, vetted or not required." };
  const happened_on = get("happened_on").trim();
  if (!happened_on) return { ok: false, error: "Please enter the date." };
  if (!isDate(happened_on)) return { ok: false, error: "The date is not a real date." };
  if (happened_on > today) return { ok: false, error: "The date cannot be in the future." };
  if (kind !== "vetted") return { ok: true, values: { kind: kind as VettingKind, happened_on, expires_on: null } };

  const typed = get("expires_on").trim();
  const expires_on = typed || defaultExpiry(happened_on);
  if (!isDate(expires_on)) return { ok: false, error: "The expiry date is not a real date." };
  if (expires_on <= happened_on) return { ok: false, error: "The expiry date must be after the vetted date." };
  if (expires_on > addYears(happened_on, MAX_YEARS)) {
    return { ok: false, error: `The expiry date cannot be more than ${MAX_YEARS} years after the vetted date.` };
  }
  return { ok: true, values: { kind: "vetted", happened_on, expires_on } };
}

export function parseWithdrawReason(raw: string): Result<string> {
  const reason = raw.trim().replace(/\s+/g, " ");
  if (!reason) return { ok: false, error: "Please say why this entry is wrong." };
  if (reason.length > 500) return { ok: false, error: "The reason is too long (500 characters at most)." };
  return { ok: true, values: reason };
}

export function friendlyVettingError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  // The database's own messages are already written in plain words.
  if (/your own|switched off|future|expiry|after the vetted|years|reason|already withdrawn|date/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}

// ---------------------------------------------------------------------------
// Showing the status

/** One line explaining the status, e.g. "Expires 15 Dec 2026, in 30 days." */
export function statusLine(r: VettingRow, today: string): string {
  const applied = r.applied_on ? ` Re-vetting applied on ${formatDate(r.applied_on)}.` : "";
  switch (r.status) {
    case "valid":
      return `Expires ${formatDate(r.expires_on)}.${applied}`;
    case "due": {
      const left = daysBetween(today, r.expires_on!);
      const when = left === 0 ? `Expires today (${formatDate(r.expires_on)}).` : `Expires ${formatDate(r.expires_on)}, in ${left} ${left === 1 ? "day" : "days"}.`;
      return `${when}${applied}`;
    }
    case "expired":
      return `Expired on ${formatDate(r.expires_on)}.`;
    case "applied":
      return `Applied on ${formatDate(r.applied_on)}. Not vetted yet.`;
    case "none":
      return "Needs Garda vetting. Nothing on record.";
    case "not_required":
      return r.needs_vetting ? "Marked as not required for this person." : "Their role does not need Garda vetting.";
  }
}

export function worstFirst<T extends Pick<VettingRow, "status" | "expires_on" | "full_name">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999") ||
      a.full_name.localeCompare(b.full_name),
  );
}

// ---------------------------------------------------------------------------
// CSV

export const VETTING_CSV_HEADER = ["Name", "Role", "Section", "Status", "Vetted on", "Expires on", "Re-vetting applied on"];

export function vettingCsv(rows: VettingRow[], roleName: Map<string, string>, sectionName: Map<string, string>): string {
  const lines = [
    VETTING_CSV_HEADER,
    ...rows.map((r) => [
      r.full_name,
      roleName.get(r.person_role_id) ?? "",
      sectionName.get(r.section_id) ?? "",
      VETTING_STATUS[r.status].word,
      r.vetted_on ?? "",
      r.expires_on ?? "",
      r.applied_on ?? "",
    ]),
  ];
  // Starts with a marker so Excel reads Arabic text correctly.
  return "﻿" + lines.map((l) => l.map(csvCell).join(",") + "\r\n").join("");
}

/** "icci-garda-vetting-2026-11-15.csv" (the date in Dublin). */
export function vettingFileName(now: Date): string {
  return `icci-garda-vetting-${todayInDublin(now)}.csv`;
}

/** Who may see vetting (the database refuses everyone else anyway). */
export const MAY_SEE_VETTING = ["super_admin", "centre_admin"];
