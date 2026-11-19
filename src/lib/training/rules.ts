// Plain rules for training dates (slice P2.4): the Record training form, the
// training types form, status words and colours, worst-first order and the
// CSV file. The database enforces the same rules itself and works out each
// status (migration 0021). Owner's choices, 16 Nov 2026: each type may have
// a usual length that fills in the expiry (changeable, or left empty);
// "Due soon" is 60 days; only recorded training is shown.
import { csvCell } from "@/lib/assets/lists";
import { formatDate, type Tone } from "@/lib/items/rules";
import { addYears, daysBetween, isDate, todayInDublin } from "@/lib/vetting/rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

/** "Due soon" when the expiry is this many days away or fewer. */
export const DUE_WITHIN_DAYS = 60;
/** The latest expiry the database accepts, counted from the date done. */
export const MAX_YEARS = 10;

export type TrainingStatus = "expired" | "due" | "valid" | "no_expiry";

export const TRAINING_STATUS: Record<TrainingStatus, { word: string; tone: Tone }> = {
  expired: { word: "Expired", tone: "red" },
  due: { word: "Due soon", tone: "amber" },
  valid: { word: "Valid", tone: "green" },
  no_expiry: { word: "No expiry", tone: "green" },
};

/** Worst first, for the training list. */
const RANK: Record<TrainingStatus, number> = { expired: 0, due: 1, valid: 2, no_expiry: 3 };
export const STATUS_ORDER: TrainingStatus[] = ["expired", "due", "valid", "no_expiry"];

export type TrainingType = { id: string; name: string; usual_years: number | null; active: boolean };
export const TRAINING_TYPE_COLUMNS = "id, name, usual_years, active";

/** One row of the database's people_training view: a person's newest course of one type. */
export type TrainingRow = {
  person_id: string;
  full_name: string;
  person_role_id: string;
  section_id: string;
  active: boolean;
  training_type_id: string;
  completed_on: string;
  expires_on: string | null;
  status: TrainingStatus;
};
export const TRAINING_ROW_COLUMNS =
  "person_id, full_name, person_role_id, section_id, active, training_type_id, completed_on, expires_on, status";

/** One entry in someone's training history. */
export type TrainingRecord = {
  id: number;
  person_id: string;
  training_type_id: string;
  completed_on: string;
  expires_on: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string | null;
  created_at: string;
};
export const TRAINING_RECORD_COLUMNS =
  "id, person_id, training_type_id, completed_on, expires_on, withdrawn_at, withdrawn_by, withdrawn_reason, created_by, created_at";

/** The expiry the form fills in: the type's usual length after the date done, or empty. */
export function suggestedExpiry(completedOn: string, usualYears: number | null): string {
  if (!usualYears || !isDate(completedOn)) return "";
  return addYears(completedOn, usualYears);
}

/** "Usually lasts 2 years" or "No usual expiry". */
export function usualLengthText(usualYears: number | null): string {
  if (!usualYears) return "No usual expiry";
  return `Usually lasts ${usualYears} ${usualYears === 1 ? "year" : "years"}`;
}

// ---------------------------------------------------------------------------
// Forms

