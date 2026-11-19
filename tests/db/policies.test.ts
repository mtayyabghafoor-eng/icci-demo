// Phase 2, slice P2.5: policies and versions (PLAN.md 5.2; docs/PHASE-2-AND-3.md 4.1).
// Owner's choices, 16 Nov 2026 (both recommended):
//   * A different admin must publish a version: nobody publishes a version
//     they uploaded or last changed.
//   * The next review date is required (the screen suggests one year).
// And from the plan: a policy has a title, an owner from the directory and
// the person roles that must sign it. A version starts as a draft (can be
// changed), is published in one step, and can then never be changed. The
// newest published version is the current one. PDFs are add-and-view only.
// Super Admin and Centre Admin only. Nothing is ever deleted.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { addDays, addYears, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";

const BUCKET = "policy-files";
const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
const today = () => todayInDublin();
const TINY_PDF = new TextEncoder().encode("%PDF-1.4\n% Test run: made-up file\n%%EOF\n");

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

async function listId(table: "person_roles" | "sections", name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function newPerson(role = "Volunteer", active = true) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("people")
    .insert({
      full_name: testName("policy person"),
      person_role_id: await listId("person_roles", role),
      section_id: await listId("sections", "Volunteers"),
      active,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function newPolicy(role = "centre_admin") {
  const { data, error } = await (await asRole(role))
    .from("policies")
    .insert({ title: testName("policy"), owner_person_id: await newPerson() })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** Uploads a made-up PDF into the policy's folder; returns its path. */
async function uploadPdf(policyId: string, client?: SupabaseClient) {
  const path = `policies/${policyId}/${crypto.randomUUID()}.pdf`;
  const c = client ?? (await asRole("centre_admin"));
  const { error } = await c.storage.from(BUCKET).upload(path, TINY_PDF, { contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

type Version = {
  id: string;
  policy_id: string;
  version_label: string;
  file_path: string;
  approved_on: string;
  next_review_on: string;
  status: string;
  published_by: string | null;
  published_at: string | null;
  created_by: string;
};

async function draft(client: SupabaseClient, policyId: string, fields: Record<string, unknown> = {}) {
  const file_path = fields.file_path ?? (await uploadPdf(policyId, client));
  return client
    .from("policy_versions")
    .insert({
      policy_id: policyId,
      version_label: "v1",
      approved_on: addDays(today(), -5),
      next_review_on: addYears(addDays(today(), -5), 1),
      ...fields,
      file_path,
    })
    .select()
    .single<Version>();
}
async function mustDraft(policyId: string, fields: Record<string, unknown> = {}, role = "centre_admin") {
  const { data, error } = await draft(await asRole(role), policyId, fields);
  if (error) throw error;
  return data!;
}
function publish(client: SupabaseClient, versionId: string) {
  return client.from("policy_versions").update({ status: "published" }).eq("id", versionId).select().single<Version>();
}
async function mustPublish(versionId: string) {
  const { data, error } = await publish(await secondCentreAdmin(), versionId);
  if (error) throw error;
  return data!;
}

type Overview = {
  id: string;
  current_version_id: string | null;
  current_label: string | null;
  next_review_on: string | null;
  has_draft: boolean;
  review_status: string;
  must_sign: number;
};
async function overviewOf(policyId: string): Promise<Overview> {
  const { data, error } = await (await asRole("centre_admin")).from("policies_overview").select("*").eq("id", policyId).single();
  if (error) throw error;
  return data as Overview;
}

// ---------------------------------------------------------------------------
describe("who can see and change policies", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add or change policies, roles, versions or the overview`, async () => {
      const policy = await newPolicy();
      const v = await mustDraft(policy);
      const c = await who.client();
      for (const table of ["policies", "policy_required_roles", "policy_versions", "policies_overview"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
      const add = await c.from("policies").insert({ title: testName("not allowed"), owner_person_id: await newPerson() }).select();
      expect(add.data ?? []).toHaveLength(0);
      const role = await c.from("policy_required_roles").insert({ policy_id: policy, person_role_id: await listId("person_roles", "Imam") }).select();
      expect(role.data ?? []).toHaveLength(0);
      const change = await c.from("policies").update({ title: testName("changed") }).eq("id", policy).select();
      expect(change.data ?? []).toHaveLength(0);
      const pub = await c.from("policy_versions").update({ status: "published" }).eq("id", v.id).select();
      expect(pub.data ?? []).toHaveLength(0);
      expect((await masterKeyClient().from("policy_versions").select("status").eq("id", v.id).single()).data?.status).toBe("draft");
    });

    it(`${who.label} cannot add or open policy PDFs`, async () => {
      const policy = await newPolicy();
      const path = await uploadPdf(policy);
      const c = await who.client();
      const up = await c.storage.from(BUCKET).upload(`policies/${policy}/${crypto.randomUUID()}.pdf`, TINY_PDF, { contentType: "application/pdf" });
      expect(up.error).not.toBeNull();
      const down = await c.storage.from(BUCKET).download(path);
      expect(down.error).not.toBeNull();
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add a policy, choose who must sign, and upload a draft`, async () => {
      const c = await asRole(role);
      const { data: policy, error } = await c
        .from("policies")
        .insert({ title: `  ${testName("policy")}   by ${role} `, owner_person_id: await newPerson() })
        .select()
        .single();
      expect(error).toBeNull();
      expect(policy.title).not.toMatch(/^\s|\s$|\s{2}/);
      expect(policy.created_by).toBe(userIdOf(seedAdmin(role).email));
      const req = await c.from("policy_required_roles").insert({ policy_id: policy.id, person_role_id: await listId("person_roles", "Imam") }).select();
      expect(req.error).toBeNull();
      const v = await draft(c, policy.id);
      expect(v.error).toBeNull();
      expect(v.data?.status).toBe("draft");
      expect((await c.storage.from(BUCKET).download(v.data!.file_path)).error).toBeNull();
    });
  }
});

describe("policy rules", () => {
  it("titles are unique, ignoring capitals and spaces", async () => {
    const c = await asRole("centre_admin");
    const title = testName("same title");
    const owner = await newPerson();
    expect((await c.from("policies").insert({ title, owner_person_id: owner })).error).toBeNull();
    const again = await c.from("policies").insert({ title: ` ${title.toUpperCase()} `, owner_person_id: owner });
    expect(again.error).not.toBeNull();
  });

  it("the owner must be a switched-on person", async () => {
    const c = await asRole("centre_admin");
    const off = await newPerson("Volunteer", false);
    const r = await c.from("policies").insert({ title: testName("owner off"), owner_person_id: off });
    expect(r.error?.message).toMatch(/owner is switched off/i);
    const policy = await newPolicy();
    const change = await c.from("policies").update({ owner_person_id: off }).eq("id", policy);
    expect(change.error?.message).toMatch(/owner is switched off/i);
  });

  it("a policy is switched off, never deleted, even with the master key", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    expect((await c.from("policies").update({ active: false }).eq("id", policy)).error).toBeNull();
    await c.from("policies").delete().eq("id", policy);
    await masterKeyClient().from("policies").delete().eq("id", policy);
    expect((await masterKeyClient().from("policies").select("active").eq("id", policy).single()).data?.active).toBe(false);
  });

  it("a required role is added once and then only switched on or off", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    const imam = await listId("person_roles", "Imam");
    const { data: req, error } = await c.from("policy_required_roles").insert({ policy_id: policy, person_role_id: imam }).select().single();
    expect(error).toBeNull();
    expect((await c.from("policy_required_roles").insert({ policy_id: policy, person_role_id: imam })).error).not.toBeNull();
    expect((await c.from("policy_required_roles").update({ person_role_id: await listId("person_roles", "Staff") }).eq("id", req.id)).error?.message).toMatch(
      /only be switched on or off/i,
    );
    expect((await c.from("policy_required_roles").update({ active: false }).eq("id", req.id)).error).toBeNull();
    await masterKeyClient().from("policy_required_roles").delete().eq("id", req.id);
    expect((await masterKeyClient().from("policy_required_roles").select("active").eq("id", req.id).single()).data?.active).toBe(false);
  });
});

describe("drafts", () => {
  it("cannot start as published", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    const r = await draft(c, policy, { status: "published" });
    expect(r.error?.message).toMatch(/starts as a draft/i);
  });

  it("the approval date cannot be in the future", async () => {
    const policy = await newPolicy();
    const r = await draft(await asRole("centre_admin"), policy, { approved_on: addDays(today(), 1), next_review_on: addYears(today(), 1) });
    expect(r.error?.message).toMatch(/approval date cannot be in the future/i);
  });

  it("the next review date must be after approval, and at most 5 years after", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    const approved_on = addDays(today(), -5);
    expect((await draft(c, policy, { approved_on, next_review_on: approved_on })).error).not.toBeNull();
    expect((await draft(c, policy, { approved_on, next_review_on: addDays(addYears(approved_on, 5), 1) })).error?.message).toMatch(/more than 5 years/i);
    expect((await draft(c, policy, { approved_on, next_review_on: addYears(approved_on, 5) })).error).toBeNull();
  });

  it("the PDF must be uploaded first, into this policy's folder", async () => {
    const policy = await newPolicy();
    const other = await newPolicy();
    const c = await asRole("centre_admin");
    const missing = await draft(c, policy, { file_path: `policies/${policy}/${crypto.randomUUID()}.pdf` });
    expect(missing.error?.message).toMatch(/could not be found/i);
    const elsewhere = await draft(c, policy, { file_path: await uploadPdf(other) });
    expect(elsewhere.error?.message).toMatch(/different policy/i);
  });

  it("one draft at a time per policy, and labels are unique per policy", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    const v1 = await mustDraft(policy, { version_label: "v1" });
    expect((await draft(c, policy, { version_label: "v2" })).error).not.toBeNull();
    await mustPublish(v1.id);
    expect((await draft(c, policy, { version_label: " V1 " })).error).not.toBeNull();
    expect((await draft(c, policy, { version_label: "v2" })).error).toBeNull();
  });

  it("a draft can be changed, including a new PDF", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    const c = await asRole("super_admin");
    const file_path = await uploadPdf(policy, c);
    const { data, error } = await c.from("policy_versions").update({ version_label: "v1.1", file_path }).eq("id", v.id).select().single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ version_label: "v1.1", file_path, status: "draft" });
  });

  it("no new or changed drafts on a switched-off policy", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    const c = await asRole("centre_admin");
    await c.from("policies").update({ active: false }).eq("id", policy);
    expect((await c.from("policy_versions").update({ version_label: "v9" }).eq("id", v.id)).error?.message).toMatch(/switched off/i);
  });
});

