// Plain rules for the rota's reference screens (slice P3.1): prayer times
// typed in a month at a time, and the list of rota slot types. The database
// enforces the same rules itself (migration 0028). Owner's choices, 18 Nov
// 2026: Super Admin and Centre Admin only; times are typed in from the
// Centre's timetable, never calculated; any day can be corrected (the audit
// log keeps every change); Security, Volunteers and Funeral on call need
// Garda vetting to start with.
import { isDate } from "@/lib/vetting/rules";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

/** Who may see these screens (the database refuses everyone else anyway). */
export const MAY_SEE_ROTA = ["super_admin", "centre_admin"];

// ---------------------------------------------------------------------------
// Prayer times

export const PRAYERS = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
export const JUMUAH = ["jumuah_1", "jumuah_2"] as const;
export type PrayerKey = (typeof PRAYERS)[number];
export type TimeKey = PrayerKey | (typeof JUMUAH)[number];
export const TIME_KEYS: readonly TimeKey[] = [...PRAYERS, ...JUMUAH];

export const TIME_LABEL: Record<TimeKey, string> = {
  fajr: "Fajr",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
  jumuah_1: "Jumu'ah 1",
  jumuah_2: "Jumu'ah 2",
};

/** One day's times as "HH:MM" (Jumu'ah empty on other days). */
export type DayTimes = Record<PrayerKey, string> & { jumuah_1: string | null; jumuah_2: string | null };
export type PrayerDay = { prayer_date: string } & DayTimes;
export const PRAYER_DAY_COLUMNS = "prayer_date, fajr, dhuhr, asr, maghrib, isha, jumuah_1, jumuah_2";

export function isTime(raw: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(raw);
}

