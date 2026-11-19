// Checking and saving photos, shared by the item forms and the asset forms.
// Runs on the web server only. Photos are never replaced or deleted: a new
// photo is a new file.
import type { createClient } from "@/lib/supabase/server";
import { PHOTO_BUCKET } from "./data";

const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
const PHOTO_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The photo sent with a form: null if none, a sentence if it is not acceptable. */
export function photoFrom(form: FormData): File | null | string {
  const p = form.get("photo");
  if (!(p instanceof File) || p.size === 0) return null;
  if (!PHOTO_TYPES[p.type]) return "The photo must be a JPEG, PNG or WebP picture.";
  if (p.size > MAX_PHOTO_BYTES) return "The photo is too large (over 6 MB).";
  return p;
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
