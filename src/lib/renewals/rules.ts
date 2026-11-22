// Plain rules for the renewals register (slice P2.8): status words and
// colours, where each row comes from and where it opens, worst-first order,
// and the renewal forms. The database enforces the same rules and works out
// each status (migration 0026). Owner's choices, 16 Nov 2026: the owner is a
// switched-on person or nobody; an ended warranty is grey "Ended", not
// overdue; training dates are left out; Super Admin and Centre Admin only.
import type { Tone } from "@/lib/items/rules";
import { addYears, isDate } from "@/lib/vetting/rules";
import { UUID } from "@/lib/forms";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export const MAY_SEE_RENEWALS = ["super_admin", "centre_admin"];
/** "Due soon" when this many days or fewer are left (matches the 60-day reminder). */
export const DUE_WITHIN_DAYS = 60;
/** A due date can be at most this many years from today. */
export const MAX_DUE_YEARS = 10;

export const CATEGORIES = ["Insurance", "Licence or permit", "Safety inspection", "Service contract", "Certificate", "Subscription", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];

export type RegisterStatus = "overdue" | "none" | "due" | "ok" | "ended";
export const REGISTER_STATUS: Record<RegisterStatus, { word: string; tone: Tone }> = {
  overdue: { word: "Overdue", tone: "red" },
  none: { word: "No due date", tone: "red" },
  due: { word: "Due soon", tone: "amber" },
  ok: { word: "Up to date", tone: "green" },
  ended: { word: "Ended", tone: "grey" },
};
const RANK: Record<RegisterStatus, number> = { overdue: 0, none: 1, due: 2, ok: 3, ended: 4 };
/** "Needs attention" on the list: everything that is not up to date or an ended warranty. */
export const NEEDS_ATTENTION: RegisterStatus[] = ["overdue", "none", "due"];

export type Source = "manual" | "vehicle_tax" | "vehicle_insurance" | "vehicle_nct" | "vetting" | "policy_review" | "warranty";
/** The groups the "From" filter offers. */
export type SourceGroup = "manual" | "vehicles" | "vetting" | "policies" | "warranties";
export const SOURCE_GROUPS: { id: SourceGroup; label: string; sources: Source[] }[] = [
  { id: "manual", label: "Typed in here", sources: ["manual"] },
  { id: "vehicles", label: "Vehicles", sources: ["vehicle_tax", "vehicle_insurance", "vehicle_nct"] },
  { id: "vetting", label: "Garda vetting", sources: ["vetting"] },
  { id: "policies", label: "Policy reviews", sources: ["policy_review"] },
  { id: "warranties", label: "Warranties", sources: ["warranty"] },
];
export const SOURCE_LABEL: Record<Source, string> = {
  manual: "Typed in here",
  vehicle_tax: "Vehicle",
  vehicle_insurance: "Vehicle",
  vehicle_nct: "Vehicle",
  vetting: "Garda vetting",
  policy_review: "Policy",
  warranty: "Asset warranty",
};

/** One row of the database's renewals_register view. */
export type RegisterRow = {
  source: Source;
  record_id: string;
  title: string;
  category: string;
  owner_person_id: string | null;
  due_on: string | null;
  status: RegisterStatus;
  note: string | null;
};
export const REGISTER_COLUMNS = "source, record_id, title, category, owner_person_id, due_on, status, note";

/** Where a row opens: the renewal itself, or the vehicle, person, policy or asset it comes from. */
export function hrefOf(r: Pick<RegisterRow, "source" | "record_id">): string {
  switch (r.source) {
    case "manual":
      return `/renewals/${r.record_id}`;
    case "vehicle_tax":
    case "vehicle_insurance":
    case "vehicle_nct":
      return `/vehicles/${r.record_id}`;
    case "vetting":
      return `/people/${r.record_id}`;
    case "policy_review":
      return `/policies/${r.record_id}`;
    case "warranty":
      return `/items/${r.record_id}`;
  }
}

/** Worst first, then the soonest due date, then by title. */
export function worstFirst<T extends Pick<RegisterRow, "status" | "due_on" | "title">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.status] - RANK[b.status] ||
      (a.due_on ?? "9999-12-31").localeCompare(b.due_on ?? "9999-12-31") ||
      a.title.localeCompare(b.title),
  );
}

