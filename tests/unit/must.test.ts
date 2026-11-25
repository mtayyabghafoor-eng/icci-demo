// Slice A6: a failed database read stops the page (which then shows "Try
// again") instead of looking like an empty list.
import { describe, expect, it } from "vitest";
import { must } from "../../src/lib/supabase/must";

describe("must", () => {
  it("passes a good answer through unchanged", () => {
    const answer = { data: [1, 2], error: null, count: 2 };
    expect(must(answer)).toBe(answer);
  });
  it("an empty answer is still a good answer", () => {
    expect(must({ data: [], error: null }).data).toEqual([]);
  });
  it("stops on a failed read, never returning an empty list", () => {
    expect(() => must({ data: null, error: { message: "timeout" } })).toThrow(/could not be loaded: timeout/);
  });
});
