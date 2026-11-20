// Slice P3.1: the plain rules behind the Prayer times and Slot types screens.
// The database enforces the same rules itself (migration 0028); these check
// the screens' side: times typed as hours and minutes, the order of the
// five prayers (Isha may fall after midnight in summer), Jumu'ah on Fridays
// only, the month grid, the slot type forms and the plain-word errors.
import { describe, expect, it } from "vitest";
import {
  sampleNote,
  checkDayTimes,
  friendlyRotaError,
  fullDayLabel,
  isFriday,
  isTime,
  MAY_SEE_ROTA,
  monthDays,
  monthTitle,
  parsePrayerMonth,
  parseSlotTypeForm,
  readMonth,
  SLOT_GROUP_LABEL,
  shiftMonth,
  showSampleNote,
  timeTakenText,
  type DayTimes,
} from "@/lib/rota/rules";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const WINTER: DayTimes = { fajr: "06:45", dhuhr: "12:20", asr: "13:55", maghrib: "16:20", isha: "18:05", jumuah_1: null, jumuah_2: null };
// 4 Dec 2026 is a Friday; 3 Dec 2026 a Thursday.
const FRIDAY = "2026-12-04";
const THURSDAY = "2026-12-03";

describe("times are typed as hours and minutes", () => {
  it.each(["00:00", "06:45", "12:05", "23:59"])("%s is a time", (t) => expect(isTime(t)).toBe(true));
  it.each(["", "6:45", "24:00", "12:60", "12:05:30", "noon", "12.05"])("%j is not", (t) => expect(isTime(t)).toBe(false));
});

describe("the times of one day", () => {
  it("accepts five prayers in order, with no Jumu'ah on a weekday", () => {
    expect(checkDayTimes(THURSDAY, WINTER)).toBeNull();
  });

  it("refuses prayers out of order and says which two", () => {
    expect(checkDayTimes(THURSDAY, { ...WINTER, asr: "12:10" })).toMatch(/Asr must be after Dhuhr/);
    expect(checkDayTimes(THURSDAY, { ...WINTER, fajr: "12:30" })).toMatch(/Dhuhr must be after Fajr/);
    expect(checkDayTimes(THURSDAY, { ...WINTER, maghrib: "13:00" })).toMatch(/Maghrib must be after Asr/);
    expect(checkDayTimes(THURSDAY, { ...WINTER, isha: "16:20" })).toMatch(/Isha must be after Maghrib/);
  });

  it("allows Isha after midnight (summer nights), but not later than Fajr", () => {
    const summer = { fajr: "02:50", dhuhr: "13:25", asr: "17:40", maghrib: "22:00", isha: "00:15", jumuah_1: null, jumuah_2: null };
    expect(checkDayTimes("2026-06-18", summer)).toBeNull();
    expect(checkDayTimes("2026-06-18", { ...summer, isha: "03:00" })).toMatch(/Isha must be after Maghrib/);
  });

  it("needs all five prayers, each a real time", () => {
    expect(checkDayTimes(THURSDAY, { ...WINTER, asr: "" })).toMatch(/all five prayer times/);
    expect(checkDayTimes(THURSDAY, { ...WINTER, isha: "25:00" })).toMatch(/Isha is not a time/);
  });

  it("takes Jumu'ah times on a Friday only", () => {
    expect(checkDayTimes(FRIDAY, { ...WINTER, jumuah_1: "13:00", jumuah_2: "14:00" })).toBeNull();
    expect(checkDayTimes(FRIDAY, { ...WINTER, jumuah_1: "13:00" })).toBeNull();
    expect(checkDayTimes(FRIDAY, WINTER)).toBeNull();
    expect(checkDayTimes(THURSDAY, { ...WINTER, jumuah_1: "13:00" })).toMatch(/only on a Friday/);
  });

  it("needs the first Jumu'ah before the second", () => {
    expect(checkDayTimes(FRIDAY, { ...WINTER, jumuah_2: "14:00" })).toMatch(/second Jumu'ah needs a first/);
    expect(checkDayTimes(FRIDAY, { ...WINTER, jumuah_1: "14:00", jumuah_2: "13:30" })).toMatch(/Jumu'ah 2 must be after Jumu'ah 1/);
    expect(checkDayTimes(FRIDAY, { ...WINTER, jumuah_1: "1pm" })).toMatch(/Jumu'ah 1 is not a time/);
  });
});

describe("the month grid", () => {
  it("lists every day of the month, leap years included", () => {
    expect(monthDays("2026-11")).toHaveLength(30);
    expect(monthDays("2026-11")[0]).toBe("2026-11-01");
    expect(monthDays("2026-11").at(-1)).toBe("2026-11-30");
    expect(monthDays("2028-02")).toHaveLength(29);
    expect(monthDays("2027-02")).toHaveLength(28);
  });

  it("knows Fridays", () => {
    expect(isFriday(FRIDAY)).toBe(true);
    expect(isFriday(THURSDAY)).toBe(false);
  });

  it("reads the month from the address, or falls back to this month", () => {
    expect(readMonth("2026-12", "2026-11-18")).toBe("2026-12");
    expect(readMonth(undefined, "2026-11-18")).toBe("2026-11");
    expect(readMonth("2026-13", "2026-11-18")).toBe("2026-11");
    expect(readMonth("1999-12", "2026-11-18")).toBe("2026-11");
    expect(readMonth("2101-01", "2026-11-18")).toBe("2026-11");
    expect(readMonth(["2026-12"], "2026-11-18")).toBe("2026-11");
  });

  it("moves a month at a time across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });

  it("names months and days in plain words", () => {
    expect(monthTitle("2026-11")).toBe("November 2026");
    expect(fullDayLabel(FRIDAY)).toBe("Friday 4 December");
  });
});

describe("the month form", () => {
  const month = "2026-12";
  const day = (date: string, t: Partial<DayTimes>) =>
    Object.fromEntries(Object.entries(t).map(([k, v]) => [`${date}:${k}`, v ?? ""]));

  it("sends only the days that were typed in", () => {
    const r = parsePrayerMonth(month, form({ ...day(THURSDAY, WINTER), ...day(FRIDAY, { ...WINTER, jumuah_1: "13:00" }) }), new Map());
    expect(r).toEqual({
      ok: true,
      values: [
        { prayer_date: THURSDAY, ...WINTER },
        { prayer_date: FRIDAY, ...WINTER, jumuah_1: "13:00" },
      ],
    });
  });

  it("names the day when one is wrong", () => {
    const r = parsePrayerMonth(month, form(day(THURSDAY, { ...WINTER, asr: "11:00" })), new Map());
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/^Thursday 3 December: Asr must be after Dhuhr/) });
  });

  it("refuses a half-typed day", () => {
    const r = parsePrayerMonth(month, form(day(THURSDAY, { fajr: "06:45" })), new Map());
    expect(r).toEqual({ ok: false, error: "Thursday 3 December: please fill in all five prayer times." });
  });

  it("does not let a day already entered be emptied (it can be corrected, not removed)", () => {
    const r = parsePrayerMonth(month, form({}), new Map([[THURSDAY, WINTER]]));
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Thursday 3 December.*corrected, but not removed/) });
  });

  it("says when there is nothing to save", () => {
    expect(parsePrayerMonth(month, form({}), new Map())).toEqual({ ok: false, error: expect.stringMatching(/Nothing to save/) });
  });
});