export type TrainingValues = { training_type_id: string; completed_on: string; expires_on: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** An empty expiry means "no expiry" (the screen fills it in from the type's usual length). */
export function parseTrainingForm(get: Get, today: string): Result<TrainingValues> {
  const training_type_id = get("training_type_id").trim();
  if (!UUID.test(training_type_id)) return { ok: false, error: "Please pick the training type." };
  const completed_on = get("completed_on").trim();
  if (!completed_on) return { ok: false, error: "Please enter the date the training was done." };
  if (!isDate(completed_on)) return { ok: false, error: "The date is not a real date." };
  if (completed_on > today) return { ok: false, error: "The date cannot be in the future." };

  const typed = get("expires_on").trim();
  if (!typed) return { ok: true, values: { training_type_id, completed_on, expires_on: null } };
  if (!isDate(typed)) return { ok: false, error: "The expiry date is not a real date." };
  if (typed <= completed_on) return { ok: false, error: "The expiry date must be after the date the training was done." };
  if (typed > addYears(completed_on, MAX_YEARS)) {
    return { ok: false, error: `The expiry date cannot be more than ${MAX_YEARS} years after the training.` };
  }
  return { ok: true, values: { training_type_id, completed_on, expires_on: typed } };
}

export type TrainingTypeValues = { name: string; usual_years: number | null };

export function parseTrainingTypeForm(get: Get): Result<TrainingTypeValues> {
  const name = get("name").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Please enter a name." };
  if (name.length > 100) return { ok: false, error: "The name is too long (100 characters at most)." };
  const raw = get("usual_years").trim();
  if (!raw) return { ok: true, values: { name, usual_years: null } };
  if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_YEARS) {
    return { ok: false, error: `The usual length is a whole number of years from 1 to ${MAX_YEARS}, or empty for no expiry.` };
  }
  return { ok: true, values: { name, usual_years: Number(raw) } };
}

export function friendlyTrainingError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/duplicate key|unique/i.test(message)) return "There is already a training type with that name.";
  // The database's own messages are already written in plain words.
  if (/your own|switched off|future|expiry|after the date|years|reason|already withdrawn|not on the list|date/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}

// ---------------------------------------------------------------------------
// Showing the status

/** One line explaining the status, e.g. "Done 3 Jan 2026. Expires 3 Jan 2027, in 30 days." */
export function trainingLine(r: Pick<TrainingRow, "status" | "completed_on" | "expires_on">, today: string): string {
  const doneOn = `Done ${formatDate(r.completed_on)}.`;
  switch (r.status) {
    case "no_expiry":
      return `${doneOn} No expiry.`;
    case "valid":
      return `${doneOn} Expires ${formatDate(r.expires_on)}.`;
    case "due": {
      const left = daysBetween(today, r.expires_on!);
      return left === 0
        ? `${doneOn} Expires today (${formatDate(r.expires_on)}).`
        : `${doneOn} Expires ${formatDate(r.expires_on)}, in ${left} ${left === 1 ? "day" : "days"}.`;
    }
    case "expired":
      return `${doneOn} Expired on ${formatDate(r.expires_on)}.`;
  }
}

export function worstFirst<T extends Pick<TrainingRow, "status" | "expires_on" | "full_name">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.expires_on ?? "9999").localeCompare(b.expires_on ?? "9999") ||
      a.full_name.localeCompare(b.full_name),
  );
}

// ---------------------------------------------------------------------------
// CSV

export const TRAINING_CSV_HEADER = ["Name", "Role", "Section", "Training", "Status", "Done on", "Expires on"];

export function trainingCsv(
  rows: TrainingRow[],
  roleName: Map<string, string>,
  sectionName: Map<string, string>,
  typeName: Map<string, string>,
): string {
  const lines = [
    TRAINING_CSV_HEADER,
    ...rows.map((r) => [
      r.full_name,
      roleName.get(r.person_role_id) ?? "",
      sectionName.get(r.section_id) ?? "",
      typeName.get(r.training_type_id) ?? "",
      TRAINING_STATUS[r.status].word,
      r.completed_on,
      r.expires_on ?? "",
    ]),
  ];
  // Starts with a marker so Excel reads Arabic text correctly.
  return "﻿" + lines.map((l) => l.map(csvCell).join(",") + "\r\n").join("");
}

/** "icci-training-2026-11-16.csv" (the date in Dublin). */
export function trainingFileName(now: Date): string {
  return `icci-training-${todayInDublin(now)}.csv`;
}

/** Who may see training (the database refuses everyone else anyway). */
export const MAY_SEE_TRAINING = ["super_admin", "centre_admin"];
