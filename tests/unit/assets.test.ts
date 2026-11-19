// Slice 6: the plain asset rules (which buttons show, what the forms accept,
// how events are described). The database enforces the same rules itself:
// see tests/db/assets.test.ts.
import { describe, expect, it } from "vitest";
import {
  ASSET_ACTIONS,
  actionsFor,
  describeEvent,
  friendlyAssetError,
  parseAssetForm,
  type AssetEventRow,
} from "@/lib/assets/rules";
import { describeHistory, type HistoryRow } from "@/lib/items/history";

const LOC_A = "22222222-2222-2222-2222-222222222222";
const LOC_B = "33333333-3333-3333-3333-333333333333";
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";
const good = { note: "Leg came loose", reported_by: "Test volunteer" };

describe("which actions an asset offers", () => {
  it("a good or fair asset can be moved, reported damaged or missing, or disposed of", () => {
    expect(actionsFor("good", false)).toEqual(["move", "damage", "missing", "dispose"]);
    expect(actionsFor("fair", false)).toEqual(["move", "damage", "missing", "dispose"]);
  });

  it("a damaged asset can be repaired; a missing one found (and a missing one is not moved)", () => {
    expect(actionsFor("damaged", false)).toEqual(["move", "repaired", "missing", "dispose"]);
    expect(actionsFor("missing", false)).toEqual(["found", "damage", "dispose"]);
  });

  it("nothing while a disposal waits for approval, and nothing once disposed", () => {
    expect(actionsFor("good", true)).toEqual([]);
    expect(actionsFor("disposed", false)).toEqual([]);
  });

  it("buttons use plain words", () => {
    expect(ASSET_ACTIONS.move.button).toBe("Move");
    expect(ASSET_ACTIONS.damage.button).toBe("Report damage");
    expect(ASSET_ACTIONS.missing.button).toBe("Mark missing");
    expect(ASSET_ACTIONS.dispose.button).toBe("Dispose");
  });
});

describe("the asset forms", () => {
  it("accepts a damage report, trimming the text", () => {
    const r = parseAssetForm(form({ note: "  Leg came loose ", reported_by: " Test volunteer " }), "damage");
    expect(r).toEqual({ ok: true, values: { kind: "damage", note: "Leg came loose", reported_by: "Test volunteer" } });
  });

  it("needs a note and who reported it", () => {
    expect(parseAssetForm(form({ reported_by: "X" }), "missing")).toEqual({ ok: false, error: "Write a note saying what happened." });
    expect(parseAssetForm(form({ note: "X", reported_by: "  " }), "missing")).toEqual({ ok: false, error: "Say who reported it." });
  });

  it("refuses text that is too long", () => {
    expect(parseAssetForm(form({ ...good, note: "x".repeat(2001) }), "damage").ok).toBe(false);
    expect(parseAssetForm(form({ ...good, reported_by: "x".repeat(201) }), "damage").ok).toBe(false);
  });

  it("a move needs a place to go", () => {
    expect(parseAssetForm(form(good), "move")).toEqual({ ok: false, error: "Pick where it is going." });
    expect(parseAssetForm(form({ ...good, to_location_id: "not-an-id" }), "move").ok).toBe(false);
    expect(parseAssetForm(form({ ...good, to_location_id: LOC_A }), "move")).toEqual({
      ok: true,
      values: { kind: "move", ...good, to_location_id: LOC_A },
    });
  });

  it("found and repaired need good or fair", () => {
    expect(parseAssetForm(form(good), "found")).toEqual({ ok: false, error: "Choose Good or Fair." });
    expect(parseAssetForm(form({ ...good, to_condition: "disposed" }), "repaired").ok).toBe(false);
    expect(parseAssetForm(form({ ...good, to_condition: "fair" }), "found")).toEqual({
      ok: true,
      values: { kind: "back_in_use", ...good, to_condition: "fair" },
    });
  });

  it("never sends a place or condition the action does not use", () => {
    const r = parseAssetForm(form({ ...good, to_location_id: LOC_A, to_condition: "good" }), "dispose");
    expect(r).toEqual({ ok: true, values: { kind: "disposal", ...good } });
  });
});

describe("describing an event", () => {
  const names = new Map([
    [LOC_A, "Building A › Room A1"],
    [LOC_B, "Building B › Room B1"],
  ]);
  const ev = (over: Partial<AssetEventRow>): AssetEventRow => ({
    id: 1,
    item_id: "x",
    kind: "damage",
    status: "recorded",
    from_location_id: LOC_A,
    to_location_id: null,
    from_condition: "good",
    to_condition: "damaged",
    note: "n",
    reported_by: "r",
    reported_by_person_id: null,
    photo_path: null,
    decided_by: null,
    decided_at: null,
    decision_note: null,
    created_by: null,
    created_at: "2026-11-14T10:00:00Z",
    ...over,
  });

  it.each([
    [ev({ kind: "move", to_location_id: LOC_B, to_condition: null }), "Moved: Building A › Room A1 → Building B › Room B1"],
    [ev({}), "Reported damaged (was Good)"],
    [ev({ kind: "missing", to_condition: "missing", from_condition: "fair" }), "Marked missing (was Fair)"],
    [ev({ kind: "back_in_use", from_condition: "missing", to_condition: "good" }), "Marked found (now Good)"],
    [ev({ kind: "back_in_use", from_condition: "damaged", to_condition: "fair" }), "Marked repaired (now Fair)"],
    [ev({ kind: "disposal", status: "pending", to_condition: "disposed" }), "Disposal (was Good)"],
  ])("%#: %s", (e, text) => expect(describeEvent(e, names)).toBe(text));
});

describe("database refusals in plain words", () => {
  it("passes the database's own sentences through", () => {
    expect(friendlyAssetError("This asset is already marked damaged.")).toBe("This asset is already marked damaged.");
  });
  it("explains a disposal already waiting", () => {
    expect(friendlyAssetError('duplicate key value violates unique constraint "asset_events_one_pending_per_item"')).toMatch(
      /waiting for approval/,
    );
  });
  it("hides anything technical", () => {
    expect(friendlyAssetError('new row violates row-level security policy for table "asset_events"')).toBe(
      "Your account is not allowed to do this.",
    );
    expect(friendlyAssetError("syntax error at or near select")).toBe("Something went wrong. Please try again.");
  });
});

describe("item history after an asset event", () => {
  const row = (old_values: Record<string, unknown>, new_values: Record<string, unknown>): HistoryRow => ({
    id: 2,
    action: "update",
    changed_at: "2026-11-14T10:00:00Z",
    changed_by_name: "Test Centre Admin",
    old_values,
    new_values,
  });
  const lookups = { categories: new Map(), locations: new Map([[LOC_A, "Room A1"], [LOC_B, "Room B1"]]) };

  it("calls a location change 'Moved' and a condition change 'Condition changed'", () => {
    const [moved, cond] = describeHistory(
      [row({ location_id: LOC_A }, { location_id: LOC_B }), row({ condition: "good" }, { condition: "damaged" })],
      lookups,
    );
    expect(moved).toMatchObject({ title: "Moved", changes: ["Location: Room A1 → Room B1"] });
    expect(cond).toMatchObject({ title: "Condition changed", changes: ["Condition: Good → Damaged"] });
  });
});