describe("publishing", () => {
  it("the admin who uploaded a version cannot publish it", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    const r = await publish(await asRole("centre_admin"), v.id);
    expect(r.error?.message).toMatch(/different admin must publish/i);
  });

  it("the admin who last changed a draft cannot publish it either", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    const sup = await asRole("super_admin");
    expect((await sup.from("policy_versions").update({ version_label: "v1b" }).eq("id", v.id)).error).toBeNull();
    expect((await publish(sup, v.id)).error?.message).toMatch(/different admin must publish/i);
    expect((await publish(await asRole("centre_admin"), v.id)).error?.message).toMatch(/different admin must publish/i);
    expect((await publish(await secondCentreAdmin(), v.id)).error).toBeNull();
  });

  it("another admin publishes it; who and when are filled in by the database", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    const p = await mustPublish(v.id);
    expect(p.status).toBe("published");
    expect(p.published_by).toBe(userIdOf(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email));
    expect(p.published_at).not.toBeNull();
  });

  it("the master key cannot publish (it must be a signed-in admin)", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    expect((await publish(masterKeyClient(), v.id)).error?.message).toMatch(/signed-in admin/i);
  });

  it("publishing cannot change anything else at the same time", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    const r = await (await secondCentreAdmin()).from("policy_versions").update({ status: "published", version_label: "sneaky" }).eq("id", v.id);
    expect(r.error?.message).toMatch(/cannot change the version/i);
  });

  it("a version whose review date has passed cannot be published", async () => {
    const policy = await newPolicy();
    const approved_on = addYears(today(), -2);
    const v = await mustDraft(policy, { approved_on, next_review_on: addDays(today(), -1) });
    expect((await publish(await secondCentreAdmin(), v.id)).error?.message).toMatch(/already passed/i);
  });

  it("a switched-off policy cannot be published", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    await (await asRole("super_admin")).from("policies").update({ active: false }).eq("id", policy);
    expect((await publish(await secondCentreAdmin(), v.id)).error?.message).toMatch(/switched off/i);
  });

  it("a published version can never be changed, unpublished or deleted, even with the master key", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    await mustPublish(v.id);
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      expect((await c.from("policy_versions").update({ version_label: "changed" }).eq("id", v.id)).error?.message).toMatch(/never be changed/i);
      expect((await c.from("policy_versions").update({ status: "draft", published_by: null, published_at: null }).eq("id", v.id)).error).not.toBeNull();
      await c.from("policy_versions").delete().eq("id", v.id);
    }
    const { data } = await masterKeyClient().from("policy_versions").select("version_label, status").eq("id", v.id).single();
    expect(data).toEqual({ version_label: "v1", status: "published" });
  });
});

