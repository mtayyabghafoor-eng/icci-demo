// Slice P2.4: the plain rules behind the training screens. The database
// enforces the same rules itself (migration 0021); these check the screens'
// side: the expiry filled in from the type's usual length, the forms, the
// words and colours, worst-first order and the CSV.
import { describe, expect, it } from "vitest";
import {
  DUE_WITHIN_DAYS,
  friendlyTrainingError,
  parseTrainingForm,
  parseTrainingTypeForm,
  suggestedExpiry,
  TRAINING_STATUS,
  trainingCsv,
  trainingFileName,
  trainingLine,
  usualLengthText,
  worstFirst,
  type TrainingRow,
} from "@/lib/training/rules";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const TODAY = "2026-11-16";
const TYPE = "11111111-2222-4333-8444-555555555555";

describe("the expiry filled in from the type's usual length", () => {
  it("adds the usual years to the date done", () => {
    expect(suggestedExpiry("2026-11-16", 2)).toBe("2028-11-16");
    expect(suggestedExpiry("2028-02-29", 1)).toBe("2029-02-28");
  });
  it("is empty when the type has no usual length, or the date is not real yet", () => {
    expect(suggestedExpiry("2026-11-16", null)).toBe("");
    expect(suggestedExpiry("2026-02-30", 2)).toBe("");
    expect(suggestedExpiry("", 2)).toBe("");
  });
  it("is described in plain words", () => {
    expect(usualLengthText(1)).toBe("Usually lasts 1 year");
    expect(usualLengthText(3)).toBe("Usually lasts 3 years");
    expect(usualLengthText(null)).toBe("No usual expiry");
  });
});

describe("the Record training form", () => {
  const ok = { training_type_id: TYPE, completed_on: "2026-10-01", expires_on: "2028-10-01" };

  it("accepts a type, a date and an expiry", () => {
    expect(parseTrainingForm(form(ok), TODAY)).toEqual({ ok: true, values: ok });
  });
  it("an empty expiry means no expiry", () => {
    expect(parseTrainingForm(form({ ...ok, expires_on: "" }), TODAY)).toEqual({ ok: true, values: { ...ok, expires_on: null } });
  });
  it("today is allowed; the future is not", () => {
    expect(parseTrainingForm(form({ ...ok, completed_on: TODAY, expires_on: "" }), TODAY).ok).toBe(true);
    expect(parseTrainingForm(form({ ...ok, completed_on: "2026-11-17" }), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/future/) });
  });
  it("refuses a missing type, a missing or unreal date", () => {
    expect(parseTrainingForm(form({ ...ok, training_type_id: "" }), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/type/) });
    expect(parseTrainingForm(form({ ...ok, completed_on: "" }), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/date/) });
    expect(parseTrainingForm(form({ ...ok, completed_on: "2026-02-30" }), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/real date/) });
  });
  it("the expiry must come after the date done, and at most 10 years later", () => {
    expect(parseTrainingForm(form({ ...ok, expires_on: "2026-10-01" }), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/after/) });
    expect(parseTrainingForm(form({ ...ok, expires_on: "2036-10-02" }), TODAY)).toMatchObject({ ok: false, error: expect.stringMatching(/10 years/) });
    expect(parseTrainingForm(form({ ...ok, expires_on: "2036-10-01" }), TODAY).ok).toBe(true);
  });
});

describe("the training type form", () => {
  it("accepts a name and a usual length of 1 to 10 years, or empty", () => {
    expect(parseTrainingTypeForm(form({ name: "  Food   hygiene ", usual_years: "3" }))).toEqual({ ok: true, values: { name: "Food hygiene", usual_years: 3 } });
    expect(parseTrainingTypeForm(form({ name: "Induction", usual_years: "" }))).toEqual({ ok: true, values: { name: "Induction", usual_years: null } });
  });
  it("refuses an empty name and a length outside 1 to 10 whole years", () => {
    expect(parseTrainingTypeForm(form({ name: " ", usual_years: "1" })).ok).toBe(false);
    for (const bad of ["0", "11", "1.5", "two", "-1"]) expect(parseTrainingTypeForm(form({ name: "X", usual_years: bad })).ok, bad).toBe(false);
  });
});

