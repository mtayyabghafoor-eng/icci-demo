// What the in-app camera scanner saw (slice UI-7). A printed ICCI label
// holds a web address ending in /l/ICCI-000123; a typed or older code may
// hold just the number. Either way only the label number is kept, and the
// app opens its own label page for it. Any other address in a QR code is
// never followed.
import { parsePlaceCode, placePath } from "@/lib/places/rules";
import { parseLabelNumber, safeDecode } from "./rules";

export function labelFromScan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  const inLink = /\/l\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(text);
  if (inLink) return parseLabelNumber(safeDecode(inLink[1]));
  // Not a link to a label: only a bare label number is accepted.
  if (/[/:]/.test(text)) return null;
  return parseLabelNumber(text);
}

/**
 * For the camera scanner (slice P1.12): the app page for a scanned code, an
 * item label (/l/ICCI-000123) or a place label (/p/PL-0001), or null for any
 * other code. Only the number is kept; no other address is ever followed.
 */
export function codeFromScan(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.trim();
  const place = /\/p\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(text);
  const n = place ? parsePlaceCode(safeDecode(place[1])) : /[/:]/.test(text) ? null : parsePlaceCode(text);
  if (n) return placePath(n);
  const serial = labelFromScan(text);
  return serial ? `/l/${serial}` : null;
}
