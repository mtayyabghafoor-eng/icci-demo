// Slice P2.3: the plain rules behind the Garda vetting screens. The database
// enforces the same rules itself (migration 0020); these check the screens'
// side: the 3-year default, the form, the words and colours, and the CSV.
import { describe, expect, it } from "vitest";
import {
  addDays,
  addYears,
  daysBetween,
  defaultExpiry,
  friendlyVettingError,
  parseVettingForm,
  parseWithdrawReason,
  statusLine,
  todayInDublin,
  VETTING_STATUS,
  VETTING_YEARS,
  vettingCsv,
  vettingFileName,
  worstFirst,
  type VettingRow,
} from "@/lib/vetting/rules";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const TODAY = "2026-11-15";

describe("dates", () => {
  it("the usual re-vetting period is 3 years (owner's choice)", () => {
    expect(VETTING_YEARS).toBe(3);
    expect(defaultExpiry("2026-11-15")).toBe("2029-11-15");
  });

  it("29 February becomes 28 February when the expiry year has none", () => {
    expect(addYears("2028-02-29", 3)).toBe("2031-02-28");
    expect(addYears("2028-02-29", 4)).toBe("2032-02-29");
  });

  it("adds and counts days across months and years", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-11-15", "2027-01-14")).toBe(60);
  });

  it("today is the date in Dublin, not the server's own time zone", () => {
    // 23:30 world time on 30 June is already 00:30 on 1 July in Irish summer time.
    expect(todayInDublin(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07-01");
    expect(todayInDublin(new Date("2026-12-31T23:30:00Z"))).toBe("2026-12-31");
  });
});

describe("the Record vetting form", () => {
  it("a vetting with no expiry typed gets vetted date + 3 years", () => {
    expect(parseVettingForm(form({ kind: "vetted", happened_on: "2026-11-01" }), TODAY)).toEqual({
      ok: true,
      values: { kind: "vetted", happened_on: "2026-11-01", expires_on: "2029-11-01" },
    });
  });

  it("keeps an expiry the admin changed", () => {
    const r = parseVettingForm(form({ kind: "vetted", happened_on: "2026-11-01", expires_on: "2031-11-01" }), TODAY);
    expect(r).toMatchObject({ ok: true, values: { expires_on: "2031-11-01" } });
  });

  it("'applied' and 'not required' never keep an expiry", () => {
    for (const kind of ["applied", "not_required"]) {
      const r = parseVettingForm(form({ kind, happened_on: "2026-11-01", expires_on: "2029-11-01" }), TODAY);
      expect(r).toEqual({ ok: true, values: { kind, happened_on: "2026-11-01", expires_on: null } });
    }
  });

  it("refuses what the database refuses, in plain words", () => {
    const bad: [Record<string, string>, RegExp][] = [
      [{ kind: "", happened_on: "2026-11-01" }, /what happened/i],
      [{ kind: "disclosure", happened_on: "2026-11-01" }, /what happened/i],
      [{ kind: "applied", happened_on: "" }, /date/i],
      [{ kind: "applied", happened_on: "2026-02-30" }, /real date/i],
      [{ kind: "applied", happened_on: "2026-11-16" }, /future/i],
      [{ kind: "vetted", happened_on: "2026-11-01", expires_on: "2026-11-01" }, /after/i],
      [{ kind: "vetted", happened_on: "2026-11-01", expires_on: "2036-11-02" }, /10 years/i],
      [{ kind: "vetted", happened_on: "2026-11-01", expires_on: "soon" }, /real date/i],
    ];
    for (const [values, message] of bad) {
      const r = parseVettingForm(form(values), TODAY);
      expect(r.ok, JSON.stringify(values)).toBe(false);
      if (!r.ok) expect(r.error).toMatch(message);
    }
  });

  it("today itself is allowed", () => {
    expect(parseVettingForm(form({ kind: "applied", happened_on: TODAY }), TODAY).ok).toBe(true);
  });
});

describe("withdrawing", () => {
  it("needs a reason of 500 characters or fewer, tidied", () => {
    expect(parseWithdrawReason("  Entered for the wrong person ")).toEqual({ ok: true, values: "Entered for the wrong person" });
    expect(parseWithdrawReason("   ").ok).toBe(false);
    expect(parseWithdrawReason("x".repeat(501)).ok).toBe(false);
  });
});

describe("status words and colours (always a word beside the colour)", () => {
  it("valid green; applied and due amber; none and expired red; not required grey", () => {
    expect(VETTING_STATUS.valid).toEqual({ word: "Valid", tone: "green" });
    expect(VETTING_STATUS.applied.tone).toBe("amber");
    expect(VETTING_STATUS.due.tone).toBe("amber");
    expect(VETTING_STATUS.none.tone).toBe("red");
    expect(VETTING_STATUS.expired.tone).toBe("red");
    expect(VETTING_STATUS.not_required.tone).toBe("grey");
    for (const s of Object.values(VETTING_STATUS)) expect(s.word.length).toBeGreaterThan(0);
  });

  const row = (extra: Partial<VettingRow>): VettingRow => ({
    person_id: "p",
    full_name: "Test Person",
    person_role_id: "r",
    section_id: "s",
    active: true,
    needs_vetting: true,
    status: "valid",
    vetted_on: "2025-01-01",
    expires_on: "2028-01-01",
    applied_on: null,
    ...extra,
  });

  it("explains the status in one line", () => {
    expect(statusLine(row({ status: "valid" }), TODAY)).toBe("Expires 1 Jan 2028.");
    expect(statusLine(row({ status: "due", expires_on: "2026-12-15" }), TODAY)).toBe("Expires 15 Dec 2026, in 30 days.");
    expect(statusLine(row({ status: "due", expires_on: TODAY }), TODAY)).toBe("Expires today (15 Nov 2026).");
    expect(statusLine(row({ status: "expired", expires_on: "2026-11-10" }), TODAY)).toBe("Expired on 10 Nov 2026.");
    expect(statusLine(row({ status: "applied", vetted_on: null, expires_on: null, applied_on: "2026-11-01" }), TODAY)).toBe(
      "Applied on 1 Nov 2026. Not vetted yet.",
    );
    expect(statusLine(row({ status: "none", vetted_on: null, expires_on: null }), TODAY)).toBe("Needs Garda vetting. Nothing on record.");
    expect(statusLine(row({ status: "not_required", needs_vetting: false }), TODAY)).toBe("Their role does not need Garda vetting.");
    expect(statusLine(row({ status: "not_required", needs_vetting: true }), TODAY)).toBe("Marked as not required for this person.");
  });

  it("adds the re-vetting application when someone is still vetted", () => {
    expect(statusLine(row({ status: "due", expires_on: "2026-12-15", applied_on: "2026-11-10" }), TODAY)).toBe(
      "Expires 15 Dec 2026, in 30 days. Re-vetting applied on 10 Nov 2026.",
    );
  });

  it("sorts worst first: expired, none, due, applied, valid, not required; soonest expiry first", () => {
    const rows = [
      row({ full_name: "F", status: "not_required" }),
      row({ full_name: "E", status: "valid", expires_on: "2029-01-01" }),
      row({ full_name: "D", status: "valid", expires_on: "2028-01-01" }),
      row({ full_name: "C", status: "applied" }),
      row({ full_name: "B2", status: "due", expires_on: "2026-12-20" }),
      row({ full_name: "B1", status: "due", expires_on: "2026-11-20" }),
      row({ full_name: "A2", status: "none" }),
      row({ full_name: "A1", status: "expired" }),
    ];
    expect(worstFirst(rows).map((r) => r.full_name)).toEqual(["A1", "A2", "B1", "B2", "C", "D", "E", "F"]);
  });
});

describe("the vetting list CSV", () => {
  it("has a header, plain dates, the status word, and opens in Excel with Arabic", () => {
    const csv = vettingCsv(
      [
        {
          person_id: "p",
          full_name: "Test أمينة Sample",
          person_role_id: "r",
          section_id: "s",
          active: true,
          needs_vetting: true,
          status: "due",
          vetted_on: "2023-12-01",
          expires_on: "2026-12-01",
          applied_on: null,
        },
      ],
      new Map([["r", "Volunteer"]]),
      new Map([["s", "Volunteers"]]),
    );
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trim().split("\r\n");
    expect(lines[0]).toBe("Name,Role,Section,Status,Vetted on,Expires on,Re-vetting applied on");
    expect(lines[1]).toBe("Test أمينة Sample,Volunteer,Volunteers,Due soon,2023-12-01,2026-12-01,");
  });

  it("a name can never run as a spreadsheet formula", () => {
    const csv = vettingCsv(
      [
        {
          person_id: "p",
          full_name: "=HYPERLINK(1)",
          person_role_id: "r",
          section_id: "s",
          active: true,
          needs_vetting: true,
          status: "none",
          vetted_on: null,
          expires_on: null,
          applied_on: null,
        },
      ],
      new Map(),
      new Map(),
    );
    expect(csv).not.toMatch(/\r\n=HYPERLINK/);
  });

  it("is named with the date", () => {
    expect(vettingFileName(new Date("2026-11-15T10:00:00Z"))).toBe("icci-garda-vetting-2026-11-15.csv");
  });
});

describe("database messages become plain words", () => {
  it("passes on the database's own explanations and hides technical ones", () => {
    expect(friendlyVettingError("You cannot record your own Garda vetting. Ask another admin.")).toMatch(/your own/i);
    expect(friendlyVettingError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyVettingError(undefined)).toMatch(/try again/i);
  });
});
