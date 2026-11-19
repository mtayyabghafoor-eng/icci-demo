// Plain rules for rota templates (slice P3.4): the Add a template slot form,
// day names, short descriptions and the database's refusals in plain words.
// The database enforces the same rules itself (migration 0031). Owner's
// choices, 18 Nov 2026: a template holds only the extra slots (shifts, on
// call, extra people on a prayer); four fixed templates; the two Eid
// templates are for one day; "Use this template" never touches a week that
// already has people on it.
import { isTime, SLOT_GROUP_LABEL, type SlotGroup } from "./rules";
import { timeText } from "./week";

type Get = (name: string) => string;
type Result<T> = { ok: true; values: T } | { ok: false; error: string };

export type TemplateKind = "week" | "day";
export type RotaTemplate = { id: string; name: string; kind: TemplateKind; description: string | null; display_order: number; active: boolean };
export const TEMPLATE_COLUMNS = "id, name, kind, description, display_order, active";

export type TemplateSlot = {
  id: number;
  template_id: string;
  day_of_week: number | null;
  slot_type_id: string;
  location_id: string | null;
  start_time: string | null;
  end_time: string | null;
  people_count: number;
  note: string | null;
  active: boolean;
};
export const TEMPLATE_SLOT_COLUMNS = "id, template_id, day_of_week, slot_type_id, location_id, start_time, end_time, people_count, note, active";

export type TemplateUse = { id: number; template_id: string; on_day: string | null; used_by: string; used_at: string; slots_added: number };
export const TEMPLATE_USE_COLUMNS = "id, template_id, on_day, used_by, used_at, slots_added";

/** 1 = Monday … 7 = Sunday, as the database stores them. */
export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const dayName = (dayOfWeek: number) => DAY_NAMES[dayOfWeek - 1] ?? "";

/** The day choices on the Add a template slot form: one day, or several at once. */
export const DAY_CHOICES: { value: string; label: string; days: number[] }[] = [
  { value: "every", label: "Every day (adds seven)", days: [1, 2, 3, 4, 5, 6, 7] },
  { value: "weekdays", label: "Monday to Friday (adds five)", days: [1, 2, 3, 4, 5] },
  { value: "weekend", label: "Saturday and Sunday (adds two)", days: [6, 7] },
  ...DAY_NAMES.map((name, i) => ({ value: String(i + 1), label: name, days: [i + 1] })),
];

export const KIND_TEXT: Record<TemplateKind, string> = {
  week: "Whole week",
  day: "One day (Eid)",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NewTemplateSlot = {
  slot_type_id: string;
  location_id: string | null;
  start_time: string | null;
  end_time: string | null;
  people_count: number;
  note: string | null;
};

/**
 * The Add a template slot form. Returns the days to add it on (null for a
 * one-day template) and the slot itself. `groupOf` maps each switched-on slot
 * type to its group.
 */
export function parseTemplateSlotForm(get: Get, kind: TemplateKind, groupOf: Map<string, SlotGroup>): Result<{ days: (number | null)[]; slot: NewTemplateSlot }> {
  let days: (number | null)[] = [null];
  if (kind === "week") {
    const choice = DAY_CHOICES.find((c) => c.value === get("days").trim());
    if (!choice) return { ok: false, error: "Please pick the day." };
    days = choice.days;
  }
  const slot_type_id = get("slot_type_id").trim();
  const group = groupOf.get(slot_type_id);
  if (!group) return { ok: false, error: "Please pick the slot." };
  if (group === "jumuah") {
    if (kind === "day") return { ok: false, error: "Jumu'ah slots cannot go in a one-day template; they come by themselves every Friday." };
    if (days.length !== 1 || days[0] !== 5) return { ok: false, error: "Jumu'ah slots go only on a Friday." };
  }

  const count = Number(get("people_count").trim() || "1");
  if (!Number.isInteger(count) || count < 1 || count > 20) return { ok: false, error: "How many people: a whole number from 1 to 20." };
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
  return { ok: true, values: { days, slot: { slot_type_id, location_id: location || null, start_time, end_time, people_count: count, note: note || null } } };
}

/** "Security, 18:00–22:00, 2 people" for lists. */
export function templateSlotText(slotName: string, group: SlotGroup, s: Pick<TemplateSlot, "start_time" | "end_time" | "people_count">): string {
  const when = group === "prayer" || group === "jumuah" ? "at the prayer time" : timeText(group, s.start_time, s.end_time);
  return `${slotName}, ${when}${s.people_count > 1 ? `, ${s.people_count} people` : ""}`;
}

/** How many empty slots a template adds: "24 empty slots". */
export function slotsText(n: number): string {
  return `${n} empty ${n === 1 ? "slot" : "slots"}`;
}

/** "Shifts 21, On call 7" for the template list. */
export function groupCounts(slots: { group: SlotGroup; people_count: number }[]): string {
  const totals = new Map<SlotGroup, number>();
  for (const s of slots) totals.set(s.group, (totals.get(s.group) ?? 0) + s.people_count);
  return [...totals.entries()].map(([g, n]) => `${SLOT_GROUP_LABEL[g]} ${n}`).join(", ");
}

export function friendlyTemplateError(message: string | undefined): string {
  if (!message) return "Something went wrong. Please try again.";
  if (/row-level security|permission denied|not allowed/i.test(message)) return "Your account is not allowed to do this.";
  // The database's own messages are already written in plain words.
  if (
    /has ended|switched off|inside that week|Friday|Jumu'ah|needs a start|start and an end|end time|building or a room|Prayer times|cannot be changed|day of the week|one-day template|whole week|which day|already has|no slots switched on|does not exist/i.test(
      message,
    )
  ) {
    return message;
  }
  return "That could not be saved. Please check the details and try again.";
}
