// Slice P3.4: the plain rules behind the Templates screens. The database
// enforces the same rules itself (tests/db/rota-templates.test.ts).
import { describe, expect, it } from "vitest";
import type { SlotGroup } from "@/lib/rota/rules";
import { dayName, friendlyTemplateError, groupCounts, parseTemplateSlotForm, slotsText, templateSlotText } from "@/lib/rota/templates";

const ids = { security: "11111111-1111-4111-8111-111111111111", isha: "22222222-2222-4222-8222-222222222222", jumuah: "33333333-3333-4333-8333-333333333333", funeral: "44444444-4444-4444-8444-444444444444" };
const groupOf = new Map<string, SlotGroup>([
  [ids.security, "shift"],
  [ids.isha, "prayer"],
  [ids.jumuah, "jumuah"],
  [ids.funeral, "on_call"],
]);
const form = (v: Record<string, string>) => (name: string) => v[name] ?? "";

describe("the Add a template slot form", () => {
  it("adds one row per chosen day, with how many people", () => {
    const r = parseTemplateSlotForm(form({ days: "weekdays", slot_type_id: ids.security, start_time: "18:00", end_time: "22:00", people_count: "2", note: "  Front   door " }), "week", groupOf);
    expect(r).toEqual({
      ok: true,
      values: { days: [1, 2, 3, 4, 5], slot: { slot_type_id: ids.security, location_id: null, start_time: "18:00", end_time: "22:00", people_count: 2, note: "Front door" } },
    });
    const every = parseTemplateSlotForm(form({ days: "every", slot_type_id: ids.funeral }), "week", groupOf);
    expect(every.ok && every.values.days).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const sunday = parseTemplateSlotForm(form({ days: "7", slot_type_id: ids.funeral }), "week", groupOf);
    expect(sunday.ok && sunday.values.days).toEqual([7]);
  });

  it("a one-day (Eid) template has no day", () => {
    const r = parseTemplateSlotForm(form({ slot_type_id: ids.security, start_time: "07:00", end_time: "12:00" }), "day", groupOf);
    expect(r.ok && r.values.days).toEqual([null]);
  });

  it("on call all day has no times; a prayer slot ignores typed times", () => {
    const onCall = parseTemplateSlotForm(form({ days: "1", slot_type_id: ids.funeral }), "week", groupOf);
    expect(onCall.ok && [onCall.values.slot.start_time, onCall.values.slot.end_time]).toEqual([null, null]);
    const isha = parseTemplateSlotForm(form({ days: "1", slot_type_id: ids.isha, start_time: "19:00", end_time: "20:00" }), "week", groupOf);
    expect(isha.ok && [isha.values.slot.start_time, isha.values.slot.end_time]).toEqual([null, null]);
  });

  it("refuses with plain words", () => {
    const err = (v: Record<string, string>, kind: "week" | "day" = "week") => {
      const r = parseTemplateSlotForm(form(v), kind, groupOf);
      return r.ok ? null : r.error;
    };
    expect(err({ slot_type_id: ids.security, start_time: "18:00", end_time: "22:00" })).toMatch(/pick the day/);
    expect(err({ days: "1", slot_type_id: "nope" })).toMatch(/pick the slot/);
    expect(err({ days: "1", slot_type_id: ids.security })).toMatch(/start time and an end time/);
    expect(err({ days: "1", slot_type_id: ids.security, start_time: "22:00", end_time: "18:00" })).toMatch(/after the start/);
    expect(err({ days: "1", slot_type_id: ids.funeral, start_time: "09:00" })).toMatch(/or neither/);
    expect(err({ days: "1", slot_type_id: ids.funeral, people_count: "0" })).toMatch(/1 to 20/);
    expect(err({ days: "1", slot_type_id: ids.funeral, people_count: "2.5" })).toMatch(/1 to 20/);
    expect(err({ days: "every", slot_type_id: ids.jumuah })).toMatch(/only on a Friday/);
    expect(err({ slot_type_id: ids.jumuah }, "day")).toMatch(/one-day template/);
    expect(err({ days: "5", slot_type_id: ids.jumuah })).toBeNull();
    expect(err({ days: "1", slot_type_id: ids.funeral, note: "x".repeat(201) })).toMatch(/too long/);
  });
});

describe("words on the Templates screens", () => {
  it("describes a template slot", () => {
    expect(templateSlotText("Security", "shift", { start_time: "18:00:00", end_time: "22:00:00", people_count: 2 })).toBe("Security, 18:00–22:00, 2 people");
    expect(templateSlotText("Funeral on call", "on_call", { start_time: null, end_time: null, people_count: 1 })).toBe("Funeral on call, All day");
    expect(templateSlotText("Isha", "prayer", { start_time: null, end_time: null, people_count: 1 })).toBe("Isha, at the prayer time");
  });

  it("counts slots by group, and names the days", () => {
    expect(groupCounts([{ group: "shift", people_count: 2 }, { group: "on_call", people_count: 1 }, { group: "shift", people_count: 1 }])).toBe("Shifts 3, On call 1");
    expect(slotsText(1)).toBe("1 empty slot");
    expect(slotsText(24)).toBe("24 empty slots");
    expect(dayName(1)).toBe("Monday");
    expect(dayName(7)).toBe("Sunday");
  });

  it("keeps the database's plain refusals, hides the technical ones", () => {
    expect(friendlyTemplateError("This week already has people on it, so a template cannot be used.")).toMatch(/already has people/);
    expect(friendlyTemplateError("This week already has the Normal week template.")).toMatch(/Normal week/);
    expect(friendlyTemplateError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyTemplateError("syntax error at or near")).toMatch(/could not be saved/);
  });
});
