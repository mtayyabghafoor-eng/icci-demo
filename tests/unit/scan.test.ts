// Slice UI-7: the in-app camera scanner keeps only an ICCI label number.
import { describe, expect, it } from "vitest";
import { labelFromScan } from "@/lib/items/scan";

describe("labelFromScan", () => {
  it("reads the label number from a printed label's web address", () => {
    expect(labelFromScan("https://icci-prototype.vercel.app/l/ICCI-000123")).toBe("ICCI-000123");
    expect(labelFromScan("http://localhost:3000/l/ICCI-000123/")).toBe("ICCI-000123");
    expect(labelFromScan("https://example.test/l/icci-42?x=1")).toBe("ICCI-000042");
  });

  it("accepts a bare label number", () => {
    expect(labelFromScan("ICCI-000123")).toBe("ICCI-000123");
    expect(labelFromScan(" icci 7 ")).toBe("ICCI-000007");
  });

  it("refuses anything that is not an ICCI label", () => {
    expect(labelFromScan("https://example.test/somewhere-else")).toBeNull();
    expect(labelFromScan("https://example.test/l/not-a-label")).toBeNull();
    expect(labelFromScan("javascript:alert(1)")).toBeNull();
    expect(labelFromScan("WIFI:S:Centre;T:WPA;P:secret;;")).toBeNull();
    expect(labelFromScan("")).toBeNull();
    expect(labelFromScan(null)).toBeNull();
  });
});
