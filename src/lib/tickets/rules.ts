// Plain rules for maintenance tickets (slice P3.5), kept free of the database
// and the browser so they can be unit-tested. The database enforces the
// real rules itself (migration 0032); these only decide what the screens
// offer, how lists are ordered and what they say.
import { toCsv } from "@/lib/assets/lists";
import { parseEuro, type Tone } from "@/lib/items/rules";
import { UUID } from "@/lib/forms";

export type TicketStatus = "open" | "in_progress" | "waiting" | "closed";
export type TicketPriority = "low" | "normal" | "urgent";
export type TicketEventKind = "opened" | "assigned" | "status" | "priority" | "note" | "closed" | "reopened" | "referred";

/** Who may see tickets (the database refuses everyone else anyway). */
export const MAY_SEE_TICKETS = ["super_admin", "centre_admin"];

export const TICKET_STATUSES: TicketStatus[] = ["open", "in_progress", "waiting", "closed"];
export const TICKET_PRIORITIES: TicketPriority[] = ["urgent", "normal", "low"];

/** Closed green; in progress and waiting amber; open red. Always with the word. */
export const STATUS_LABEL: Record<TicketStatus, { word: string; tone: Tone }> = {
  open: { word: "Open", tone: "red" },
  in_progress: { word: "In progress", tone: "amber" },
  waiting: { word: "Waiting", tone: "amber" },
  closed: { word: "Closed", tone: "green" },
};

/** Urgent red, normal and low grey (the status carries the main colour). */
export const PRIORITY_LABEL: Record<TicketPriority, { word: string; tone: Tone }> = {
  urgent: { word: "Urgent", tone: "red" },
  normal: { word: "Normal", tone: "grey" },
  low: { word: "Low", tone: "grey" },
};

export const isStatus = (v: string): v is TicketStatus => (TICKET_STATUSES as string[]).includes(v);
export const isPriority = (v: string): v is TicketPriority => (TICKET_PRIORITIES as string[]).includes(v);

export type TicketRow = {
  id: number;
  description: string;
  priority: TicketPriority;
  item_id: string | null;
  location_id: string;
  reported_by: string | null;
  reported_by_person_id: string | null;
  photo_path: string | null;
  asset_event_id: number | null;
  status: TicketStatus;
  assigned_person_id: string | null;
  closing_note: string | null;
  cost_cents: number | null;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
};

export const TICKET_COLUMNS =
  "id, description, priority, item_id, location_id, reported_by, reported_by_person_id, photo_path, asset_event_id, status, assigned_person_id, closing_note, cost_cents, closed_at, created_by, created_at";

export type TicketEventRow = {
  id: number;
  ticket_id: number;
  kind: TicketEventKind;
  note: string | null;
  photo_path: string | null;
  new_status: TicketStatus | null;
  new_assignee_person_id: string | null;
  /** P3.6 */
  new_priority: TicketPriority | null;
  /** P3.6: the "mark repaired" asset entry saved with a closing entry. */
  asset_event_id: number | null;
  cost_cents: number | null;
  /** P1.21: "passed to a company": which company, and their job number. */
  company_id?: string | null;
  company_job_ref?: string | null;
  created_by: string | null;
  created_at: string;
};

export const TICKET_EVENT_COLUMNS =
  "id, ticket_id, kind, note, photo_path, new_status, new_assignee_person_id, new_priority, asset_event_id, cost_cents, company_id, company_job_ref, created_by, created_at";

/** "T-0042": short enough to say on the phone. */
export function ticketNumber(id: number): string {
  return `T-${String(id).padStart(4, "0")}`;
}

/** The first line of a description, cut to fit a list. */
export function shortDescription(text: string, max = 90): string {
  const first = text.split(/\r?\n/)[0].trim();
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
}

const STATUS_ORDER: Record<TicketStatus, number> = { open: 0, in_progress: 1, waiting: 2, closed: 3 };
const PRIORITY_ORDER: Record<TicketPriority, number> = { urgent: 0, normal: 1, low: 2 };

/**
 * The list order: tickets not yet closed first, urgent at the top of them,
 * then by status (open, in progress, waiting), oldest first so nothing is
 * forgotten. Closed tickets last, most recently closed first.
 */
export function listOrder(a: TicketRow, b: TicketRow): number {
  const closedA = a.status === "closed" ? 1 : 0;
  const closedB = b.status === "closed" ? 1 : 0;
  if (closedA !== closedB) return closedA - closedB;
  if (closedA) return (b.closed_at ?? "").localeCompare(a.closed_at ?? "") || b.id - a.id;
  return (
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    a.created_at.localeCompare(b.created_at) ||
    a.id - b.id
  );
}