describe("the slot type forms", () => {
  it("adds a shift with no time of its own", () => {
    expect(parseSlotTypeForm(form({ name: "  Car   park ", slot_group: "shift" }), "add")).toEqual({
      ok: true,
      values: { name: "Car park", slot_group: "shift", prayer_time: null, needs_vetting: false },
    });
  });

  it("adds a prayer slot that takes one of the five times", () => {
    expect(parseSlotTypeForm(form({ name: "Fajr adhan", slot_group: "prayer", prayer_time: "fajr", needs_vetting: "on" }), "add")).toEqual({
      ok: true,
      values: { name: "Fajr adhan", slot_group: "prayer", prayer_time: "fajr", needs_vetting: true },
    });
  });

  it("refuses a prayer slot with no time, or with a Jumu'ah time", () => {
    expect(parseSlotTypeForm(form({ name: "X", slot_group: "prayer" }), "add")).toMatchObject({ ok: false, error: /which prayer time/ });
    expect(parseSlotTypeForm(form({ name: "X", slot_group: "prayer", prayer_time: "jumuah_1" }), "add")).toMatchObject({ ok: false });
    expect(parseSlotTypeForm(form({ name: "X", slot_group: "jumuah", prayer_time: "jumuah_2" }), "add")).toMatchObject({ ok: true });
  });

  it("refuses an empty or long name, or an unknown group", () => {
    expect(parseSlotTypeForm(form({ name: " ", slot_group: "shift" }), "add")).toMatchObject({ ok: false, error: /name/ });
    expect(parseSlotTypeForm(form({ name: "x".repeat(61), slot_group: "shift" }), "add")).toMatchObject({ ok: false, error: /too long/ });
    expect(parseSlotTypeForm(form({ name: "X", slot_group: "party" }), "add")).toMatchObject({ ok: false, error: /group/ });
  });

  it("editing changes only the name and the vetting tick", () => {
    expect(parseSlotTypeForm(form({ name: "Front door", slot_group: "prayer", prayer_time: "fajr" }), "edit")).toEqual({
      ok: true,
      values: { name: "Front door", needs_vetting: false },
    });
  });
});

describe("words on the screens", () => {
  it("names the four groups", () => {
    expect(SLOT_GROUP_LABEL).toEqual({ prayer: "Prayers", jumuah: "Jumu'ah", shift: "Shifts", on_call: "On call" });
  });
  it("says which time a slot takes", () => {
    expect(timeTakenText("maghrib")).toBe("Time from Prayer times: Maghrib");
    expect(timeTakenText("jumuah_2")).toBe("Time from Prayer times: Jumu'ah 2");
    expect(timeTakenText(null)).toBe("Times set on the rota");
  });
  it("shows the made-up times note everywhere except the real site", () => {
    expect(showSampleNote("development")).toBe(true);
    expect(showSampleNote(undefined)).toBe(true);
    expect(showSampleNote("production")).toBe(false);
  });
  it("UI-9: the note reads as a demonstration timetable on the online demo", () => {
    expect(sampleNote("staging")).toEqual({ title: "Sample timetable", text: "Sample Dublin prayer timetable for demonstration." });
    expect(sampleNote("development").text).toMatch(/^This is the development copy\. The times here are sample times/);
  });
  it("only Super Admin and Centre Admin may see these screens", () => {
    expect(MAY_SEE_ROTA).toEqual(["super_admin", "centre_admin"]);
  });
  it("turns database messages into plain words", () => {
    expect(friendlyRotaError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyRotaError('duplicate key value violates unique constraint "rota_slot_types_unique_name"')).toMatch(/already a slot type/);
    expect(friendlyRotaError("Friday 4 December: Asr must be after Dhuhr.")).toBe("Friday 4 December: Asr must be after Dhuhr.");
    expect(friendlyRotaError("something odd")).toMatch(/could not be saved/);
  });
});
