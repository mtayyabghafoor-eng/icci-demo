// Plain rules for policies and versions (slice P2.5): the policy form, the
// version form, PDF checks, status words and colours, and who may publish.
// The database enforces the same rules itself (migration 0022).
// Owner's choices, 16 Nov 2026: a different admin publishes (never the one
// who uploaded or last changed the version); the next review date is
// required and suggested as one year after approval.
import type { Tone } from "@/lib/items/rules";
import { addYears, isDate } from "@/lib/vetting/rules";
import { UUID } from "@/lib/forms";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

/** The review date the form suggests, in years after approval. */
export const REVIEW_YEARS = 1;
/** The latest review date the database accepts, in years after approval. */
export const MAX_REVIEW_YEARS = 5;
/** "Review due soon" when the review date is this many days away or fewer. */
export const REVIEW_DUE_DAYS = 60;
export const MAX_PDF_BYTES = 10 * 1024 * 1024;
export const POLICY_BUCKET = "policy-files";

export const MAY_SEE_POLICIES = ["super_admin", "centre_admin"];

export type ReviewStatus = "none" | "overdue" | "due" | "ok";

export const REVIEW_STATUS: Record<ReviewStatus, { word: string; tone: Tone }> = {
  overdue: { word: "Review overdue", tone: "red" },
  due: { word: "Review due soon", tone: "amber" },
  ok: { word: "Up to date", tone: "green" },
  none: { word: "Not published yet", tone: "grey" },
};
/** Worst first, for the policies list. */
const RANK: Record<ReviewStatus, number> = { overdue: 0, due: 1, none: 2, ok: 3 };

/** One row of the database's policies_overview view. */
export type PolicyRow = {
  id: string;
  title: string;
  owner_person_id: string;
  active: boolean;
  current_version_id: string | null;
  current_label: string | null;
  approved_on: string | null;
  next_review_on: string | null;
  published_at: string | null;
  has_draft: boolean;
  review_status: ReviewStatus;
  must_sign: number;
};
export const POLICY_ROW_COLUMNS =
  "id, title, owner_person_id, active, current_version_id, current_label, approved_on, next_review_on, published_at, has_draft, review_status, must_sign";

export type PolicyVersion = {
  id: string;
  policy_id: string;
  version_label: string;
  file_path: string;
  /** D7: the Arabic PDF, if there is one. */
  file_path_ar: string | null;
  approved_on: string;
  next_review_on: string;
  status: "draft" | "published";
  published_by: string | null;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
};
export const POLICY_VERSION_COLUMNS =
  "id, policy_id, version_label, file_path, file_path_ar, approved_on, next_review_on, status, published_by, published_at, created_by, created_at, updated_by";

/** The words for a version: the current one, a draft, or an older one that was replaced. */
export function versionStatus(v: Pick<PolicyVersion, "id" | "status">, currentId: string | null): { word: string; tone: Tone } {
  if (v.status === "draft") return { word: "Draft", tone: "amber" };
  if (v.id === currentId) return { word: "Current", tone: "green" };
  return { word: "Replaced", tone: "grey" };
}

/** Worst first: review overdue, due soon, not published, up to date; then by title. */
export function worstFirst<T extends Pick<PolicyRow, "review_status" | "next_review_on" | "title">>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      RANK[a.review_status] - RANK[b.review_status] ||
      (a.next_review_on ?? "").localeCompare(b.next_review_on ?? "") ||
      a.title.localeCompare(b.title),
  );
}

/** Nobody publishes a version they uploaded or last changed (the database checks this too). */
export function mayPublish(v: Pick<PolicyVersion, "status" | "created_by" | "updated_by">, myId: string): boolean {
  return v.status === "draft" && v.created_by !== myId && v.updated_by !== myId;
}

export const suggestedReview = (approvedOn: string) => (isDate(approvedOn) ? addYears(approvedOn, REVIEW_YEARS) : "");

/** Where a new PDF for this policy is saved: a new file each time, never replaced. */
export function policyFilePath(policyId: string, fileId: string = crypto.randomUUID()): string {
  return `policies/${policyId}/${fileId}.pdf`;
}

// ---------------------------------------------------------------------------
// Forms

export type PolicyValues = { title: string; owner_person_id: string };

export function parsePolicyForm(get: Get): Result<PolicyValues> {
  const title = get("title").trim().replace(/\s+/g, " ");
  if (!title) return { ok: false, error: "Please enter the policy's title." };
  if (title.length > 150) return { ok: false, error: "The title is too long (150 characters at most)." };
  const owner_person_id = get("owner_person_id").trim();
  if (!UUID.test(owner_person_id)) return { ok: false, error: "Please pick the policy's owner." };
  return { ok: true, values: { title, owner_person_id } };
}

/** The person roles ticked on the form; anything that is not a known role is ignored. */
export function pickedRoles(values: string[], known: Set<string>): string[] {
  return [...new Set(values.filter((v) => known.has(v)))];
}

export type VersionValues = { version_label: string; approved_on: string; next_review_on: string };

export function parseVersionForm(get: Get, today: string): Result<VersionValues> {
  const version_label = get("version_label").trim().replace(/\s+/g, " ");
  if (!version_label) return { ok: false, error: 'Please enter a version name, for example "v2".' };
  if (version_label.length > 20) return { ok: false, error: "The version name is too long (20 characters at most)." };
  const approved_on = get("approved_on").trim();
  if (!approved_on) return { ok: false, error: "Please enter the date this version was approved." };
  if (!isDate(approved_on)) return { ok: false, error: "The approval date is not a real date." };
  if (approved_on > today) return { ok: false, error: "The approval date cannot be in the future." };
  const next_review_on = get("next_review_on").trim();
  if (!next_review_on) return { ok: false, error: "Please enter the next review date." };
  if (!isDate(next_review_on)) return { ok: false, error: "The next review date is not a real date." };
  if (next_review_on <= approved_on) return { ok: false, error: "The next review date must be after the approval date." };
  if (next_review_on > addYears(approved_on, MAX_REVIEW_YEARS)) {
    return { ok: false, error: `The next review date cannot be more than ${MAX_REVIEW_YEARS} years after the approval date.` };
  }
  return { ok: true, values: { version_label, approved_on, next_review_on } };
}

/** The PDF sent with a form: null if none, a sentence if it is not acceptable. */
export async function pdfFrom(form: FormData, field: "pdf" | "pdf_ar" = "pdf"): Promise<File | null | string> {
  const f = form.get(field);
  const which = field === "pdf_ar" ? "The Arabic PDF" : "The PDF";
  if (!(f instanceof File) || f.size === 0) return null;
  if (f.size > MAX_PDF_BYTES) return `${which} is too large (over 10 MB).`;
  const start = new Uint8Array(await f.slice(0, 5).arrayBuffer());
  if (f.type !== "application/pdf" || new TextDecoder().decode(start) !== "%PDF-") return field === "pdf_ar" ? "The Arabic file must be a PDF." : "The file must be a PDF.";
  return f;
}

export function friendlyPolicyError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/policy_versions_one_draft/i.test(message)) return "This policy already has a draft. Change that draft instead.";
  if (/policy_versions_unique_label/i.test(message)) return "This policy already has a version with that name.";
  if (/policies_unique_title/i.test(message)) return "There is already a policy with that title.";
  if (/duplicate key|unique/i.test(message)) return "That is already there.";
  // The database's own messages are already written in plain words.
  if (/owner|switched off|future|review date|approval date|years|different admin|published|draft|PDF|policy|signed-in/i.test(message)) return message;
  return "That could not be saved. Please check the details and try again.";
}
