// Slice 8: the plain stocktake wording. The differences and the stock
// arithmetic are worked out by the database and tested in tests/db/stocktake.test.ts.
import { describe, expect, it } from "vitest";
import {
  decisionSummary,
  describeQuantity,
  DIFFERENCE_STATUS,
  friendlyStocktakeError,
  parseStocktakeId,
} from "@/lib/stocktake/rules";

describe("describing a counted difference", () => {
  it("says how many fewer or more were found", () => {
    expect(describeQuantity(10, 7, "roll")).toBe("10 rolls expected, 7 rolls found (3 fewer).");
    expect(describeQuantity(4, 9, "box")).toBe("4 boxes expected, 9 boxes found (5 more).");
  });
  it("says when a shelf was never counted before", () => {
    expect(describeQuantity(null, 6, "pack")).toBe("Never counted before. 6 packs found.");
  });
});

describe("decision summary", () => {
  it("counts what is still waiting", () => {
    expect(decisionSummary([])).toBe("No differences");
    expect(decisionSummary(["pending", "approved", "pending"])).toBe("2 of 3 waiting");
    expect(decisionSummary(["approved", "rejected"])).toBe("All decided");
  });
  it("status colours always come with a word", () => {
    expect(DIFFERENCE_STATUS.pending).toEqual({ word: "Waiting for approval", tone: "amber" });
    expect(DIFFERENCE_STATUS.rejected.tone).toBe("red");
  });
});

describe("database refusals shown on screen", () => {
  it("passes the database's own plain sentences through", () => {
    expect(friendlyStocktakeError("Nothing has been scanned yet. Scan the labels in the room first.")).toBe(
      "Nothing has been scanned yet. Scan the labels in the room first.",
    );
  });
  it("hides technical messages", () => {
    expect(friendlyStocktakeError('new row violates row-level security policy for table "stocktakes"')).toBe(
      "Your account is not allowed to do this.",
    );
    expect(friendlyStocktakeError("syntax error at or near x")).toBe("Something went wrong. Please try again.");
    expect(friendlyStocktakeError(undefined)).toBe("Something went wrong. Please try again.");
  });
});

describe("the 'scanning for' cookie", () => {
  it("accepts only a plain positive number", () => {
    expect(parseStocktakeId("42")).toBe(42);
    for (const raw of [null, "", "0", "-1", "4.2", "abc", "1; drop"]) expect(parseStocktakeId(raw), String(raw)).toBeNull();
  });
});