/** "Due in 12 days", "Due today", "3 days overdue", "Ended 4 days ago". */
export function dueLine(dueOn: string | null, status: RegisterStatus, daysLeft: number | null): string {
  if (!dueOn || daysLeft === null) return "No due date recorded.";
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  if (status === "ended") return `Ended ${days(-daysLeft)} ago.`;
  if (daysLeft < 0) return `${days(-daysLeft)} overdue.`;
  if (daysLeft === 0) return "Due today.";
  return `Due in ${days(daysLeft)}.`;
}

export type RegisterFilter = { show: "attention" | "ok" | "ended" | "all"; from: SourceGroup | "" };

export function readRegisterFilter(params: Record<string, string | string[] | undefined>): RegisterFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const show = one(params.show);
  const from = one(params.from);
  return {
    show: show === "ok" || show === "ended" || show === "all" ? show : "attention",
    from: SOURCE_GROUPS.some((g) => g.id === from) ? (from as SourceGroup) : "",
  };
}

/** The statuses a "Show" choice lists. */
export function statusesFor(show: RegisterFilter["show"]): RegisterStatus[] {
  if (show === "ok") return ["ok"];
  if (show === "ended") return ["ended"];
  if (show === "all") return ["overdue", "none", "due", "ok", "ended"];
  return NEEDS_ATTENTION;
}

// ---------------------------------------------------------------------------
// Forms

const tidy = (s: string) => s.trim().replace(/\s+/g, " ");

export type RenewalValues = {
  title: string;
  category: Category;
  owner_person_id: string | null;
  documents_needed: string | null;
  notes: string | null;
};

export function parseRenewalDetails(get: Get): Result<RenewalValues> {
  const title = tidy(get("title"));
  if (!title) return { ok: false, error: "Please enter what needs renewing." };
  if (title.length > 150) return { ok: false, error: "The title is too long (150 characters at most)." };
  const category = get("category") as Category;
  if (!CATEGORIES.includes(category)) return { ok: false, error: "Please pick a category." };
  const owner = get("owner_person_id").trim();
  if (owner && !UUID.test(owner)) return { ok: false, error: "Please pick the owner from the list." };
  const documents_needed = get("documents_needed").trim() || null;
  if (documents_needed && documents_needed.length > 1000) return { ok: false, error: "Documents needed is too long (1,000 characters at most)." };
  const notes = get("notes").trim() || null;
  if (notes && notes.length > 2000) return { ok: false, error: "The notes are too long (2,000 characters at most)." };
  return { ok: true, values: { title, category, owner_person_id: owner || null, documents_needed, notes } };
}

export function parseDueDate(raw: string, today: string): Result<string> {
  const due = raw.trim();
  if (!due) return { ok: false, error: "Please enter the due date." };
  if (!isDate(due)) return { ok: false, error: "The due date is not a real date." };
  if (due > addYears(today, MAX_DUE_YEARS)) return { ok: false, error: `The due date cannot be more than ${MAX_DUE_YEARS} years from today.` };
  return { ok: true, values: due };
}

export type RenewedValues = { renewed_on: string; due_on: string };

export function parseRenewedForm(get: Get, today: string): Result<RenewedValues> {
  const renewed_on = get("renewed_on").trim();
  if (!renewed_on) return { ok: false, error: "Please enter the date it was renewed." };
  if (!isDate(renewed_on)) return { ok: false, error: "The renewal date is not a real date." };
  if (renewed_on > today) return { ok: false, error: "The renewal date cannot be in the future." };
  const due = parseDueDate(get("due_on"), today);
  if (!due.ok) return { ok: false, error: due.error.replace("the due date", "the next due date").replace("The due date", "The next due date") };
  if (due.values <= renewed_on) return { ok: false, error: "The next due date must be after the renewal date." };
  return { ok: true, values: { renewed_on, due_on: due.values } };
}

/** The next due date the "Mark renewed" form fills in: one year after the renewal. */
export const suggestedNextDue = (renewedOn: string) => (isDate(renewedOn) ? addYears(renewedOn, 1) : "");

export function friendlyRenewalError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/renewals_category_check/i.test(message)) return "Please pick a category from the list.";
  // The database's own messages are already written in plain words.
  if (/owner|switched off|future|due date|title|years|reason|already withdrawn|could not be found|cannot be/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}