/** One line saying what a history entry did. */
export function describeTicketEvent(e: TicketEventRow, personName: Map<string, string>, companyName: Map<string, string> = new Map()): string {
  switch (e.kind) {
    case "opened":
      return "Reported";
    case "assigned":
      return `Assigned to ${e.new_assignee_person_id ? (personName.get(e.new_assignee_person_id) ?? "a person in the directory") : "nobody"}`;
    case "status":
      return `Status: ${e.new_status ? STATUS_LABEL[e.new_status].word : "unknown"}`;
    case "priority":
      return `Priority: ${e.new_priority ? PRIORITY_LABEL[e.new_priority].word : "unknown"}`;
    case "note":
      return "Note";
    case "closed":
      return "Closed";
    case "reopened":
      return "Reopened";
    case "referred":
      return `Passed to ${e.company_id ? (companyName.get(e.company_id) ?? "a company") : "a company"}${e.company_job_ref ? ` (their job number ${e.company_job_ref})` : ""}`;
  }
}

// ---------------------------------------------------------------------------
// The "Report a problem" form

export type TicketFormValues = {
  description: string;
  priority: TicketPriority;
  item_id?: string;
  location_id?: string;
  reported_by?: string;
  reported_by_person_id?: string;
};

/** Checks what was typed into "Report a problem". The asset, if any, comes from the address, not the form. */
export function parseTicketForm(
  get: (name: string) => string,
  itemId: string | null,
): { ok: true; values: TicketFormValues } | { ok: false; error: string } {
  const description = get("description").trim();
  if (!description) return { ok: false, error: "Describe the problem." };
  if (description.length > 2000) return { ok: false, error: "The description is too long (2,000 characters at most)." };

  const priority = get("priority") || "normal";
  if (!isPriority(priority)) return { ok: false, error: "Choose Low, Normal or Urgent." };
  const values: TicketFormValues = { description, priority };

  if (itemId) {
    if (!UUID.test(itemId)) return { ok: false, error: "This asset could not be found." };
    values.item_id = itemId;
  } else {
    const place = get("location_id").trim();
    if (!place) return { ok: false, error: "Pick where the problem is." };
    if (!UUID.test(place)) return { ok: false, error: "Pick a place from the list." };
    values.location_id = place;
  }

  const picked = get("reported_by_person_id").trim();
  if (picked && picked !== "other") {
    if (!UUID.test(picked)) return { ok: false, error: "Pick a person from the list, or choose 'Someone else'." };
    values.reported_by_person_id = picked;
  } else {
    const who = get("reported_by").trim();
    if (!who) return { ok: false, error: picked === "other" ? "Type the name of who reported it." : "Say who reported it." };
    if (who.length > 200) return { ok: false, error: "The name is too long (200 characters at most)." };
    values.reported_by = who;
  }
  return { ok: true, values };
}

// ---------------------------------------------------------------------------
// The steps on a ticket's page (P3.6)

export type TicketStep = "assign" | "status" | "priority" | "note" | "close" | "reopen" | "refer";
export const TICKET_STEPS: TicketStep[] = ["assign", "status", "priority", "note", "close", "reopen", "refer"];
export const isTicketStep = (v: string): v is TicketStep => (TICKET_STEPS as string[]).includes(v);

/** What the page says once a step is saved (?done=…). */
export const STEP_DONE: Record<TicketStep, string> = {
  assign: "Ticket assigned.",
  status: "Status changed.",
  priority: "Priority changed.",
  note: "Note added.",
  close: "Ticket closed.",
  reopen: "Ticket reopened.",
  refer: "Recorded as passed to the company.",
};

/** Which status buttons an open ticket shows: every status it is not in now (closing has its own button). */
export function statusChoices(current: TicketStatus): Exclude<TicketStatus, "closed">[] {
  if (current === "closed") return [];
  return (["in_progress", "waiting", "open"] as const).filter((s) => s !== current);
}

/** The words on a status button. */
export const STATUS_BUTTON: Record<Exclude<TicketStatus, "closed">, string> = {
  in_progress: "Mark in progress",
  waiting: "Mark waiting",
  open: "Back to open",
};

export type StepValues =
  | { step: "assign"; person: string; note: string | null }
  | { step: "status"; status: Exclude<TicketStatus, "closed">; note: string | null }
  | { step: "priority"; priority: TicketPriority; note: string | null }
  | { step: "note"; note: string }
  | { step: "close"; note: string; costCents: number | null; repaired: "good" | "fair" | null }
  | { step: "reopen"; note: string }
  | { step: "refer"; company: string; jobRef: string | null; note: string | null };

