// Plain rules for policy sign-offs and the grid (slice P2.6): the Record
// sign-off form, scan checks, status words and colours, and arranging the
// grid. The database enforces the same rules and works out every square
// (migration 0024). Owner's choices: overdue = still unsigned 30 days after
// publishing; scans optional; nobody records their own sign-off.
import type { Tone } from "@/lib/items/rules";
import { isDate } from "@/lib/vetting/rules";
import { UUID } from "@/lib/forms";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export const OVERDUE_DAYS = 30;
export const MAX_SCAN_BYTES = 6 * 1024 * 1024;
export const SCAN_BUCKET = "signoff-scans";

export type SquareStatus = "signed" | "unsigned" | "overdue";

export const SIGNOFF_STATUS: Record<SquareStatus, { word: string; tone: Tone }> = {
  overdue: { word: "Overdue", tone: "red" },
  unsigned: { word: "Unsigned", tone: "amber" },
  signed: { word: "Signed", tone: "green" },
};
export const SQUARE_ORDER: SquareStatus[] = ["overdue", "unsigned", "signed"];
const RANK: Record<SquareStatus, number> = { overdue: 0, unsigned: 1, signed: 2 };

/** One square of the database's policy_grid view. */
export type Square = {
  person_id: string;
  full_name: string;
  person_role_id: string;
  section_id: string;
  policy_id: string;
  title: string;
  policy_version_id: string;
  version_label: string;
  published_on: string;
  signed_on: string | null;
  status: SquareStatus;
};
export const SQUARE_COLUMNS =
  "person_id, full_name, person_role_id, section_id, policy_id, title, policy_version_id, version_label, published_on, signed_on, status";

export type Signoff = {
  id: number;
  person_id: string;
  policy_version_id: string;
  signed_on: string;
  scan_path: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string | null;
  created_at: string;
};
export const SIGNOFF_COLUMNS =
  "id, person_id, policy_version_id, signed_on, scan_path, withdrawn_at, withdrawn_by, withdrawn_reason, created_by, created_at";

/** "3 of 5 signed". */
export function signedText(squares: Pick<Square, "status">[]): string {
  const signed = squares.filter((s) => s.status === "signed").length;
  return `${signed} of ${squares.length} signed`;
}

/** Worst square first, then by name. */
export function worstFirst<T extends Pick<Square, "status" | "full_name">>(squares: T[]): T[] {
  return [...squares].sort((a, b) => RANK[a.status] - RANK[b.status] || a.full_name.localeCompare(b.full_name));
}

export type GridPolicy = { id: string; title: string; version_label: string };
export type GridPerson = { id: string; full_name: string; person_role_id: string; section_id: string; squares: Map<string, Square> };

/**
 * People down the side (by name), policies across the top (by title), and
 * the square for each pair. A person appears only if at least one policy
 * applies to them; a missing square means "this policy does not apply".
 */
export function arrangeGrid(squares: Square[]): { policies: GridPolicy[]; people: GridPerson[] } {
  const policies = new Map<string, GridPolicy>();
  const people = new Map<string, GridPerson>();
  for (const s of squares) {
    if (!policies.has(s.policy_id)) policies.set(s.policy_id, { id: s.policy_id, title: s.title, version_label: s.version_label });
    let p = people.get(s.person_id);
    if (!p) {
      p = { id: s.person_id, full_name: s.full_name, person_role_id: s.person_role_id, section_id: s.section_id, squares: new Map() };
      people.set(s.person_id, p);
    }
    p.squares.set(s.policy_id, s);
  }
  return {
    policies: [...policies.values()].sort((a, b) => a.title.localeCompare(b.title)),
    people: [...people.values()].sort((a, b) => a.full_name.localeCompare(b.full_name)),
  };
}

/** A5: "attention" is what Home counts: people with any square overdue or not signed. */
export type GridFilter = { section: string; role: string; status: SquareStatus | "attention" | "" };

export function readGridFilter(params: Record<string, string | string[] | undefined>, sections: Set<string>, roles: Set<string>): GridFilter {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");
  const section = one(params.section);
  const role = one(params.role);
  const status = one(params.status);
  return {
    section: sections.has(section) ? section : "",
    role: roles.has(role) ? role : "",
    status: status === "attention" ? "attention" : (SQUARE_ORDER as string[]).includes(status) ? (status as SquareStatus) : "",
  };
}

/** The grid's filter as an address part ("section=…&status=…"); empty when nothing is chosen. */
export function gridQuery(f: GridFilter): string {
  return new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
}

/**
 * A7: the grid's filter carried through a sign-off (`?grid=…`), read back
 * safely: only the three filter names, each a plain word or id.
 */
export function readGridBack(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string") return null;
  const kept = new URLSearchParams();
  for (const [k, v] of new URLSearchParams(raw)) {
    if ((k === "section" || k === "role" || k === "status") && /^[\w-]{1,64}$/.test(v)) kept.set(k, v);
  }
  return kept.toString();
}

/** Squares for the chosen section and role; "status" keeps only people with at least one square of that status. */
export function filterSquares(squares: Square[], f: GridFilter): Square[] {
  let out = squares.filter((s) => (!f.section || s.section_id === f.section) && (!f.role || s.person_role_id === f.role));
  if (f.status) {
    const hit = (s: Square) => (f.status === "attention" ? s.status === "overdue" || s.status === "unsigned" : s.status === f.status);
    const keep = new Set(out.filter(hit).map((s) => s.person_id));
    out = out.filter((s) => keep.has(s.person_id));
  }
  return out;
}

// ---------------------------------------------------------------------------
// The Record sign-off form

export type SignoffValues = { people: string[]; signed_on: string };

export function parseSignoffForm(get: Get, ticked: string[], today: string, approvedOn: string): Result<SignoffValues> {
  const people = [...new Set(ticked.filter((id) => UUID.test(id)))];
  if (people.length === 0) return { ok: false, error: "Please tick at least one person who signed." };
  const signed_on = get("signed_on").trim();
  if (!signed_on) return { ok: false, error: "Please enter the date the sheet was signed." };
  if (!isDate(signed_on)) return { ok: false, error: "The date is not a real date." };
  if (signed_on > today) return { ok: false, error: "The date signed cannot be in the future." };
  if (signed_on < approvedOn) return { ok: false, error: "The date signed cannot be before the version was approved." };
  return { ok: true, values: { people, signed_on } };
}

const SCAN_TYPES: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The scan sent with the form: null if none, a sentence if not acceptable, else the file and its ending. */
export function scanFrom(form: FormData): { file: File; ext: string } | null | string {
  const f = form.get("scan");
  if (!(f instanceof File) || f.size === 0) return null;
  const ext = SCAN_TYPES[f.type];
  if (!ext) return "The scan must be a PDF or a JPEG, PNG or WebP picture.";
  if (f.size > MAX_SCAN_BYTES) return "The scan is too large (over 6 MB).";
  return { file: f, ext };
}

/** Where a scan is saved: a new file in the version's folder, never replaced. */
export function scanPath(versionId: string, ext: string, fileId: string = crypto.randomUUID()): string {
  return `signoffs/${versionId}/${fileId}.${ext}`;
}

export function friendlySignoffError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/policy_signoffs_one_live|duplicate key|unique/i.test(message)) return "One of the people ticked has already signed this version.";
  // The database's own messages are already written in plain words.
  if (/your own|switched off|future|approved|published version|scan|reason|already withdrawn|directory|could not be found/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}
