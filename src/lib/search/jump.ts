// D8: a typed label number (123, ICCI-000123) or place code (PL-0007)
// opens that label straight away, from the search box as from a scan.
import { labelPath, parseLabelNumber } from "@/lib/items/rules";
import { parsePlaceCode, placeCode, placePath } from "@/lib/places/rules";

export function jumpFor(raw: string): { href: string; text: string } | null {
  const serial = parseLabelNumber(raw);
  if (serial) return { href: labelPath(serial), text: `Open label ${serial}` };
  const place = parsePlaceCode(raw);
  if (place) return { href: placePath(place), text: `Open place ${placeCode(place)}` };
  return null;
}
