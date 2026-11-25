// Slice A7: the policy grid's filter carried through a sign-off and back.
import { describe, expect, it } from "vitest";
import { gridQuery, readGridBack } from "@/lib/policies/signoffs";

describe("A7: back to the policy grid after a sign-off", () => {
  it("writes the grid's filter as an address part", () => {
    expect(gridQuery({ section: "", role: "", status: "" })).toBe("");
    expect(gridQuery({ section: "s1", role: "", status: "attention" })).toBe("section=s1&status=attention");
  });
  it("reads it back, keeping only the three filter names", () => {
    expect(readGridBack("status=attention")).toBe("status=attention");
    expect(readGridBack("")).toBe("");
    expect(readGridBack(undefined)).toBeNull();
    expect(readGridBack(["a", "b"])).toBeNull();
    expect(readGridBack("status=overdue&next=//evil.example&role=r-1")).toBe("status=overdue&role=r-1");
    expect(readGridBack("status=<script>")).toBe("");
  });
});
