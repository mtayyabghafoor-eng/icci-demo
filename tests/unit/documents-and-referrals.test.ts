// Slices P1.20 and P1.21: the document form and where files are saved; the
// "passed to a company" step on a ticket and how its history line reads.
import { describe, expect, it } from "vitest";
import { documentPath, friendlyDocumentError, parseDocumentForm, parseHideReason } from "@/lib/documents/rules";
import { describeTicketEvent, parseStepForm, type TicketEventRow } from "@/lib/tickets/rules";

const ID = "11111111-1111-1111-1111-111111111111";
const form = (values: Record<string, string>) => (k: string) => values[k] ?? "";

describe("documents", () => {
  it("needs a kind; an empty title becomes the kind's name", () => {
    expect(parseDocumentForm(form({ kind: "manual", title: "  User  manual " }))).toEqual({ ok: true, values: { kind: "manual", title: "User manual" } });
    expect(parseDocumentForm(form({ kind: "warranty" }))).toEqual({ ok: true, values: { kind: "warranty", title: "Warranty" } });
    expect(parseDocumentForm(form({ kind: "recipe" })).ok).toBe(false);
  });
  it("hiding needs a reason", () => {
    expect(parseHideReason(form({ reason: " " })).ok).toBe(false);
    expect(parseHideReason(form({ reason: "Wrong model" }))).toEqual({ ok: true, values: "Wrong model" });
  });
  it("saves a new file each time in the model's or the item's folder", () => {
    expect(documentPath({ model_id: ID }, "pdf", "f")).toBe(`models/${ID}/f.pdf`);
    expect(documentPath({ item_id: ID }, "jpg", "f")).toBe(`items/${ID}/f.jpg`);
  });
  it("passes the database's plain refusals through", () => {
    expect(friendlyDocumentError("A document never changes. If it is wrong, hide it with a reason and add the right one.")).toMatch(/never changes/);
    expect(friendlyDocumentError("permission denied for table asset_documents")).toBe("Your account is not allowed to do this.");
  });
});

describe("passed to a company", () => {
  it("needs a company; the job number and note are optional", () => {
    expect(parseStepForm("refer", form({ company: ID, job_ref: " J-7 " }))).toEqual({ ok: true, values: { step: "refer", company: ID, jobRef: "J-7", note: null } });
    expect(parseStepForm("refer", form({ company: "" })).ok).toBe(false);
    expect(parseStepForm("refer", form({ company: ID, job_ref: "x".repeat(61) })).ok).toBe(false);
  });
  it("reads as one line in the ticket's history", () => {
    const e = { kind: "referred", company_id: ID, company_job_ref: "DEMO-123" } as TicketEventRow;
    expect(describeTicketEvent(e, new Map(), new Map([[ID, "Example Garden Machines Ltd"]]))).toBe("Passed to Example Garden Machines Ltd (their job number DEMO-123)");
    expect(describeTicketEvent({ ...e, company_job_ref: null }, new Map())).toBe("Passed to a company");
  });
});
