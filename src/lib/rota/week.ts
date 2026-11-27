// Plain rules for the rota week screens (slice P3.2): which week to show,
// the Add a slot form, Garda vetting on a given day, and warnings in plain
// words. The database enforces the same rules itself and works out the
// warnings (migration 0029). Owner's choices, 18 Nov 2026: a new week starts
// with empty prayer and Jumu'ah slots; one person per slot; a prayer duty
// counts as 30 minutes (Jumu'ah 60) for double-booking; a week is locked
// once its Sunday has passed. Warnings never block.
import type { Tone } from "@/lib/items/rules";
import { addDays, isDate } from "@/lib/vetting/rules";
import { fullDayLabel, isTime, shortTime, SLOT_GROUP_LABEL, TIME_LABEL, type SlotGroup, type TimeKey } from "./rules";
import { UUID } from "@/lib/forms";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);

/** The Monday of the week this day is in. */
export function weekStartOf(iso: string): string {
  const day = utc(iso).getUTCDay(); // 0 Sunday … 6 Saturday
  return addDays(iso, -((day + 6) % 7));
}

/** The week from the address (any day in it), or this week. Years 2000-2100. */
export function readWeek(raw: string | string[] | undefined, today: string): string {
  if (typeof raw === "string" && isDate(raw)) {
    const monday = weekStartOf(raw);
    if (monday >= "2000-01-03" && monday <= "2100-12-27") return monday;
  }
  return weekStartOf(today);
}

export const shiftWeek = (monday: string, by: number) => addDays(monday, 7 * by);
export const weekDays = (monday: string) => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

export function weekTitle(monday: string): string {
  return `Week of ${fullDayLabel(monday)} ${monday.slice(0, 4)}`;
}

/** Locked once the week's Sunday has passed. */
export function weekEnded(monday: string, today: string): boolean {
  return addDays(monday, 6) < today;
}

export const WEEK_STATUS: Record<string, { word: string; tone: Tone }> = {
  draft: { word: "Draft", tone: "grey" },
  published: { word: "Published", tone: "green" },
};

/** "09:00–13:00", "From 12:20" (prayers), "All day" (on call without times). */
export function timeText(group: SlotGroup, startsAt: string | null, endsAt: string | null): string {
  if (group === "prayer" || group === "jumuah") return startsAt ? shortTime(startsAt) : "No time entered";
  if (!startsAt) return "All day";
  return `${shortTime(startsAt)}–${shortTime(endsAt)}`;
}

// ---------------------------------------------------------------------------
// Garda vetting on one day (for the person picker)

export type VettingOnDay = "valid" | "not_needed" | "applied" | "expired" | "none";
export type VettingRecord = { kind: "applied" | "vetted" | "not_required"; happened_on: string; expires_on: string | null };

/** The same rule as the warnings: needed if the slot or the role needs it (unless "not required" is on record for a role-only need). */
export function vettingOnDay(records: VettingRecord[], day: string, slotNeeds: boolean, roleNeeds: boolean): VettingOnDay {
  const known = records.filter((r) => r.happened_on <= day).sort((a, b) => b.happened_on.localeCompare(a.happened_on));
  const notRequired = known[0]?.kind === "not_required";
  if (!slotNeeds && (!roleNeeds || notRequired)) return "not_needed";
  if (known.some((r) => r.kind === "vetted" && r.expires_on && r.expires_on >= day)) return "valid";
  if (known.some((r) => r.kind === "applied")) return "applied";
  if (known.some((r) => r.kind === "vetted")) return "expired";
  return "none";
}

export const VETTING_ON_DAY: Record<VettingOnDay, { word: string; tone: Tone }> = {
  valid: { word: "Vetted", tone: "green" },
  not_needed: { word: "Vetting not needed", tone: "grey" },
  applied: { word: "Vetting applied for", tone: "red" },
  expired: { word: "Vetting expired", tone: "red" },
  none: { word: "Not vetted", tone: "red" },
};

// ---------------------------------------------------------------------------
// Warnings

export type WarningKind = "double_booked" | "vetting" | "no_prayer_time";
export type RotaWarning = {
  assignment_id: number;
  assignment_date: string;
  person_id: string | null;
  kind: WarningKind;
  other_assignment_id: number | null;
  vetting: "applied" | "expired" | "none" | null;
};
export const WARNING_COLUMNS = "assignment_id, assignment_date, person_id, kind, other_assignment_id, vetting";

