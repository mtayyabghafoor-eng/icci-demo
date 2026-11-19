// Slice P3.5: the plain rules behind the ticket screens. The database
// enforces the real rules (see tests/db/tickets.test.ts).
import { describe, expect, it } from "vitest";
import { SEED_TICKETS } from "../../scripts/seed-data.mts";
import {
  filtersQuery,
  friendlyTicketError,
  listOrder,
  parseStepForm,
  parseTicketForm,
  statusChoices,
  readFilters,
  shortDescription,
  STATUS_LABEL,
  ticketNumber,
  ticketsCsv,
  ticketsFileName,
  type TicketCsvRow,
  type TicketRow,
} from "@/lib/tickets/rules";

const PLACE = "11111111-1111-4111-8111-111111111111";
const PERSON = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";

const form = (values: Record<string, string>) => (name: string) => values[name] ?? "";

function row(extra: Partial<TicketRow>): TicketRow {
  return {
    id: 1,
    description: "Test",
    priority: "normal",
    item_id: null,
    location_id: PLACE,
    reported_by: "Test volunteer",
    reported_by_person_id: null,
    photo_path: null,
    asset_event_id: null,
    status: "open",
    assigned_person_id: null,
    closing_note: null,
    cost_cents: null,
    closed_at: null,
    created_by: null,
    created_at: "2026-11-10T10:00:00Z",
    ...extra,
  };
}

describe("Report a problem form", () => {
  it("needs a description and a place, and starts on Normal priority", () => {
    expect(parseTicketForm(form({ location_id: PLACE, reported_by: "A" }), null)).toEqual({ ok: false, error: "Describe the problem." });
    expect(parseTicketForm(form({ description: "Leak", reported_by: "A" }), null)).toEqual({ ok: false, error: "Pick where the problem is." });
    const r = parseTicketForm(form({ description: " Leak ", location_id: PLACE, reported_by_person_id: PERSON }), null);
    expect(r).toEqual({ ok: true, values: { description: "Leak", priority: "normal", location_id: PLACE, reported_by_person_id: PERSON } });
  });

  it("from an asset's page, the asset is used and no place is needed", () => {
    const r = parseTicketForm(form({ description: "Wobbly", priority: "urgent", reported_by: "Reception", location_id: PLACE }), ITEM);
    expect(r).toEqual({ ok: true, values: { description: "Wobbly", priority: "urgent", item_id: ITEM, reported_by: "Reception" } });
  });

  it("refuses an unknown priority, a made-up place or person, and a missing name", () => {
    expect(parseTicketForm(form({ description: "x", location_id: PLACE, priority: "panic", reported_by: "A" }), null).ok).toBe(false);
    expect(parseTicketForm(form({ description: "x", location_id: "nope", reported_by: "A" }), null).ok).toBe(false);
    expect(parseTicketForm(form({ description: "x", location_id: PLACE, reported_by_person_id: "nope" }), null).ok).toBe(false);
    expect(parseTicketForm(form({ description: "x", location_id: PLACE, reported_by_person_id: "other" }), null)).toEqual({
      ok: false,
      error: "Type the name of who reported it.",
    });
  });
});

describe("tickets list", () => {
  it("not closed first, urgent on top, then open before in progress before waiting, oldest first; closed last, newest closed first", () => {
    const rows = [
      row({ id: 1, status: "closed", closed_at: "2026-11-01T00:00:00Z" }),
      row({ id: 2, status: "waiting" }),
      row({ id: 3, status: "open", created_at: "2026-11-12T00:00:00Z" }),
      row({ id: 4, status: "in_progress", priority: "urgent" }),
      row({ id: 5, status: "open", created_at: "2026-11-11T00:00:00Z" }),
      row({ id: 6, status: "closed", closed_at: "2026-11-05T00:00:00Z" }),
      row({ id: 7, status: "open", priority: "low" }),
    ];
    expect(rows.sort(listOrder).map((r) => r.id)).toEqual([4, 5, 3, 2, 7, 6, 1]);
  });

  it("status colours: closed green, in progress and waiting amber, open red", () => {
    expect(STATUS_LABEL.closed.tone).toBe("green");
    expect(STATUS_LABEL.in_progress.tone).toBe("amber");
    expect(STATUS_LABEL.waiting.tone).toBe("amber");
    expect(STATUS_LABEL.open.tone).toBe("red");
  });

  it("filters come from the address, with anything odd ignored", () => {
    expect(readFilters({})).toEqual({ status: "not_closed", priority: "", place: "", assigned: "" });
    expect(readFilters({ status: "closed", priority: "urgent", place: PLACE, assigned: "nobody" })).toEqual({
      status: "closed",
      priority: "urgent",
      place: PLACE,
      assigned: "nobody",
    });
    expect(readFilters({ status: "drop table", priority: "x", place: "y", assigned: "z" })).toEqual(readFilters({}));
    expect(filtersQuery(readFilters({}))).toBe("");
    expect(filtersQuery(readFilters({ status: "all", assigned: PERSON }))).toBe(`?status=all&assigned=${PERSON}`);
  });

  it("numbers, short descriptions and friendly errors", () => {
    expect(ticketNumber(7)).toBe("T-0007");
    expect(shortDescription("First line\nsecond line")).toBe("First line");
    expect(shortDescription("a".repeat(100), 10)).toBe(`${"a".repeat(9)}…`);
    expect(friendlyTicketError("Say where the problem is.")).toBe("Say where the problem is.");
    expect(friendlyTicketError('new row violates row-level security policy for table "maintenance_tickets"')).toBe(
      "Your account is not allowed to do this.",
    );
    expect(friendlyTicketError("weird internal thing")).toBe("Something went wrong. Please try again.");
  });
});

