// Round C3: security tightening (migration 0056).
//   * The Library sign-in page emails a code only to a switched-on Library
//     Operator's address: never to an admin's, a switched-off operator's or
//     an unknown one. The check answers only yes or no.
//   * A document's file must be in its own make and model's or item's
//     folder, with a name the website gives.
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, signedOutClient, testName } from "./clients";
import { newFixedAsset } from "./items-helpers";

const PDF = new TextEncoder().encode("%PDF-1.4\n% Test document (made up)\n%%EOF\n");

describe("who may be emailed a Library sign-in code", () => {
  const allowed = async (email: string) => {
    const { data, error } = await signedOutClient().rpc("library_code_allowed", { p_email: email });
    expect(error).toBeNull();
    return data;
  };

  it("the switched-on Library Operator, however the address is typed", async () => {
    const operator = seedAdmin("library_operator").email;
    expect(await allowed(operator)).toBe(true);
    expect(await allowed(`  ${operator.toUpperCase()} `)).toBe(true);
  });

  it("never an admin, a switched-off account or an unknown address", async () => {
    for (const role of ["super_admin", "centre_admin", "finance"]) expect(await allowed(seedAdmin(role).email), role).toBe(false);
    const switchedOff = SEED_ADMINS.filter((a) => !a.active);
    expect(switchedOff.length).toBeGreaterThan(0);
    for (const a of switchedOff) expect(await allowed(a.email), a.email).toBe(false);
    expect(await allowed("nobody-at-all@icci-prototype.test")).toBe(false);
    expect(await allowed("")).toBe(false);
    expect(await allowed("x".repeat(300))).toBe(false);
  });
});

describe("a document's file", () => {
  async function model() {
    const c = await asRole("centre_admin");
    const m = masterKeyClient();
    const cat = await m.from("item_categories").select("id").eq("name", "Lawnmowers").single();
    const maker = await c.from("companies").insert({ name: testName("doc maker"), kinds: ["maker"] }).select("id").single();
    if (cat.error || maker.error) throw cat.error ?? maker.error;
    const made = await c.from("product_models").insert({ maker_company_id: maker.data.id, model_name: testName("doc model"), category_id: cat.data.id }).select("id").single();
    if (made.error) throw made.error;
    return made.data.id as string;
  }
  const upload = async (path: string) => (await asRole("centre_admin")).storage.from("asset-documents").upload(path, PDF, { contentType: "application/pdf" });

  it("is only stored under a name the website gives", async () => {
    const id = await model();
    expect((await upload(`models/${id}/${crypto.randomUUID()}.pdf`)).error).toBeNull();
    for (const bad of [`models/${id}/manual.pdf`, `models/${id}/${crypto.randomUUID()}.exe`, `models/not-an-id/${crypto.randomUUID()}.pdf`, `${crypto.randomUUID()}.pdf`]) {
      expect((await upload(bad)).error, bad).not.toBeNull();
    }
  });

  it("must be in its own model's or item's folder", async () => {
    const c = await asRole("centre_admin");
    const mine = await model();
    const other = await model();
    const elsewhere = `models/${other}/${crypto.randomUUID()}.pdf`;
    expect((await upload(elsewhere)).error).toBeNull();
    const wrong = await c.from("asset_documents").insert({ model_id: mine, kind: "manual", title: "Test manual", file_path: elsewhere });
    expect(wrong.error?.message).toMatch(/folder of its own/);

    const item = await newFixedAsset("centre_admin");
    const itemPath = `items/${item.id}/${crypto.randomUUID()}.pdf`;
    expect((await upload(itemPath)).error).toBeNull();
    expect((await c.from("asset_documents").insert({ model_id: mine, kind: "manual", title: "Test", file_path: itemPath })).error?.message).toMatch(/folder of its own/);
    const right = await c.from("asset_documents").insert({ item_id: item.id, kind: "warranty", title: "Test warranty", file_path: itemPath }).select("id");
    expect(right.error).toBeNull();
    expect(right.data).toHaveLength(1);
  });
});
