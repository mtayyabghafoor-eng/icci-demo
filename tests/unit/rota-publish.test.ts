// Slice P3.3: turning a published rota's frozen copy into the one-page rota,
// and the plain words around publishing. The database does the publishing
// itself (tests/db/rota-publish.test.ts).
import { describe, expect, it } from "vitest";
import { changesSentence, personText, printRows, publishedAtText, publishProblem, removedText, type FrozenCopy, type FrozenEntry } from "@/lib/rota/publish";
import { shortDayLabel } from "@/lib/rota/rules";
import { weekDays } from "@/lib/rota/week";

const monday = "2026-11-16";
const days = weekDays(monday);

let next = 1;
function entry(over: Partial<FrozenEntry>): FrozenEntry {
  return {
    id: next++,
    date: monday,
    slot_type_id: "fajr",
    slot: "Fajr",
    slot_group: "prayer",
    display_order: 1,
    starts_at: "06:45",
    ends_at: null,
    place: null,
    person: "Test Person A",
    person_role: "Imam",
    note: null,
    changed: false,
    ...over,
  };
}

describe("the one-page rota layout", () => {
  it("groups rows as Prayers, Jumu'ah, Shifts, On call, in the slot types' order", () => {
    const copy: FrozenCopy = {
      week_start: monday,
      previous_publication_id: null,
      removed: [],
      entries: [
        entry({ slot_type_id: "sec", slot: "Security", slot_group: "shift", display_order: 1, starts_at: "09:00", ends_at: "13:00" }),
        entry({ slot_type_id: "dhuhr", slot: "Dhuhr", display_order: 2 }),
        entry({ slot_type_id: "fajr", slot: "Fajr", display_order: 1 }),
        entry({ slot_type_id: "fun", slot: "Funeral on call", slot_group: "on_call", starts_at: null }),
        entry({ slot_type_id: "j1", slot: "Jumu'ah 1", slot_group: "jumuah", date: days[4] }),
      ],
    };
    const groups = printRows(copy, days);
    expect(groups.map((g) => [g.group, g.rows.map((r) => r.slot)])).toEqual([
      ["prayer", ["Fajr", "Dhuhr"]],
      ["jumuah", ["Jumu'ah 1"]],
      ["shift", ["Security"]],
      ["on_call", ["Funeral on call"]],
    ]);
    const jumuah = groups[1].rows[0];
    expect(jumuah.byDay.map((list) => list.length)).toEqual([0, 0, 0, 0, 1, 0, 0]);
  });

  it("puts two people on one duty in the same square, earliest first", () => {
    const copy: FrozenCopy = {
      week_start: monday,
      previous_publication_id: 1,
      removed: [],
      entries: [
        entry({ slot_type_id: "sec", slot: "Security", slot_group: "shift", starts_at: "14:00", ends_at: "18:00", person: "Later" }),
        entry({ slot_type_id: "sec", slot: "Security", slot_group: "shift", starts_at: "09:00", ends_at: "13:00", person: "Earlier" }),
      ],
    };
    const [{ rows }] = printRows(copy, days);
    expect(rows[0].byDay[0].map((e) => e.person)).toEqual(["Earlier", "Later"]);
  });

  it("ignores an entry outside the week instead of failing", () => {
    const copy: FrozenCopy = { week_start: monday, previous_publication_id: null, removed: [], entries: [entry({ date: "2026-12-01" })] };
    expect(printRows(copy, days)[0].rows[0].byDay.flat()).toEqual([]);
  });
});

describe("words on the rota", () => {
  it("shows the name and role, or that nobody is on", () => {
    expect(personText({ person: "Test Person A", person_role: "Imam" })).toBe("Test Person A (Imam)");
    expect(personText({ person: "Test Person B", person_role: null })).toBe("Test Person B");
    expect(personText({ person: null, person_role: null })).toBe("Not filled yet");
  });

  it("describes a slot taken off since the version before", () => {
    expect(removedText(entry({ slot: "Cleaning", slot_group: "shift", starts_at: "07:00", ends_at: "09:00" }), shortDayLabel)).toBe(
      `Cleaning, ${shortDayLabel(monday)}, 07:00–09:00: was Test Person A (Imam)`,
    );
    expect(removedText(entry({ person: null }), shortDayLabel)).toMatch(/was not filled$/);
  });

  it("gives the publishing time in Dublin", () => {
    expect(publishedAtText("2026-11-18T14:05:00Z")).toBe("18 Nov 2026 at 14:05");
    expect(publishedAtText("2026-07-01T09:30:00Z")).toBe("1 Jul 2026 at 10:30"); // summer time
  });

  it("counts the changes since the last publication", () => {
    expect(changesSentence(0, 0)).toBe("No changes since it was last published.");
    expect(changesSentence(1, 0)).toBe("Since it was last published: 1 slot added or changed.");
    expect(changesSentence(2, 1)).toBe("Since it was last published: 2 slots added or changed, 1 removed.");
    expect(changesSentence(0, 2)).toBe("Since it was last published: 2 removed.");
  });

  it("turns the database's refusals into a short message key", () => {
    expect(publishProblem('This week has 3 warnings. Tick "I have seen the warnings" to publish it.')).toBe("tick");
    expect(publishProblem("That week has ended. Its rota can no longer be published.")).toBe("ended");
    expect(publishProblem("new row violates row-level security policy")).toBe("not-allowed");
    expect(publishProblem(undefined)).toBe("other");
  });
});
