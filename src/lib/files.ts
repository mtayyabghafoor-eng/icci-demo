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
  if (!rules.types[f.type]) return `The ${rules.what} must be ${rules.typesText}.`;
  if (f.size > rules.maxMb * 1024 * 1024) return `The ${rules.what} is too large (over ${rules.maxMb} MB).`;
  // Round C3: what the file really is, from its first bytes.
  const real = sniffType(new Uint8Array(await f.slice(0, 12).arrayBuffer()));
  if (f.type === "application/pdf" && real !== "application/pdf") return `The ${rules.what} does not look like a real PDF.`;
  if (!real || !rules.types[real]) return `The ${rules.what} must be ${rules.typesText}.`;
  return { file: real === f.type ? f : new File([f], f.name, { type: real }), ext: rules.types[real] };
}

/** What a file really is, from its first bytes: a PDF, a JPEG, PNG or WebP picture, or nothing we accept. */
export function sniffType(head: Uint8Array): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  const at = (i: number, ...bytes: number[]) => bytes.every((b, k) => head[i + k] === b);
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return "application/pdf"; // %PDF-
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp"; // RIFF....WEBP
  return null;
}

/**
 * Every file in one form field (P5.2 receipts: photos or PDFs, several at
 * once). Each is checked by its content, not only its name or the type the
 * browser claims (Round C3's rule). An empty list if none was chosen, a
 * plain sentence if one is not acceptable.
 */
export async function filesFrom(
  form: FormData,
  field: string,
  rules: { maxFiles: number; maxMb: number; what: string },
): Promise<{ file: File; type: string; ext: string }[] | string> {
  const files = form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > rules.maxFiles) return `Add at most ${rules.maxFiles} files for one ${rules.what}.`;
  const out: { file: File; type: string; ext: string }[] = [];
  for (const [i, f] of files.entries()) {
    const n = files.length > 1 ? ` (file ${i + 1})` : "";
    if (f.size > rules.maxMb * 1024 * 1024) return `The ${rules.what}${n} is too large (over ${rules.maxMb} MB).`;
    const type = sniffType(new Uint8Array(await f.slice(0, 12).arrayBuffer()));
    if (!type) return `The ${rules.what}${n} must be a PDF or a JPEG, PNG or WebP picture.`;
    out.push({ file: f, type, ext: PDF_OR_PICTURE_TYPES[type] });
  }
  return out;
}