describe("status words and colours", () => {
  it("always a word beside the colour: red expired, amber due soon, green valid or no expiry", () => {
    expect(TRAINING_STATUS.expired).toEqual({ word: "Expired", tone: "red" });
    expect(TRAINING_STATUS.due).toEqual({ word: "Due soon", tone: "amber" });
    expect(TRAINING_STATUS.valid).toEqual({ word: "Valid", tone: "green" });
    expect(TRAINING_STATUS.no_expiry).toEqual({ word: "No expiry", tone: "green" });
    expect(DUE_WITHIN_DAYS).toBe(60);
  });

  it("one line in plain words", () => {
    expect(trainingLine({ status: "valid", completed_on: "2026-01-03", expires_on: "2028-01-03" }, TODAY)).toBe("Done 3 Jan 2026. Expires 3 Jan 2028.");
    expect(trainingLine({ status: "due", completed_on: "2025-12-16", expires_on: "2026-12-16" }, TODAY)).toBe("Done 16 Dec 2025. Expires 16 Dec 2026, in 30 days.");
    expect(trainingLine({ status: "due", completed_on: "2025-11-17", expires_on: "2026-11-17" }, TODAY)).toMatch(/in 1 day\.$/);
    expect(trainingLine({ status: "due", completed_on: "2025-11-16", expires_on: TODAY }, TODAY)).toMatch(/Expires today/);
    expect(trainingLine({ status: "expired", completed_on: "2024-01-01", expires_on: "2025-01-01" }, TODAY)).toBe("Done 1 Jan 2024. Expired on 1 Jan 2025.");
    expect(trainingLine({ status: "no_expiry", completed_on: "2024-01-01", expires_on: null }, TODAY)).toBe("Done 1 Jan 2024. No expiry.");
  });
});

const row = (full_name: string, status: TrainingRow["status"], expires_on: string | null): TrainingRow => ({
  person_id: full_name,
  full_name,
  person_role_id: "r",
  section_id: "s",
  active: true,
  training_type_id: "t",
  completed_on: "2025-01-01",
  expires_on,
  status,
});

describe("worst first", () => {
  it("expired, then due soon, then valid, then no expiry; soonest expiry first; then by name", () => {
    const sorted = worstFirst([
      row("Test A", "no_expiry", null),
      row("Test B", "valid", "2028-01-01"),
      row("Test C", "due", "2026-12-20"),
      row("Test D", "expired", "2026-01-01"),
      row("Test E", "due", "2026-12-01"),
      row("Test F", "expired", "2025-01-01"),
    ]);
    expect(sorted.map((r) => r.full_name)).toEqual(["Test F", "Test D", "Test E", "Test C", "Test B", "Test A"]);
  });
});

describe("the training list CSV", () => {
  it("has a header, the type name, the status word and plain dates, and opens in Excel with Arabic", () => {
    const csv = trainingCsv(
      [{ ...row("Test مريم Madeup", "valid", "2028-01-01"), person_role_id: "r1", section_id: "s1", training_type_id: "t1" }],
      new Map([["r1", "Volunteer"]]),
      new Map([["s1", "Volunteers"]]),
      new Map([["t1", "First aid"]]),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).trim().split("\r\n")).toEqual([
      "Name,Role,Section,Training,Status,Done on,Expires on",
      "Test مريم Madeup,Volunteer,Volunteers,First aid,Valid,2025-01-01,2028-01-01",
    ]);
  });
  it("a name can never run as a spreadsheet formula", () => {
    const csv = trainingCsv([row("=HYPERLINK(1)", "no_expiry", null)], new Map(), new Map(), new Map());
    expect(csv).not.toMatch(/\r\n=HYPERLINK/);
  });
  it("is named with the date", () => {
    expect(trainingFileName(new Date("2026-11-16T10:00:00Z"))).toBe("icci-training-2026-11-16.csv");
  });
});

describe("database messages become plain words", () => {
  it("keeps the database's own plain messages and hides technical ones", () => {
    expect(friendlyTrainingError("You cannot record your own training. Ask another admin.")).toMatch(/your own/);
    expect(friendlyTrainingError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyTrainingError('duplicate key value violates unique constraint "training_types_unique_name"')).toMatch(/already a training type/);
    expect(friendlyTrainingError("syntax error at or near")).toMatch(/could not be saved/);
  });
});
