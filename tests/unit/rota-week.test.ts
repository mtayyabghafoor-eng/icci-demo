// Slice P3.2: the plain rules behind the rota week screens. The database
// enforces the same rules and works out the warnings itself (migration
// 0029); these check the screens' side: which week to show, the Add a slot
// form, Garda vetting on a given day, and the warnings in plain words.
import { describe, expect, it } from "vitest";
import {
  friendlyWeekError,
  parseAddSlotForm,
  readWeek,
  shiftWeek,
  slotOptionLabel,
  timeText,
  vettingOnDay,
  warningText,
  warningTone,
  weekDays,
  weekEnded,
  weekStartOf,
  weekTitle,
  type VettingRecord,
} from "@/lib/rota/week";
import type { SlotGroup } from "@/lib/rota/rules";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const MONDAY = "2026-11-16";
const SHIFT = "11111111-2222-4333-8444-555555555555";
const ONCALL = "22222222-2222-4333-8444-555555555555";
const PRAYER = "33333333-2222-4333-8444-555555555555";
const JUMUAH = "44444444-2222-4333-8444-555555555555";
const groups = new Map<string, SlotGroup>([
  [SHIFT, "shift"],
  [ONCALL, "on_call"],
  [PRAYER, "prayer"],
  [JUMUAH, "jumuah"],
]);