/** Checks what was sent with one step on a ticket's page. */
export function parseStepForm(step: TicketStep, get: (name: string) => string): { ok: true; values: StepValues } | { ok: false; error: string } {
  const note = get("note").trim();
  if (note.length > 2000) return { ok: false, error: "The note is too long (2,000 characters at most)." };
  const optional = note || null;
  switch (step) {
    case "assign": {
      const person = get("person").trim();
      if (!UUID.test(person)) return { ok: false, error: "Pick who the ticket is assigned to." };
      return { ok: true, values: { step, person, note: optional } };
    }
    case "status": {
      const s = get("status");
      if (s !== "open" && s !== "in_progress" && s !== "waiting") return { ok: false, error: "Choose open, in progress or waiting." };
      return { ok: true, values: { step, status: s, note: optional } };
    }
    case "priority": {
      const p = get("priority");
      if (!isPriority(p)) return { ok: false, error: "Choose Low, Normal or Urgent." };
      return { ok: true, values: { step, priority: p, note: optional } };
    }
    case "note":
      if (!note) return { ok: false, error: "Write the note." };
      return { ok: true, values: { step, note } };
    case "close": {
      if (!note) return { ok: false, error: "Write a closing note saying what was done." };
      const cost = parseEuro(get("cost"));
      if (cost === undefined) return { ok: false, error: "Write the cost in euro, for example 45.50, or leave it empty." };
      if (cost != null && cost > 100_000_000) return { ok: false, error: "That cost is too large." };
      const r = get("repaired");
      if (r && r !== "good" && r !== "fair") return { ok: false, error: "Choose Good or Fair." };
      return { ok: true, values: { step, note, costCents: cost, repaired: r === "good" || r === "fair" ? r : null } };
    }
    case "reopen":
      if (!note) return { ok: false, error: "Write the reason for reopening." };
      return { ok: true, values: { step, note } };
    case "refer": {
      const company = get("company").trim();
      if (!UUID.test(company)) return { ok: false, error: "Pick the company it was passed to." };
      const jobRef = get("job_ref").trim();
      if (jobRef.length > 60) return { ok: false, error: "Keep their job number to 60 characters or fewer." };
      return { ok: true, values: { step, company, jobRef: jobRef || null, note: optional } };
    }
  }
}

/** Turns a database refusal into a sentence for the screen. */
export function friendlyTicketError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/maintenance_tickets_asset_event_id_key/i.test(message)) return "A ticket has already been opened from this damage report.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/^[A-Z][^\n]{5,200}\.$/.test(message.trim())) return message.trim();
  return "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------------
// The list's filters, read from the address (?status=…&priority=…&place=…&assigned=…)

export type TicketFilters = {
  /** "not_closed" (the starting choice), "all", or one status. */
  status: "not_closed" | "all" | TicketStatus;
  priority: "" | TicketPriority;
  place: string;
  /** A person's id, "nobody", or "" for anyone. */
  assigned: string;
  /** P1.21: tickets passed to one company (its id), or "" for any. */
  company: string;
};

export function readFilters(params: Record<string, string | string[] | undefined>): TicketFilters {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const s = one("status");
  const p = one("priority");
  const place = one("place");
  const assigned = one("assigned");
  const company = one("company");
  return {
    status: s === "all" || isStatus(s) ? s : "not_closed",
    priority: isPriority(p) ? p : "",
    place: UUID.test(place) ? place : "",
    assigned: assigned === "nobody" || UUID.test(assigned) ? assigned : "",
    company: UUID.test(company) ? company : "",
  };
}

/** The same filters as an address query, for the CSV link. */
export function filtersQuery(f: TicketFilters): string {
  const q = new URLSearchParams();
  if (f.status !== "not_closed") q.set("status", f.status);
  if (f.priority) q.set("priority", f.priority);
  if (f.place) q.set("place", f.place);
  if (f.assigned) q.set("assigned", f.assigned);
  if (f.company) q.set("company", f.company);
  const s = q.toString();
  return s ? `?${s}` : "";
}

// ---------------------------------------------------------------------------
// CSV

export const TICKETS_CSV_HEADER = [
  "Ticket",
  "Reported",
  "Priority",
  "Status",
  "Place",
  "Asset",
  "Description",
  "Reported by",
  "Assigned to",
  "Closed",
  "Closing note",
  "Cost (EUR)",
];

export type TicketCsvRow = TicketRow & { place: string; asset: string; reporter: string; assignee: string };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" }) : "");

export function ticketsCsv(rows: TicketCsvRow[]): string {
  return toCsv([
    TICKETS_CSV_HEADER,
    ...rows.map((r) => [
      ticketNumber(r.id),
      day(r.created_at),
      PRIORITY_LABEL[r.priority].word,
      STATUS_LABEL[r.status].word,
      r.place,
      r.asset,
      r.description,
      r.reporter,
      r.assignee,
      day(r.closed_at),
      r.closing_note ?? "",
      r.cost_cents == null ? "" : (r.cost_cents / 100).toFixed(2),
    ]),
  ]);
}

/** "icci-tickets-2026-11-18.csv" (the date in Dublin). */
export function ticketsFileName(now: Date): string {
  return `icci-tickets-${day(now.toISOString())}.csv`;
}
