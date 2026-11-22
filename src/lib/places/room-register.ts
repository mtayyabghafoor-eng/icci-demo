// Registering a whole room from a phone (slice P1.13, PLAN.md 5.1).
//
// While "registering here" is on in a browser, a label scanned with the
// phone's own camera app (/l/ICCI-000123) that is not yet on anything comes
// back to the room screen with its number filled in. The browser remembers
// only the place's record number, in a cookie, for 12 hours. The place and
// the kind of item are filled in from the last item registered there, so
// each new item needs only its name.
import type { PlaceKind } from "./rules";
import { UUID } from "@/lib/forms";

export const ROOM_COOKIE = "icci_room_register";
export const ROOM_COOKIE_HOURS = 12;

/** The cookie's value as a place record number, or null. */
export function parseRoomCookie(raw: string | null | undefined): string | null {
  return raw && UUID.test(raw) ? raw : null;
}

/** Stock (consumables) is kept only in store rooms and on shelves. */
export function stockAllowedIn(kind: PlaceKind): boolean {
  return kind === "store_room" || kind === "shelf";
}

export type LastItem = {
  kind: "fixed_asset" | "consumable";
  category_id: string;
  unit: string | null;
  minimum_level: number | null;
};

export type RoomDefaults = {
  kind: "fixed_asset" | "consumable";
  category_id: string;
  unit: string;
  minimum_level: string;
  /** True when copied from the last item here; false when the admin must choose. */
  copied: boolean;
};

/**
 * What the next item starts with: the last item's kind and category (and,
 * for stock, its unit and minimum), or a fixed asset with no category when
 * nothing is registered here yet. Stock is never suggested outside a store
 * room or shelf.
 */
export function roomDefaults(last: LastItem | null, placeKind: PlaceKind): RoomDefaults {
  if (!last || (last.kind === "consumable" && !stockAllowedIn(placeKind))) {
    return { kind: "fixed_asset", category_id: last?.category_id ?? "", unit: "", minimum_level: "", copied: false };
  }
  return {
    kind: last.kind,
    category_id: last.category_id,
    unit: last.kind === "consumable" ? (last.unit ?? "") : "",
    minimum_level: last.kind === "consumable" && last.minimum_level !== null ? String(last.minimum_level) : "",
    copied: true,
  };
}

/** From when "registered here by you" counts: the same 12 hours the browser remembers the room. */
export function roomListSince(now: number = Date.now()): string {
  return new Date(now - ROOM_COOKIE_HOURS * 3600_000).toISOString();
}
