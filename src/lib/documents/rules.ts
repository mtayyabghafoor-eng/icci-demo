// Plain rules for manuals and documents (slice P1.20): the kinds, the add
// and hide forms, where a file is saved, and plain refusals. The database
// enforces the same rules (migration 0045).
type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export const DOCUMENT_KINDS = {
  manual: "Manual",
  warranty: "Warranty",
  invoice: "Invoice or proof of purchase",
  service_report: "Service report",
  certificate: "Certificate",
  plate_photo: "Photo of the maker's plate",
  other: "Other",
} as const;
export type DocumentKind = keyof typeof DOCUMENT_KINDS;

export const DOCUMENT_BUCKET = "asset-documents";
export const DOCUMENT_MAX_MB = 10;

export type DocumentRow = {
  id: number;
  model_id: string | null;
  item_id: string | null;
  kind: DocumentKind;
  title: string;
  file_path: string;
  hidden: boolean;
  hidden_reason: string | null;
  created_at: string;
};
export const DOCUMENT_COLUMNS = "id, model_id, item_id, kind, title, file_path, hidden, hidden_reason, created_at";

export function parseDocumentForm(get: Get): Result<{ kind: DocumentKind; title: string }> {
  const kind = get("kind");
  if (!(kind in DOCUMENT_KINDS)) return { ok: false, error: "Choose what kind of document it is." };
  const title = get("title").trim().replace(/\s+/g, " ") || DOCUMENT_KINDS[kind as DocumentKind];
  if (title.length > 120) return { ok: false, error: "Keep the title to 120 characters or fewer." };
  return { ok: true, values: { kind: kind as DocumentKind, title } };
}

export function parseHideReason(get: Get): Result<string> {
  const reason = get("reason").trim();
  if (!reason) return { ok: false, error: "Say why it is being hidden, for example “wrong model”." };
  if (reason.length > 500) return { ok: false, error: "Keep the reason to 500 characters or fewer." };
  return { ok: true, values: reason };
}

/** A new file each time, in the model's or the item's folder; never replaced. */
export function documentPath(owner: { model_id: string } | { item_id: string }, ext: string, fileId: string = crypto.randomUUID()): string {
  return "model_id" in owner ? `models/${owner.model_id}/${fileId}.${ext}` : `items/${owner.item_id}/${fileId}.${ext}`;
}

export function friendlyDocumentError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied/i.test(message)) return "Your account is not allowed to do this.";
  if (/document|file|hide|hidden/i.test(message)) return message;
  return "That could not be saved. Please try again.";
}
