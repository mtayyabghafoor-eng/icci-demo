// Slice P2.6: the plain rules behind the sign-off screens and the grid. The
// database enforces the same rules (see tests/db/signoffs.test.ts).
import { describe, expect, it } from "vitest";
import { seedSignsOff } from "../../scripts/seed-data.mts";
import {
  arrangeGrid,
  filterSquares,
  friendlySignoffError,
  parseSignoffForm,
  readGridFilter,
  scanFrom,
  scanPath,
  signedText,
  worstFirst,
  type Square,
} from "@/lib/policies/signoffs";

const A = "0b0c3c1e-8a4f-4f0e-9a51-6f4b2a7d9e10";
const B = "1b0c3c1e-8a4f-4f0e-9a51-6f4b2a7d9e11";
const get = (v: Record<string, string>) => (n: string) => v[n] ?? "";

function sq(person: string, policy: string, status: Square["status"], extra: Partial<Square> = {}): Square {
  return {
    person_id: person,
    full_name: `Test ${person}`,
    person_role_id: "role-1",
    section_id: "section-1",
    policy_id: policy,
    title: `Policy ${policy}`,
    policy_version_id: `v-${policy}`,
    version_label: "v1",
    published_on: "2026-11-01",
    signed_on: status === "signed" ? "2026-11-05" : null,
    status,
    ...extra,
  };
}

describe("the Record sign-off form", () => {
  it("needs at least one person and a real date between approval and today", () => {
    expect(parseSignoffForm(get({ signed_on: "2026-11-10" }), [A, B, A, "junk"], "2026-11-16", "2026-11-01")).toEqual({
      ok: true,
      values: { people: [A, B], signed_on: "2026-11-10" },
    });
    expect(parseSignoffForm(get({ signed_on: "2026-11-10" }), [], "2026-11-16", "2026-11-01")).toMatchObject({ ok: false, error: /tick at least one/ });
    expect(parseSignoffForm(get({ signed_on: "2026-11-17" }), [A], "2026-11-16", "2026-11-01")).toMatchObject({ ok: false, error: /future/ });
    expect(parseSignoffForm(get({ signed_on: "2026-10-31" }), [A], "2026-11-16", "2026-11-01")).toMatchObject({ ok: false, error: /before the version/ });
    expect(parseSignoffForm(get({ signed_on: "" }), [A], "2026-11-16", "2026-11-01").ok).toBe(false);
  });
});

describe("scans", () => {
  const form = (f: File) => {
    const d = new FormData();
    d.set("scan", f);
    return d;
  };
  it("accepts a PDF or a picture up to 6 MB, and is optional", () => {
    expect(scanFrom(new FormData())).toBeNull();
    expect(scanFrom(form(new File(["x"], "s.pdf", { type: "application/pdf" })))).toMatchObject({ ext: "pdf" });
    expect(scanFrom(form(new File(["x"], "s.jpg", { type: "image/jpeg" })))).toMatchObject({ ext: "jpg" });
    expect(scanFrom(form(new File(["x"], "s.txt", { type: "text/plain" })))).toMatch(/PDF or a JPEG/);
    expect(scanFrom(form(new File([new Uint8Array(6 * 1024 * 1024 + 1)], "s.png", { type: "image/png" })))).toMatch(/too large/);
  });
  it("each scan is a new file in its version's folder", () => {
    expect(scanPath("v1", "png", "f1")).toBe("signoffs/v1/f1.png");
    expect(scanPath("v1", "pdf")).not.toBe(scanPath("v1", "pdf"));
  });
});

describe("the grid", () => {
  const squares = [
    sq("b", "p2", "signed"),
    sq("a", "p1", "unsigned"),
    sq("b", "p1", "overdue"),
    sq("c", "p2", "unsigned", { section_id: "section-2", person_role_id: "role-2" }),
  ];

  it("puts people down the side and policies across the top, both in order", () => {
    const g = arrangeGrid(squares);
    expect(g.policies.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(g.people.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(g.people[0].squares.get("p2")).toBeUndefined(); // does not apply
    expect(g.people[1].squares.get("p1")?.status).toBe("overdue");
  });

  it("filters by section and role, and by people with a status", () => {
    expect(filterSquares(squares, { section: "section-2", role: "", status: "" }).map((s) => s.person_id)).toEqual(["c"]);
    expect(filterSquares(squares, { section: "", role: "role-1", status: "" })).toHaveLength(3);
    // Person b has an overdue square, so all b's squares stay.
    expect(filterSquares(squares, { section: "", role: "", status: "overdue" }).map((s) => `${s.person_id}${s.policy_id}`).sort()).toEqual(["bp1", "bp2"]);
  });

  it("reads only known filter values from the address", () => {
    expect(readGridFilter({ section: "s1", role: "nope", status: "overdue" }, new Set(["s1"]), new Set(["r1"]))).toEqual({ section: "s1", role: "", status: "overdue" });
    expect(readGridFilter({ status: "bad" }, new Set(), new Set())).toEqual({ section: "", role: "", status: "" });
  });

  it("counts and orders squares worst first", () => {
    expect(signedText(squares)).toBe("1 of 4 signed");
    expect(worstFirst(squares).map((s) => s.status)).toEqual(["overdue", "unsigned", "unsigned", "signed"]);
  });
});

describe("plain words for refusals", () => {
  it("explains a second sign-off and passes the database's own sentences through", () => {
    expect(friendlySignoffError('duplicate key value violates unique constraint "policy_signoffs_one_live"')).toMatch(/already signed/);
    expect(friendlySignoffError("You cannot record your own sign-off. Ask another admin.")).toMatch(/your own/);
    expect(friendlySignoffError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlySignoffError("internal 42P01")).toMatch(/could not be saved/);
  });
});

describe("made-up sign-offs (seed)", () => {
  it("about two in three people have signed, so the grid shows green and amber", () => {
    const picked = Array.from({ length: 9 }, (_, i) => seedSignsOff(i));
    expect(picked.filter(Boolean)).toHaveLength(6);
  });
});