/**
 * E3: a missing prayer time is about the week, not the person on the slot,
 * so it is said once at the top of the page and never beside each slot.
 * These are the warnings about a person (double-booked, Garda vetting).
 */
export function personWarnings<W extends Pick<RotaWarning, "kind">>(warnings: W[]): W[] {
  return warnings.filter((w) => w.kind !== "no_prayer_time");
}

/** E3: how many days have a prayer with no time entered (said once, at the top). */
export function daysWithoutPrayerTime(warnings: Pick<RotaWarning, "kind" | "assignment_date">[]): number {
  return new Set(warnings.filter((w) => w.kind === "no_prayer_time").map((w) => w.assignment_date)).size;
}

/** Vetting problems are red; the rest amber. */
export function warningTone(kind: WarningKind): Tone {
  return kind === "vetting" ? "red" : "amber";
}

/** One warning in plain words. `other` describes the clashing slot, e.g. "Dhuhr at 12:20". */
export function warningText(w: Pick<RotaWarning, "kind" | "vetting">, other?: string): string {
  switch (w.kind) {
    case "double_booked":
      return other ? `Also on ${other} that day` : "Also on another slot at the same time";
    case "vetting":
      if (w.vetting === "applied") return "Garda vetting applied for, not through yet";
      if (w.vetting === "expired") return "Garda vetting expired before this day";
      return "Garda vetting needed, none on record";
    case "no_prayer_time":
      return "No prayer time entered for this day";
  }
}

// ---------------------------------------------------------------------------
// The Add a slot form (shifts and on call; extra prayer slots too)

export type NewSlot = {
  assignment_date: string;
  slot_type_id: string;
  location_id: string | null;
  start_time: string | null;
  end_time: string | null;
  note: string | null;
};

/** `groupOf` maps each switched-on slot type to its group. */
export function parseAddSlotForm(get: Get, monday: string, groupOf: Map<string, SlotGroup>): Result<NewSlot> {
  const assignment_date = get("assignment_date").trim();
  if (!weekDays(monday).includes(assignment_date)) return { ok: false, error: "Please pick a day in this week." };
  const slot_type_id = get("slot_type_id").trim();
  const group = groupOf.get(slot_type_id);
  if (!group) return { ok: false, error: "Please pick the slot." };
  if (group === "jumuah" && utc(assignment_date).getUTCDay() !== 5) return { ok: false, error: "Jumu'ah slots go only on a Friday." };

  const location = get("location_id").trim();
  if (location && !UUID.test(location)) return { ok: false, error: "Please pick the place again." };
  const note = get("note").trim().replace(/\s+/g, " ");
  if (note.length > 200) return { ok: false, error: "The note is too long (200 characters at most)." };

  let start_time: string | null = get("start_time").trim() || null;
  let end_time: string | null = get("end_time").trim() || null;
  if (group === "prayer" || group === "jumuah") {
    start_time = end_time = null; // the time comes from Prayer times
  } else {
    if (group === "shift" && (!start_time || !end_time)) return { ok: false, error: "A shift needs a start time and an end time." };
    if (!start_time !== !end_time) return { ok: false, error: "Give both a start and an end time, or neither (on call all day)." };
    if (start_time && !isTime(start_time)) return { ok: false, error: "The start time is not a time. Use hours and minutes, like 09:00." };
    if (end_time && !isTime(end_time)) return { ok: false, error: "The end time is not a time. Use hours and minutes, like 13:00." };
    if (start_time && end_time && end_time <= start_time) {
      return { ok: false, error: "The end time must be after the start time. A night shift across midnight is two slots." };
    }
  }
  return { ok: true, values: { assignment_date, slot_type_id, location_id: location || null, start_time, end_time, note: note || null } };
}

/** "Security (Shifts)" for the slot drop-down. */
export function slotOptionLabel(name: string, group: SlotGroup, prayerTime: TimeKey | null): string {
  return prayerTime ? `${name} (${TIME_LABEL[prayerTime]} time)` : `${name} (${SLOT_GROUP_LABEL[group]})`;
}

export function friendlyWeekError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied|not allowed/i.test(message)) return "Your account is not allowed to do this.";
  if (/rota_weeks_week_start_key|duplicate key/i.test(message)) return "That week already has a rota. Reload the page.";
  // The database's own messages are already written in plain words.
  if (
    /has ended|switched off|inside that week|Friday|needs a start|start and an end|end time|building or a room|already removed|not on the rota|Prayer times|cannot be changed|Monday|same slot/i.test(
      message,
    )
  ) {
    return message;
  }
  return "That could not be saved. Please check the details and try again.";
}