describe("the current version and the overview", () => {
  it("a policy with only a draft has no current version", async () => {
    const policy = await newPolicy();
    await mustDraft(policy);
    const o = await overviewOf(policy);
    expect(o).toMatchObject({ current_version_id: null, has_draft: true, review_status: "none" });
  });

  it("the newest published version is current; a later draft does not count", async () => {
    const policy = await newPolicy();
    const v1 = await mustDraft(policy, { version_label: "v1" });
    await mustPublish(v1.id);
    const v2 = await mustDraft(policy, { version_label: "v2" });
    await mustPublish(v2.id);
    await mustDraft(policy, { version_label: "v3" });
    const o = await overviewOf(policy);
    expect(o).toMatchObject({ current_version_id: v2.id, current_label: "v2", has_draft: true });
  });

  it("review status: overdue, due within 60 days, or up to date", async () => {
    const cases: [number, string][] = [
      [400, "ok"],
      [61, "ok"],
      [60, "due"],
      [1, "due"],
    ];
    for (const [left, status] of cases) {
      const policy = await newPolicy();
      const v = await mustDraft(policy, { approved_on: addYears(today(), -1), next_review_on: addDays(today(), left) });
      await mustPublish(v.id);
      expect((await overviewOf(policy)).review_status, `${left} days left`).toBe(status);
    }
    // "Overdue" (the review date has passed) cannot be set up here: a
    // version cannot be published once its date has passed, and a published
    // version never changes. It happens only as time passes; the view uses
    // the same date sum as "due".
  });

  it("must_sign counts switched-on people whose role must sign", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    const board = await listId("person_roles", "Board member");
    const before = async () =>
      (await masterKeyClient().from("people").select("id", { count: "exact", head: true }).eq("person_role_id", board).eq("active", true)).count ?? 0;
    expect((await overviewOf(policy)).must_sign).toBe(0);
    const { data: req } = await c.from("policy_required_roles").insert({ policy_id: policy, person_role_id: board }).select().single();
    await newPerson("Board member");
    await newPerson("Board member", false);
    expect((await overviewOf(policy)).must_sign).toBe(await before());
    await c.from("policy_required_roles").update({ active: false }).eq("id", req!.id);
    expect((await overviewOf(policy)).must_sign).toBe(0);
  });
});

