// Checking a file sent with a form (photos, scans, PDFs, documents), shared
// so each upload screen does not repeat the same checks. Runs on the web
// server. A PDF must really start like a PDF, not just be named like one.

export const PICTURE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const PDF_OR_PICTURE_TYPES: Record<string, string> = { "application/pdf": "pdf", ...PICTURE_TYPES };

/**
 * The file in one form field: null if none was chosen, a plain sentence if it
 * is not acceptable, else the file and the ending to save it with.
 */
export async function fileFrom(
  form: FormData,
  field: string,
  rules: { types: Record<string, string>; maxMb: number; what: string; typesText: string },
): Promise<{ file: File; ext: string } | null | string> {
  const f = form.get(field);
  if (!(f instanceof File) || f.size === 0) return null;
  const ext = rules.types[f.type];
  if (!ext) return `The ${rules.what} must be ${rules.typesText}.`;
  if (f.size > rules.maxMb * 1024 * 1024) return `The ${rules.what} is too large (over ${rules.maxMb} MB).`;
  if (ext === "pdf") {
    const start = new TextDecoder().decode(new Uint8Array(await f.slice(0, 5).arrayBuffer()));
    if (start !== "%PDF-") return `The ${rules.what} does not look like a real PDF.`;
  }
  return { file: f, ext };
}
