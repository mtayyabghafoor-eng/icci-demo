// Checking and saving photos, shared by the item forms and the asset forms.
// Runs on the web server only. Photos are never replaced or deleted: a new
// photo is a new file.
import { sniffType } from "@/lib/files";
import type { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "./data";

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The photo sent with a form: null if none, a sentence if it is not acceptable. */
// Round C3: checked by what the file really is (its first bytes), not by
// its name or the type the browser claims. The file is passed on with the
// real type, so it is saved with the right ending.
export async function photoFrom(form: FormData): Promise<File | null | string> {
  const p = form.get("photo");
  if (!(p instanceof File) || p.size === 0) return null;
  if (p.size > MAX_PHOTO_BYTES) return "The photo is too large (over 6 MB).";
  const real = sniffType(new Uint8Array(await p.slice(0, 12).arrayBuffer()));
  if (!real || !PHOTO_TYPES[real]) return "The photo must be a JPEG, PNG or WebP picture.";
  return real === p.type ? p : new File([p], p.name, { type: real });
}

/** Saves a photo as a new file under the item's label. Returns its path, or null if it failed. */
export async function savePhoto(
  supabase: Awaited<ReturnType<typeof createClient>>,
  label: string,
  photo: File,
  folder = "",
) {
  const path = `items/${label}/${folder ? `${folder}/` : ""}${crypto.randomUUID()}.${PHOTO_TYPES[photo.type]}`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(path, photo, { contentType: photo.type });
  return error ? null : path;
}
