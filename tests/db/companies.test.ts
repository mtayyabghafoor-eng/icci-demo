// Slices P1.19 to P1.21: companies, makes and models, the new item and
// category fields, documents, and "passed to a company" on a ticket. Only
// Super Admins and Centre Admins see or change any of it; nothing is ever
// deleted; nothing switched off is newly picked.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName } from "./clients";
import { consumableFields, idOf, newFixedAsset } from "./items-helpers";

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a password-only sign-in", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const PDF = new TextEncoder().encode("%PDF-1.4\n% Test: made-up placeholder\n%%EOF\n");

async function newCompany(extra: Record<string, unknown> = {}) {
  const { data, error } = await (await asRole("centre_admin")).from("companies").insert({ name: testName("company"), kinds: ["service"], ...extra }).select().single();
  if (error) throw error;
  return data as { id: string; name: string };
}

async function newModel(extra: Record<string, unknown> = {}) {
  const maker = await newCompany({ kinds: ["maker"] });
  const { data, error } = await (await asRole("centre_admin"))
    .from("product_models")
    .insert({ maker_company_id: maker.id, model_name: testName("model"), category_id: await idOf("item_categories", "Lawnmowers"), ...extra })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string };
}

async function uploadPdf(folder: string) {
  const path = `${folder}/${crypto.randomUUID()}.pdf`;
  const { error } = await (await asRole("centre_admin")).storage.from("asset-documents").upload(path, PDF, { contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

describe("who can see and change companies, models and documents", () => {
  for (const who of noAccess) {
    it(`${who.label} sees none and adds none`, async () => {
      const c = await who.client();
      for (const table of ["companies", "product_models", "asset_documents"]) {
        expect((await c.from(table).select("*").limit(3)).data ?? [], table).toHaveLength(0);
      }
      expect((await c.from("companies").insert({ name: testName("sneaky") })).error).not.toBeNull();
      expect((await c.storage.from("asset-documents").upload(`sneaky/${crypto.randomUUID()}.pdf`, PDF, { contentType: "application/pdf" })).error).not.toBeNull();
    });
  }

  it("the seed has made-up companies, models with a sample manual, and category contacts", async () => {
    const c = await asRole("centre_admin");
    const { data: companies } = await c.from("companies").select("name, email");
    expect(companies!.length).toBeGreaterThanOrEqual(5);
    for (const x of companies!.filter((y) => !y.name.startsWith("Test run"))) expect(x.email ?? "").toMatch(/\.example$/);
    const { data: docs } = await c.from("asset_documents").select("kind").eq("kind", "manual");
    expect(docs!.length).toBeGreaterThanOrEqual(1);
    const { data: garden } = await c.from("item_categories").select("contact_person_id, service_company_id").eq("name", "Garden, tools and cleaning equipment").single();
    expect(garden!.contact_person_id).not.toBeNull();
    expect(garden!.service_company_id).not.toBeNull();
  });

  it("nobody deletes a company or a document, not even with the master key", async () => {
    const co = await newCompany();
    expect((await masterKeyClient().from("companies").delete().eq("id", co.id)).error).not.toBeNull();
  });
});

describe("companies and makes and models", () => {
  it("company names are unique, and phone numbers are checked", async () => {
    const c = await asRole("centre_admin");
    const co = await newCompany();
    expect((await c.from("companies").insert({ name: ` ${co.name.toUpperCase()} ` })).error).not.toBeNull();
    expect((await c.from("companies").insert({ name: testName("bad phone"), phone: "call me" })).error).not.toBeNull();
    expect((await c.from("companies").insert({ name: testName("bad kind"), kinds: ["plumber"] })).error).not.toBeNull();
  });

  it("a model belongs to a sub-category, and its maker must be switched on", async () => {
    const c = await asRole("centre_admin");
    const maker = await newCompany({ kinds: ["maker"] });
    const main = await c.from("product_models").insert({ maker_company_id: maker.id, model_name: testName("m"), category_id: await idOf("item_categories", "Vehicles") });
    expect(main.error?.message).toMatch(/sub-category/);
    await c.from("companies").update({ active: false }).eq("id", maker.id);
    const off = await c.from("product_models").insert({ maker_company_id: maker.id, model_name: testName("m"), category_id: await idOf("item_categories", "Lawnmowers") });
    expect(off.error?.message).toMatch(/switched off/);
  });

  it("an item takes a model, a maker's serial number, a supplier and a service company", async () => {
    const model = await newModel();
    const supplier = await newCompany({ kinds: ["supplier"] });
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const { data, error } = await c
      .from("items")
      .update({ model_id: model.id, maker_serial: "TEST-SN-1", supplier_company_id: supplier.id, service_company_id: supplier.id })
      .eq("id", item.id)
      .select("model_id, maker_serial")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ model_id: model.id, maker_serial: "TEST-SN-1" });
  });

  it("a switched-off company is not newly picked, but items that already have it keep it", async () => {
    const co = await newCompany();
    const item = await newFixedAsset("centre_admin", { service_company_id: co.id });
    const c = await asRole("centre_admin");
    await c.from("companies").update({ active: false }).eq("id", co.id);
    const other = await newFixedAsset();
    expect((await c.from("items").update({ service_company_id: co.id }).eq("id", other.id)).error?.message).toMatch(/switched off/);
    expect((await c.from("items").update({ name: testName("still has it") }).eq("id", item.id)).error).toBeNull();
  });

  it("a consumable has no model, serial number or service company, only a supplier", async () => {
    const c = await asRole("centre_admin");
    const model = await newModel();
    const supplier = await newCompany({ kinds: ["supplier"] });
    expect((await c.from("items").insert(await consumableFields({ model_id: model.id }))).error).not.toBeNull();
    expect((await c.from("items").insert(await consumableFields({ supplier_company_id: supplier.id }))).error).toBeNull();
  });

  it("a category takes a usual service company and a switched-on contact person", async () => {
    const c = await asRole("centre_admin");
    const co = await newCompany();
    const main = await c.from("item_categories").insert({ name: testName("contact main") }).select("id").single();
    const { data: off } = await masterKeyClient().from("people").select("id").eq("active", false).limit(1).single();
    expect((await c.from("item_categories").update({ contact_person_id: off!.id }).eq("id", main.data!.id)).error?.message).toMatch(/switched off/);
    const { data: on } = await masterKeyClient().from("people").select("id").eq("active", true).limit(1).single();
    const ok = await c.from("item_categories").update({ contact_person_id: on!.id, service_company_id: co.id }).eq("id", main.data!.id);
    expect(ok.error).toBeNull();
  });
});

describe("documents", () => {
  it("a document needs its file in the store, belongs to a model or an item, and never changes except to be hidden", async () => {
    const model = await newModel();
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const missing = await c.from("asset_documents").insert({ model_id: model.id, kind: "manual", title: "Test manual", file_path: `models/${model.id}/nothing.pdf` });
    expect(missing.error?.message).toMatch(/not found/);
    const both = await c.from("asset_documents").insert({ model_id: model.id, item_id: item.id, kind: "manual", title: "Test", file_path: await uploadPdf(`models/${model.id}`) });
    expect(both.error).not.toBeNull();
    const added = await c.from("asset_documents").insert({ model_id: model.id, kind: "manual", title: "Test manual", file_path: await uploadPdf(`models/${model.id}`) }).select("id").single();
    expect(added.error).toBeNull();
    const renamed = await c.from("asset_documents").update({ title: "Changed" }).eq("id", added.data!.id);
    expect(renamed.error?.message).toMatch(/never changes/);
    const noReason = await c.from("asset_documents").update({ hidden: true }).eq("id", added.data!.id);
    expect(noReason.error).not.toBeNull();
    const hidden = await c.from("asset_documents").update({ hidden: true, hidden_reason: "Test: wrong model" }).eq("id", added.data!.id);
    expect(hidden.error).toBeNull();
    const again = await c.from("asset_documents").update({ hidden: true, hidden_reason: "again" }).eq("id", added.data!.id);
    expect(again.error?.message).toMatch(/already hidden/);
    expect((await masterKeyClient().from("asset_documents").delete().eq("id", added.data!.id)).error).not.toBeNull();
  });

  it("a stored file cannot be replaced or deleted", async () => {
    // Round C3: a folder named like a real item (the store takes no other names).
    const path = await uploadPdf(`items/${crypto.randomUUID()}`);
    const c = await asRole("centre_admin");
    expect((await c.storage.from("asset-documents").upload(path, PDF, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    await c.storage.from("asset-documents").remove([path]);
    const { data } = await c.storage.from("asset-documents").createSignedUrl(path, 60);
    expect(data?.signedUrl).toBeTruthy();
  });
});

describe("passed to a company", () => {
  async function newTicket() {
    const item = await newFixedAsset();
    const c = await asRole("centre_admin");
    const { data, error } = await c.from("maintenance_tickets").insert({ item_id: item.id, description: "Test: broken (made up)", reported_by: "Test volunteer" }).select("id").single();
    if (error) throw error;
    return data.id as number;
  }

  it("records the company and their job number, and changes nothing else on the ticket", async () => {
    const ticket = await newTicket();
    const co = await newCompany();
    const c = await asRole("centre_admin");
    const ev = await c.from("maintenance_ticket_events").insert({ ticket_id: ticket, kind: "referred", company_id: co.id, company_job_ref: " JOB-1 " }).select("company_job_ref").single();
    expect(ev.error).toBeNull();
    expect(ev.data!.company_job_ref).toBe("JOB-1");
    const { data: t } = await c.from("maintenance_tickets").select("status, assigned_person_id").eq("id", ticket).single();
    expect(t).toEqual({ status: "open", assigned_person_id: null });
  });

  it("needs a switched-on company, only on that kind of entry, and not on a closed ticket", async () => {
    const ticket = await newTicket();
    const co = await newCompany();
    const c = await asRole("centre_admin");
    expect((await c.from("maintenance_ticket_events").insert({ ticket_id: ticket, kind: "referred" })).error?.message).toMatch(/which company/);
    expect((await c.from("maintenance_ticket_events").insert({ ticket_id: ticket, kind: "note", note: "Test", company_id: co.id })).error?.message).toMatch(/names a company/);
    await c.rpc("close_maintenance_ticket", { p_ticket_id: ticket, p_note: "Test: fixed" });
    expect((await c.from("maintenance_ticket_events").insert({ ticket_id: ticket, kind: "referred", company_id: co.id })).error?.message).toMatch(/closed/);
  });

  it("the seed has one ticket passed to a made-up company with a job number", async () => {
    const c = await asRole("centre_admin");
    const { data } = await c.from("maintenance_ticket_events").select("company_job_ref").eq("kind", "referred").eq("company_job_ref", "DEMO-123");
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});