/** The database sends "06:45:00"; the screens use "06:45". */
export function shortTime(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** A row as the database sends it, with times shortened to hours and minutes. */
export function toDayTimes(row: Record<TimeKey, string | null>): DayTimes {
  return {
    fajr: shortTime(row.fajr),
    dhuhr: shortTime(row.dhuhr),
    asr: shortTime(row.asr),
    maghrib: shortTime(row.maghrib),
    isha: shortTime(row.isha),
    jumuah_1: row.jumuah_1 ? shortTime(row.jumuah_1) : null,
    jumuah_2: row.jumuah_2 ? shortTime(row.jumuah_2) : null,
  };
}

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

export function isFriday(iso: string): boolean {
  return utc(iso).getUTCDay() === 5;
}

/** The same checks as the database, as one plain sentence, or null when all is well. */
export function checkDayTimes(date: string, t: DayTimes): string | null {
  if (PRAYERS.some((k) => !t[k])) return "please fill in all five prayer times.";
  for (const k of TIME_KEYS) {
    const v = t[k];
    if (v && !isTime(v)) return `${TIME_LABEL[k]} is not a time. Use hours and minutes, like 13:05.`;
  }
  const [fajr, dhuhr, asr, maghrib, isha] = PRAYERS.map((k) => t[k]);
  if (dhuhr <= fajr) return "Dhuhr must be after Fajr.";
  if (asr <= dhuhr) return "Asr must be after Dhuhr.";
  if (maghrib <= asr) return "Maghrib must be after Asr.";
  if (!(isha > maghrib || isha < fajr)) return "Isha must be after Maghrib (it may be after midnight, but before Fajr).";
  if (t.jumuah_1 || t.jumuah_2) {
    if (!isFriday(date)) return "Jumu'ah times go only on a Friday.";
    if (!t.jumuah_1) return "A second Jumu'ah needs a first one.";
    if (t.jumuah_2 && t.jumuah_2 <= t.jumuah_1) return "Jumu'ah 2 must be after Jumu'ah 1.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// The month grid

/** "2026-11" from the address, or this month when it is missing or not 2000-2100. */
export function readMonth(raw: string | string[] | undefined, today: string): string {
  if (typeof raw === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) && raw >= "2000-01" && raw <= "2100-12") return raw;
  return today.slice(0, 7);
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + by;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function monthDays(month: string): string[] {
  const out: string[] = [];
  for (let day = 1; day <= 31; day++) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    if (!isDate(iso)) break;
    out.push(iso);
  }
  return out;
}

export function monthTitle(month: string): string {
  return utc(`${month}-01`).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** "Friday 4 December" (the same words the database uses in its messages). */
export function fullDayLabel(iso: string): string {
  const d = utc(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-IE", { ...o, timeZone: "UTC" });
  return `${part({ weekday: "long" })} ${d.getUTCDate()} ${part({ month: "long" })}`;
}

/** "Fri 4" for the grid's first column. */
export function shortDayLabel(iso: string): string {
  return utc(iso).toLocaleDateString("en-IE", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

/** The name of one box in the month form: "2026-12-04:fajr". */
export const cellName = (date: string, key: TimeKey) => `${date}:${key}`;

/**
 * Reads the month form: the days that were typed in, each checked. A day
 * left empty is skipped, unless it was entered before (it can be corrected,
 * not removed). The database checks everything again.
 */
export function parsePrayerMonth(month: string, get: Get, existing: Map<string, DayTimes>): Result<PrayerDay[]> {
  const out: PrayerDay[] = [];
  for (const date of monthDays(month)) {
    const friday = isFriday(date);
    const value = (k: TimeKey) => get(cellName(date, k)).trim();
    const t: DayTimes = {
      fajr: value("fajr"),
      dhuhr: value("dhuhr"),
      asr: value("asr"),
      maghrib: value("maghrib"),
      isha: value("isha"),
      jumuah_1: friday ? value("jumuah_1") || null : null,
      jumuah_2: friday ? value("jumuah_2") || null : null,
    };
    const empty = TIME_KEYS.every((k) => !t[k]);
    if (empty) {
      if (existing.has(date)) {
        return { ok: false, error: `${fullDayLabel(date)}: these times were entered before. They can be corrected, but not removed.` };
      }
      continue;
    }
    const problem = checkDayTimes(date, t);
    if (problem) return { ok: false, error: `${fullDayLabel(date)}: ${problem}` };
    out.push({ prayer_date: date, ...t });
  }
  if (out.length === 0) return { ok: false, error: "Nothing to save: type in at least one day's times." };
  return { ok: true, values: out };
}

/** Whether to show "these times are made up" (everywhere except the real site). */
export function showSampleNote(environment: string | undefined): boolean {
  return environment !== "production";
}

/** UI-9: the note's words. The online demo (staging) reads as a demonstration, not a development copy. */
export function sampleNote(environment: string | undefined): { title: string; text: string } {
  if (environment === "staging") return { title: "Sample timetable", text: "Sample Dublin prayer timetable for demonstration." };
  return { title: "Made-up times", text: "This is the development copy. The times here are sample times, not the Centre’s timetable." };
}

// ---------------------------------------------------------------------------
// Slot types

export const SLOT_GROUPS = ["prayer", "jumuah", "shift", "on_call"] as const;
export type SlotGroup = (typeof SLOT_GROUPS)[number];

export const SLOT_GROUP_LABEL: Record<SlotGroup, string> = {
  prayer: "Prayers",
  jumuah: "Jumu'ah",
  shift: "Shifts",
  on_call: "On call",
};

/** Which prayer times each group may take. */
export const TIMES_FOR_GROUP: Record<SlotGroup, readonly TimeKey[]> = {
  prayer: PRAYERS,
  jumuah: JUMUAH,
  shift: [],
  on_call: [],
};

export type SlotType = {
  id: string;
  name: string;
  slot_group: SlotGroup;
  prayer_time: TimeKey | null;
  needs_vetting: boolean;
  display_order: number;
  active: boolean;
};
export const SLOT_TYPE_COLUMNS = "id, name, slot_group, prayer_time, needs_vetting, display_order, active";

export function timeTakenText(prayerTime: TimeKey | null): string {
  return prayerTime ? `Time from Prayer times: ${TIME_LABEL[prayerTime]}` : "Times set on the rota";
}

export type NewSlotType = { name: string; slot_group: SlotGroup; prayer_time: TimeKey | null; needs_vetting: boolean };
export type SlotTypeChange = { name: string; needs_vetting: boolean };

export function parseSlotTypeForm(get: Get, mode: "add"): Result<NewSlotType>;
export function parseSlotTypeForm(get: Get, mode: "edit"): Result<SlotTypeChange>;
export function parseSlotTypeForm(get: Get, mode: "add" | "edit"): Result<NewSlotType | SlotTypeChange> {
  const name = get("name").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Please enter a name." };
  if (name.length > 60) return { ok: false, error: "The name is too long (60 characters at most)." };
  const needs_vetting = get("needs_vetting") === "on";
  if (mode === "edit") return { ok: true, values: { name, needs_vetting } };

  const group = get("slot_group");
  if (!(SLOT_GROUPS as readonly string[]).includes(group)) return { ok: false, error: "Please pick the group." };
  const slot_group = group as SlotGroup;
  const allowed = TIMES_FOR_GROUP[slot_group];
  if (allowed.length === 0) return { ok: true, values: { name, slot_group, prayer_time: null, needs_vetting } };
  const time = get("prayer_time");
  if (!(allowed as readonly string[]).includes(time)) {
    return { ok: false, error: `Please pick which prayer time it takes (${allowed.map((k) => TIME_LABEL[k]).join(", ")}).` };
  }
  return { ok: true, values: { name, slot_group, prayer_time: time as TimeKey, needs_vetting } };
}

export function friendlyRotaError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied|not allowed/i.test(message)) return "Your account is not allowed to do this.";
  if (/rota_slot_types_unique_name/i.test(message)) return "There is already a slot type with that name.";
  if (/duplicate key|unique/i.test(message)) return "That could not be saved because it is already there. Please reload the page.";
  // The database's own messages are already written in plain words.
  if (/must be after|fill in|whole minutes|Friday|Jumu'ah|which prayer time|cannot change|not in this month|between the years|not on the list/i.test(message)) {
    return message;
  }
  return "That could not be saved. Please check the details and try again.";
}