describe("tickets CSV", () => {
  it("one line per ticket, words for status and priority, cost in euro, formulas made harmless", () => {
    const r: TicketCsvRow = {
      ...row({ id: 12, status: "closed", priority: "urgent", cost_cents: 4550, closing_note: "Washer replaced", closed_at: "2026-11-14T10:00:00Z" }),
      description: "=HYPERLINK(\"x\")",
      place: "Test Building A › Test Room A1",
      asset: "",
      reporter: "Test volunteer",
      assignee: "Test plumber",
    };
    const lines = ticketsCsv([r]).replace(/^﻿/, "").split("\r\n");
    expect(lines[0]).toBe("Ticket,Reported,Priority,Status,Place,Asset,Description,Reported by,Assigned to,Closed,Closing note,Cost (EUR)");
    expect(lines[1]).toBe(`T-0012,2026-11-10,Urgent,Closed,Test Building A › Test Room A1,,"'=HYPERLINK(""x"")",Test volunteer,Test plumber,2026-11-14,Washer replaced,45.50`);
    expect(ticketsFileName(new Date("2026-11-18T12:00:00Z"))).toBe("icci-tickets-2026-11-18.csv");
  });
});

describe("made-up tickets in the seed", () => {
  it("are obviously fictional and show every status and priority", () => {
    expect(SEED_TICKETS.length).toBeGreaterThanOrEqual(8);
    for (const t of SEED_TICKETS) expect(t.description).toMatch(/\(made up\)/);
    expect(new Set(SEED_TICKETS.map((t) => t.finalStatus))).toEqual(new Set(["open", "in_progress", "waiting", "closed"]));
    expect(new Set(SEED_TICKETS.map((t) => t.priority))).toEqual(new Set(["low", "normal", "urgent"]));
    expect(SEED_TICKETS.some((t) => t.label)).toBe(true);
    expect(SEED_TICKETS.some((t) => t.place)).toBe(true);
  });
});

describe("steps on a ticket's page (P3.6)", () => {
  it("offers every status the ticket is not in now, and none once closed", () => {
    expect(statusChoices("open")).toEqual(["in_progress", "waiting"]);
    expect(statusChoices("in_progress")).toEqual(["waiting", "open"]);
    expect(statusChoices("waiting")).toEqual(["in_progress", "open"]);
    expect(statusChoices("closed")).toEqual([]);
  });

  it("assigning needs a person; the note is optional", () => {
    expect(parseStepForm("assign", form({}))).toEqual({ ok: false, error: "Pick who the ticket is assigned to." });
    expect(parseStepForm("assign", form({ person: PERSON }))).toEqual({ ok: true, values: { step: "assign", person: PERSON, note: null } });
  });

  it("status and priority must be real choices", () => {
    expect(parseStepForm("status", form({ status: "closed" })).ok).toBe(false);
    expect(parseStepForm("status", form({ status: "waiting", note: " part ordered " }))).toEqual({
      ok: true,
      values: { step: "status", status: "waiting", note: "part ordered" },
    });
    expect(parseStepForm("priority", form({ priority: "panic" })).ok).toBe(false);
    expect(parseStepForm("priority", form({ priority: "urgent" }))).toEqual({ ok: true, values: { step: "priority", priority: "urgent", note: null } });
  });

  it("a note, a closing note and a reopening reason are needed", () => {
    expect(parseStepForm("note", form({ note: "  " }))).toEqual({ ok: false, error: "Write the note." });
    expect(parseStepForm("close", form({}))).toEqual({ ok: false, error: "Write a closing note saying what was done." });
    expect(parseStepForm("reopen", form({}))).toEqual({ ok: false, error: "Write the reason for reopening." });
  });

  it("closing reads the cost in euro and the 'mark repaired' choice", () => {
    expect(parseStepForm("close", form({ note: "Fixed", cost: "€1,045.50", repaired: "fair" }))).toEqual({
      ok: true,
      values: { step: "close", note: "Fixed", costCents: 104550, repaired: "fair" },
    });
    expect(parseStepForm("close", form({ note: "Fixed" }))).toEqual({ ok: true, values: { step: "close", note: "Fixed", costCents: null, repaired: null } });
    expect(parseStepForm("close", form({ note: "Fixed", cost: "about 40" })).ok).toBe(false);
    expect(parseStepForm("close", form({ note: "Fixed", cost: "-5" })).ok).toBe(false);
    expect(parseStepForm("close", form({ note: "Fixed", repaired: "perfect" })).ok).toBe(false);
  });
});