describe("the PDF store", () => {
  it("only PDFs are accepted", async () => {
    const policy = await newPolicy();
    const c = await asRole("centre_admin");
    const up = await c.storage
      .from(BUCKET)
      .upload(`policies/${policy}/${crypto.randomUUID()}.pdf`, new TextEncoder().encode("not a pdf"), { contentType: "text/plain" });
    expect(up.error).not.toBeNull();
  });

  it("a PDF cannot be replaced or deleted by an admin", async () => {
    const policy = await newPolicy();
    const c = await asRole("super_admin");
    const path = await uploadPdf(policy, c);
    const replaced = await c.storage.from(BUCKET).upload(path, TINY_PDF, { contentType: "application/pdf", upsert: true });
    expect(replaced.error).not.toBeNull();
    await c.storage.from(BUCKET).remove([path]);
    expect((await masterKeyClient().storage.from(BUCKET).download(path)).error).toBeNull();
  });
});

describe("the audit log", () => {
  it("records adding a policy and publishing a version", async () => {
    const policy = await newPolicy();
    const v = await mustDraft(policy);
    await mustPublish(v.id);
    const db = masterKeyClient();
    const { data: p } = await db.from("audit_log").select("action").eq("table_name", "policies").eq("record_id", policy);
    expect(p?.map((r) => r.action)).toContain("insert");
    const { data: pv } = await db.from("audit_log").select("action").eq("table_name", "policy_versions").eq("record_id", v.id);
    expect(pv?.map((r) => r.action)).toEqual(expect.arrayContaining(["insert", "update"]));
  });
});
