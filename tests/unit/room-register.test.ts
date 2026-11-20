import { describe, expect, it } from "vitest";
import { parseRoomCookie, roomDefaults, stockAllowedIn } from "@/lib/places/room-register";

const CAT = "11111111-2222-3333-4444-555555555555";

describe("parseRoomCookie", () => {
  it("accepts only a place record number", () => {
    expect(parseRoomCookie(CAT)).toBe(CAT);
    for (const bad of ["", undefined, null, "12", "PL-0001", `${CAT}x`, "javascript:alert(1)"]) {
      expect(parseRoomCookie(bad)).toBeNull();
    }
  });
});

describe("stockAllowedIn", () => {
  it("allows stock only in store rooms and on shelves", () => {
    expect(stockAllowedIn("store_room")).toBe(true);
    expect(stockAllowedIn("shelf")).toBe(true);
    expect(stockAllowedIn("room")).toBe(false);
    expect(stockAllowedIn("building")).toBe(false);
  });
});

describe("roomDefaults", () => {
  it("copies the last fixed asset's kind and category", () => {
    expect(roomDefaults({ kind: "fixed_asset", category_id: CAT, unit: null, minimum_level: null }, "room")).toEqual({
      kind: "fixed_asset",
      category_id: CAT,
      unit: "",
      minimum_level: "",
      copied: true,
    });
  });

  it("copies the last stock item's unit and minimum on a shelf", () => {
    expect(roomDefaults({ kind: "consumable", category_id: CAT, unit: "box", minimum_level: 3 }, "shelf")).toMatchObject({
      kind: "consumable",
      unit: "box",
      minimum_level: "3",
      copied: true,
    });
  });

  it("starts with nothing copied when the place is empty", () => {
    expect(roomDefaults(null, "room")).toEqual({ kind: "fixed_asset", category_id: "", unit: "", minimum_level: "", copied: false });
  });

  it("never suggests stock in a room", () => {
    expect(roomDefaults({ kind: "consumable", category_id: CAT, unit: "box", minimum_level: 3 }, "room")).toMatchObject({
      kind: "fixed_asset",
      copied: false,
    });
  });
});
