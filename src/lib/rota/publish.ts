// Publishing a rota week and the one-page rota (slice P3.3). The database
// does the publishing and freezes a copy of the rota (migration 0030); this
// file only turns that copy into rows and words for the screens. Owner's
// choices, 18 Nov 2026: names and roles only, never phone numbers; a slot
// changed since the publication before is amber with the word "Changed"; a
// week can be published again; the admin who built it may publish it.
import { SLOT_GROUPS, type SlotGroup } from "./rules";
import { timeText } from "./week";

export type FrozenEntry = {
  id: number;
  date: string;
  slot_type_id: string;
  slot: string;
  slot_group: SlotGroup;
  display_order: number;
  starts_at: string | null;
  ends_at: string | null;
  place: string | null;
  person: string | null;
  person_role: string | null;
  note: string | null;
  changed: boolean;
};

export type FrozenCopy = {
  week_start: string;
  previous_publication_id: number | null;
  entries: FrozenEntry[];
  removed: FrozenEntry[];
};

export type Publication = {
  id: number;
  week_id: string;
  published_by: string;
  published_at: string;
  seen_warnings: boolean;
  warning_count: number;
  change_count: number;
  frozen_copy: FrozenCopy;
};
export const PUBLICATION_COLUMNS = "id, week_id, published_by, published_at, seen_warnings, warning_count, change_count, frozen_copy";

/** One row of the one-page rota: a slot type, with its entries for each day. */
export type PrintRow = { slotTypeId: string; slot: string; group: SlotGroup; byDay: FrozenEntry[][] };

/** Rows grouped as Prayers, Jumu'ah, Shifts, On call, in the slot types' order; days Monday to Sunday. */
export function printRows(copy: FrozenCopy, days: string[]): { group: SlotGroup; rows: PrintRow[] }[] {
  const byType = new Map<string, PrintRow & { order: number }>();
  for (const e of copy.entries) {
    let row = byType.get(e.slot_type_id);
    if (!row) {
      row = { slotTypeId: e.slot_type_id, slot: e.slot, group: e.slot_group, order: e.display_order, byDay: days.map(() => []) };
      byType.set(e.slot_type_id, row);
    }
    const day = days.indexOf(e.date);
    if (day >= 0) row.byDay[day].push(e);
  }
  for (const row of byType.values()) {
    for (const list of row.byDay) list.sort((a, b) => (a.starts_at ?? "").localeCompare(b.starts_at ?? "") || a.id - b.id);
  }
  return SLOT_GROUPS.map((group) => ({
    group,
    rows: [...byType.values()].filter((r) => r.group === group).sort((a, b) => a.order - b.order || a.slot.localeCompare(b.slot)),
  })).filter((g) => g.rows.length > 0);
}

/** "Ahmed Test (Imam)", or "Not filled yet". */
export function personText(e: Pick<FrozenEntry, "person" | "person_role">): string {
  if (!e.person) return "Not filled yet";
  return e.person_role ? `${e.person} (${e.person_role})` : e.person;
}

/** "Fajr, Tue 17 Nov, 06:45, was Ahmed Test (Imam)" for the removed list. */
export function removedText(e: FrozenEntry, dayLabel: (iso: string) => string): string {
  return `${e.slot}, ${dayLabel(e.date)}, ${timeText(e.slot_group, e.starts_at, e.ends_at)}: was ${e.person ? personText(e) : "not filled"}`;
}

/** "18 Nov 2026 at 14:05", Dublin time. */
export function publishedAtText(iso: string): string {
  const at = new Date(iso);
  const date = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Dublin" }).format(at);
  const time = new Intl.DateTimeFormat("en-IE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Europe/Dublin" }).format(at);
  return `${date} at ${time}`;
}

/** "3 changes since it was last published", for the week and Publish screens. */
export function changesSentence(changed: number, removed: number): string {
  const total = changed + removed;
  if (total === 0) return "No changes since it was last published.";
  const parts = [changed && `${changed} ${changed === 1 ? "slot" : "slots"} added or changed`, removed && `${removed} removed`].filter(Boolean);
  return `Since it was last published: ${parts.join(", ")}.`;
}

/** Which message the Publish page shows after the database refuses. */
export function publishProblem(message: string | undefined): string {
  if (!message) return "other";
  if (/I have seen the warnings/i.test(message)) return "tick";
  if (/has ended/i.test(message)) return "ended";
  if (/not allowed|row-level security|permission denied/i.test(message)) return "not-allowed";
  return "other";
}
