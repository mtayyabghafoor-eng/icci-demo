// Slice P2.5: the plain rules behind the policy screens, and the made-up
// sample policies in the seed. The database enforces the same rules (see
// tests/db/policies.test.ts).
import { describe, expect, it } from "vitest";
import { SEED_PEOPLE, SEED_POLICIES, samplePolicyPdf } from "../../scripts/seed-data.mts";
import {
  friendlyPolicyError,
  mayPublish,
  parsePolicyForm,
  parseVersionForm,
  pdfFrom,
  pickedRoles,
  policyFilePath,
  suggestedReview,
  versionStatus,
  worstFirst,
  type PolicyRow,
} from "@/lib/policies/rules";

const getter = (values: Record<string, string>) => (name: string) => values[name] ?? "";
const TODAY = "2026-11-16";
const OWNER = "0b0c3c1e-8a4f-4f0e-9a51-6f4b2a7d9e10";

describe("the policy form", () => {
  it("tidies the title and needs an owner", () => {
    expect(parsePolicyForm(getter({ title: "  Health   and safety ", owner_person_id: OWNER }))).toEqual({
      ok: true,
      values: { title: "Health and safety", owner_person_id: OWNER },
    });
    expect(parsePolicyForm(getter({ title: "", owner_person_id: OWNER })).ok).toBe(false);
    expect(parsePolicyForm(getter({ title: "x".repeat(151), owner_person_id: OWNER })).ok).toBe(false);
    expect(parsePolicyForm(getter({ title: "Fine", owner_person_id: "nobody" }))).toEqual({ ok: false, error: "Please pick the policy's owner." });
  });

  it("keeps only known roles, once each", () => {
    expect(pickedRoles(["a", "b", "a", "zzz"], new Set(["a", "b", "c"]))).toEqual(["a", "b"]);
  });
});

describe("the version form", () => {
  const ok = { version_label: " v2 ", approved_on: "2026-11-01", next_review_on: "2027-11-01" };

  it("accepts a name, an approval date and a later review date", () => {
    expect(parseVersionForm(getter(ok), TODAY)).toEqual({ ok: true, values: { ...ok, version_label: "v2" } });
  });

  it("refuses a future approval, a review not after approval, or more than 5 years", () => {
    expect(parseVersionForm(getter({ ...ok, approved_on: "2026-11-17" }), TODAY)).toMatchObject({ ok: false, error: /future/ });
    expect(parseVersionForm(getter({ ...ok, next_review_on: "2026-11-01" }), TODAY)).toMatchObject({ ok: false, error: /after the approval/ });
    expect(parseVersionForm(getter({ ...ok, next_review_on: "2031-11-02" }), TODAY)).toMatchObject({ ok: false, error: /5 years/ });
    expect(parseVersionForm(getter({ ...ok, next_review_on: "2031-11-01" }), TODAY).ok).toBe(true);
    expect(parseVersionForm(getter({ ...ok, version_label: "" }), TODAY).ok).toBe(false);
    expect(parseVersionForm(getter({ ...ok, approved_on: "2026-02-30" }), TODAY).ok).toBe(false);
  });

  it("suggests a review one year after approval", () => {
    expect(suggestedReview("2026-03-15")).toBe("2027-03-15");
    expect(suggestedReview("")).toBe("");
  });
});

describe("PDF checks", () => {
  const form = (file: File) => {
    const f = new FormData();
    f.set("pdf", file);
    return f;
  };

  it("accepts a real PDF and nothing else", async () => {
    const pdf = new File([samplePolicyPdf("Test", "v1") as BlobPart], "a.pdf", { type: "application/pdf" });
    expect(await pdfFrom(form(pdf))).toBeInstanceOf(File);
    const fake = new File(["hello"], "a.pdf", { type: "application/pdf" });
    expect(await pdfFrom(form(fake))).toBe("The file must be a PDF.");
    const picture = new File(["%PDF-"], "a.png", { type: "image/png" });
    expect(await pdfFrom(form(picture))).toBe("The file must be a PDF.");
    expect(await pdfFrom(new FormData())).toBeNull();
  });

  it("refuses a PDF over 10 MB", async () => {
    const big = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.pdf", { type: "application/pdf" });
    expect(await pdfFrom(form(big))).toMatch(/too large/);
  });

  it("each new PDF gets a new file in its policy's folder", () => {
    expect(policyFilePath(OWNER, "11111111-2222-4333-8444-555555555555")).toBe(`policies/${OWNER}/11111111-2222-4333-8444-555555555555.pdf`);
    expect(policyFilePath(OWNER)).not.toBe(policyFilePath(OWNER));
  });
});