describe("which week", () => {
  it("finds the Monday of any day", () => {
    expect(weekStartOf("2026-11-18")).toBe(MONDAY);
    expect(weekStartOf("2026-11-16")).toBe(MONDAY);
    expect(weekStartOf("2026-11-22")).toBe(MONDAY); // Sunday
    expect(weekStartOf("2027-01-01")).toBe("2026-12-28");
  });
  it("reads the week from the address, or shows this week", () => {
    expect(readWeek("2026-11-23", "2026-11-18")).toBe("2026-11-23");
    expect(readWeek("2026-11-25", "2026-11-18")).toBe("2026-11-23");
    expect(readWeek("not a date", "2026-11-18")).toBe(MONDAY);
    expect(readWeek(undefined, "2026-11-18")).toBe(MONDAY);
    expect(readWeek("1999-06-01", "2026-11-18")).toBe(MONDAY);
  });
  it("moves a week at a time and lists its seven days", () => {
    expect(shiftWeek(MONDAY, 1)).toBe("2026-11-23");
    expect(shiftWeek(MONDAY, -1)).toBe("2026-11-09");
    expect(weekDays(MONDAY)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
  });
  it("names the week and knows when it has ended (after its Sunday)", () => {
    expect(weekTitle(MONDAY)).toBe("Week of Monday 16 November 2026");
    expect(weekEnded(MONDAY, "2026-11-22")).toBe(false);
    expect(weekEnded(MONDAY, "2026-11-23")).toBe(true);
  });
});

describe("times shown on a slot", () => {
  it("prayers show their time from Prayer times, or say it is missing", () => {
    expect(timeText("prayer", "12:20:00", null)).toBe("12:20");
    expect(timeText("jumuah", null, null)).toBe("No time entered");
  });
  it("shifts show from and to; on call without times is all day", () => {
    expect(timeText("shift", "09:00:00", "13:00:00")).toBe("09:00–13:00");
    expect(timeText("on_call", null, null)).toBe("All day");
  });
});

describe("Garda vetting on the day of the slot", () => {
  const vetted: VettingRecord = { kind: "vetted", happened_on: "2024-01-10", expires_on: "2027-01-10" };
  const old: VettingRecord = { kind: "vetted", happened_on: "2020-01-10", expires_on: "2023-01-10" };
  it("is valid when a vetting covers that day", () => {
    expect(vettingOnDay([vetted], "2026-11-20", true, false)).toBe("valid");
    expect(vettingOnDay([vetted], "2027-01-11", true, false)).toBe("expired");
  });
  it("is not needed when neither the slot nor the role needs it", () => {
    expect(vettingOnDay([], "2026-11-20", false, false)).toBe("not_needed");
  });
  it("a role-only need is waived by 'not required' on record, a slot's need is not", () => {
    const waived: VettingRecord = { kind: "not_required", happened_on: "2025-01-01", expires_on: null };
    expect(vettingOnDay([waived], "2026-11-20", false, true)).toBe("not_needed");
    expect(vettingOnDay([waived], "2026-11-20", true, true)).toBe("none");
  });
  it("says applied, expired or none", () => {
    expect(vettingOnDay([old, { kind: "applied", happened_on: "2026-10-01", expires_on: null }], "2026-11-20", true, true)).toBe("applied");
    expect(vettingOnDay([old], "2026-11-20", false, true)).toBe("expired");
    expect(vettingOnDay([], "2026-11-20", false, true)).toBe("none");
  });
  it("ignores records from after the day", () => {
    expect(vettingOnDay([{ kind: "vetted", happened_on: "2026-12-01", expires_on: "2029-12-01" }], "2026-11-20", true, false)).toBe("none");
  });
});

describe("warnings in plain words", () => {
  it("double-booking names the other slot", () => {
    expect(warningText({ kind: "double_booked", vetting: null }, "Dhuhr at 12:20")).toBe("Also on Dhuhr at 12:20 that day");
  });
  it("vetting says what is on record", () => {
    expect(warningText({ kind: "vetting", vetting: "none" })).toMatch(/none on record/);
    expect(warningText({ kind: "vetting", vetting: "expired" })).toMatch(/expired/);
    expect(warningText({ kind: "vetting", vetting: "applied" })).toMatch(/applied for/);
  });
  it("a missing prayer time is pointed out", () => {
    expect(warningText({ kind: "no_prayer_time", vetting: null })).toBe("No prayer time entered for this day");
  });
  it("vetting is red, the others amber", () => {
    expect(warningTone("vetting")).toBe("red");
    expect(warningTone("double_booked")).toBe("amber");
    expect(warningTone("no_prayer_time")).toBe("amber");
  });
});

describe("the Add a slot form", () => {
  it("adds a shift with times, a place and a note", () => {
    const r = parseAddSlotForm(
      form({ assignment_date: "2026-11-18", slot_type_id: SHIFT, start_time: "09:00", end_time: "13:00", location_id: PRAYER, note: "  Main   door " }),
      MONDAY,
      groups,
    );
    expect(r).toEqual({
      ok: true,
      values: { assignment_date: "2026-11-18", slot_type_id: SHIFT, location_id: PRAYER, start_time: "09:00", end_time: "13:00", note: "Main door" },
    });
  });
  it("a shift needs both times, the end after the start", () => {
    expect(parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: SHIFT, start_time: "09:00" }), MONDAY, groups)).toMatchObject({
      ok: false,
      error: /needs a start time and an end time/,
    });
    expect(
      parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: SHIFT, start_time: "22:00", end_time: "06:00" }), MONDAY, groups),
    ).toMatchObject({ ok: false, error: /night shift across midnight is two slots/ });
  });
  it("on call can be all day, or both times", () => {
    expect(parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: ONCALL }), MONDAY, groups)).toMatchObject({ ok: true });
    expect(parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: ONCALL, end_time: "17:00" }), MONDAY, groups)).toMatchObject({
      ok: false,
      error: /both a start and an end time, or neither/,
    });
  });
  it("an extra prayer slot ignores typed times (they come from Prayer times)", () => {
    expect(parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: PRAYER, start_time: "09:00", end_time: "10:00" }), MONDAY, groups)).toMatchObject({
      ok: true,
      values: { start_time: null, end_time: null },
    });
  });
  it("refuses a day outside the week, an unknown slot, and Jumu'ah on a weekday", () => {
    expect(parseAddSlotForm(form({ assignment_date: "2026-11-23", slot_type_id: SHIFT }), MONDAY, groups)).toMatchObject({ ok: false, error: /day in this week/ });
    expect(parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: "nope" }), MONDAY, groups)).toMatchObject({ ok: false, error: /pick the slot/ });
    expect(parseAddSlotForm(form({ assignment_date: MONDAY, slot_type_id: JUMUAH }), MONDAY, groups)).toMatchObject({ ok: false, error: /only on a Friday/ });
    expect(parseAddSlotForm(form({ assignment_date: "2026-11-20", slot_type_id: JUMUAH }), MONDAY, groups)).toMatchObject({ ok: true });
  });
  it("labels the slot drop-down", () => {
    expect(slotOptionLabel("Security", "shift", null)).toBe("Security (Shifts)");
    expect(slotOptionLabel("Fajr", "prayer", "fajr")).toBe("Fajr (Fajr time)");
  });
});

describe("database messages in plain words", () => {
  it("passes the database's own sentences through", () => {
    expect(friendlyWeekError("That week has ended. Its rota can no longer be changed.")).toMatch(/has ended/);
    expect(friendlyWeekError("This person is switched off. Switch them back on to put them on the rota.")).toMatch(/switched off/);
  });
  it("translates the technical ones", () => {
    expect(friendlyWeekError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyWeekError('duplicate key value violates unique constraint "rota_weeks_week_start_key"')).toMatch(/already has a rota/);
    expect(friendlyWeekError("weird")).toMatch(/could not be saved/);
  });
});