describe("who may publish", () => {
  it("never the admin who uploaded or last changed the draft", () => {
    expect(mayPublish({ status: "draft", created_by: "a", updated_by: "a" }, "b")).toBe(true);
    expect(mayPublish({ status: "draft", created_by: "a", updated_by: "a" }, "a")).toBe(false);
    expect(mayPublish({ status: "draft", created_by: "a", updated_by: "b" }, "b")).toBe(false);
    expect(mayPublish({ status: "published", created_by: "a", updated_by: "a" }, "b")).toBe(false);
  });
});

describe("words and order", () => {
  it("names versions: current, draft, or replaced", () => {
    expect(versionStatus({ id: "1", status: "published" }, "1").word).toBe("Current");
    expect(versionStatus({ id: "2", status: "published" }, "1").word).toBe("Replaced");
    expect(versionStatus({ id: "3", status: "draft" }, "1").word).toBe("Draft");
  });

  it("lists policies worst first", () => {
    const row = (title: string, review_status: PolicyRow["review_status"], next_review_on: string | null) => ({ title, review_status, next_review_on });
    const sorted = worstFirst([row("D", "ok", "2027-06-01"), row("C", "none", null), row("B", "due", "2026-12-01"), row("A", "overdue", "2026-10-01")]);
    expect(sorted.map((r) => r.title)).toEqual(["A", "B", "C", "D"]);
  });

  it("turns database refusals into plain words", () => {
    expect(friendlyPolicyError('duplicate key value violates unique constraint "policy_versions_one_draft"')).toMatch(/already has a draft/);
    expect(friendlyPolicyError('duplicate key value violates unique constraint "policies_unique_title"')).toMatch(/already a policy/);
    expect(friendlyPolicyError("new row violates row-level security policy")).toBe("Your account is not allowed to do this.");
    expect(friendlyPolicyError("A different admin must publish this version.")).toBe("A different admin must publish this version.");
    expect(friendlyPolicyError("some internal detail 42P01")).toMatch(/could not be saved/);
  });
});

describe("the made-up sample policies (seed)", () => {
  it("are obviously fictional, with switched-on owners and known roles", () => {
    const roles = new Set(["Imam", "Staff", "Security", "Cleaner", "Caretaker", "Gardener", "Reception", "Volunteer", "Board member", "Contractor"]);
    for (const p of SEED_POLICIES) {
      expect(p.title).toMatch(/^Test policy: /);
      expect(SEED_PEOPLE.find((x) => x.full_name === p.owner)?.active, p.owner).toBe(true);
      for (const r of p.roles) expect(roles.has(r), r).toBe(true);
    }
  });

  it("have dates the database accepts, and one draft at most each", () => {
    for (const p of SEED_POLICIES) {
      expect(p.versions.filter((v) => !v.publish).length, p.title).toBeLessThanOrEqual(1);
      for (const v of p.versions) {
        expect(v.ago).toBeGreaterThanOrEqual(0);
        expect(v.reviewIn, `${p.title} ${v.label}: still in date when published`).toBeGreaterThan(0);
        expect(v.ago + v.reviewIn).toBeLessThanOrEqual(5 * 365);
      }
    }
  });

  it("show a replaced version, a review due soon, a draft for the other admin, and a policy with only a draft", () => {
    expect(SEED_POLICIES.some((p) => p.versions.filter((v) => v.publish).length > 1)).toBe(true);
    expect(SEED_POLICIES.some((p) => p.versions.some((v) => v.publish && v.reviewIn <= 60))).toBe(true);
    expect(SEED_POLICIES.some((p) => p.versions.some((v) => !v.publish && v.uploader === "second"))).toBe(true);
    expect(SEED_POLICIES.some((p) => p.versions.every((v) => !v.publish))).toBe(true);
  });

  it("each placeholder PDF is a real PDF that says it is a sample", () => {
    const text = new TextDecoder().decode(samplePolicyPdf("Test policy: Data protection", "v2"));
    expect(text.startsWith("%PDF-")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain("SAMPLE - fictional document for testing only.");
    // The cross-reference table points at each object exactly.
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
  });
});
