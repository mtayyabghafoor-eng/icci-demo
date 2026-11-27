// Round D7 (owner, 27 Nov 2026): each policy version can hold the policy in
// Arabic as well as English, both shown as flip books. The Arabic PDF
// follows the same rules as the English one: uploaded first into this
// policy's own folder, changeable only while the version is a draft, never
// changed by publishing, and never changed once published. Only admins who
// may see policies can add it.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS } from "../../scripts/seed-data.mts";
import { addDays, addYears, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, signedOutClient, testName } from "./clients";

const BUCKET = "policy-files";
const TINY_PDF = new TextEncoder().encode("%PDF-1.4\n% Test run: made-up file\n%%EOF\n");
const secondCentreAdmin = () => asRoleByEmail("second.admin");

async function asRoleByEmail(start: string) {
  const { signedInClient } = await import("./clients");
  return signedInClient(SEED_ADMINS.find((a) => a.email.startsWith(start))!.email);
}

async function newPolicy() {
  const c = await asRole("centre_admin");
  const { data: role } = await masterKeyClient().from("person_roles").select("id").eq("name", "Volunteer").single();
  const { data: section } = await masterKeyClient().from("sections").select("id").eq("name", "Volunteers").single();
  const { data: person, error: pe } = await c
    .from("people")
    .insert({ full_name: testName("arabic policy person"), person_role_id: role!.id, section_id: section!.id })
    .select("id")
    .single();
  if (pe) throw pe;
  const { data, error } = await c.from("policies").insert({ title: testName("arabic policy"), owner_person_id: person.id }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function uploadPdf(policyId: string, client?: SupabaseClient) {
  const path = `policies/${policyId}/${crypto.randomUUID()}.pdf`;
  const { error } = await (client ?? (await asRole("centre_admin"))).storage.from(BUCKET).upload(path, TINY_PDF, { contentType: "application/pdf" });
  if (error) throw error;
  return path;
}

async function draft(policyId: string, fields: Record<string, unknown> = {}) {
  const c = await asRole("centre_admin");
  return c
    .from("policy_versions")
    .insert({
      policy_id: policyId,
      version_label: "v1",
      approved_on: addDays(todayInDublin(), -5),
      next_review_on: addYears(addDays(todayInDublin(), -5), 1),
      file_path: await uploadPdf(policyId, c),
      ...fields,
    })
    .select("id, file_path, file_path_ar, status")
    .single<{ id: string; file_path: string; file_path_ar: string | null; status: string }>();
}

describe("the Arabic PDF of a policy version", () => {
  it("is optional: a version can be English only", async () => {
    const r = await draft(await newPolicy());
    expect(r.error).toBeNull();
    expect(r.data?.file_path_ar).toBeNull();
  });

  it("can be added with the English one when the version is uploaded", async () => {
    const policy = await newPolicy();
    const ar = await uploadPdf(policy);
    const r = await draft(policy, { file_path_ar: ar });
    expect(r.error).toBeNull();
    expect(r.data?.file_path_ar).toBe(ar);
  });

  it("must be uploaded first, into this policy's own folder, and be a different file from the English", async () => {
    const policy = await newPolicy();
    const other = await newPolicy();
    expect((await draft(policy, { file_path_ar: `policies/${policy}/${crypto.randomUUID()}.pdf` })).error?.message).toMatch(/Arabic PDF could not be found/i);
    expect((await draft(policy, { file_path_ar: await uploadPdf(other) })).error?.message).toMatch(/different policy/i);
    expect((await draft(policy, { file_path_ar: "elsewhere/file.pdf" })).error).not.toBeNull();
    const same = await uploadPdf(policy);
    expect((await draft(policy, { file_path: same, file_path_ar: same })).error?.message).toMatch(/two different files/i);
  });

  it("can be added to a draft later", async () => {
    const policy = await newPolicy();
    const v = (await draft(policy)).data!;
    const c = await asRole("super_admin");
    const ar = await uploadPdf(policy, c);
    const { data, error } = await c.from("policy_versions").update({ file_path_ar: ar }).eq("id", v.id).select("file_path_ar").single();
    expect(error).toBeNull();
    expect(data?.file_path_ar).toBe(ar);
  });

  it("publishing cannot slip in an Arabic PDF, and a published version's Arabic PDF never changes", async () => {
    const policy = await newPolicy();
    const v = (await draft(policy)).data!;
    const second = await secondCentreAdmin();
    const sneaky = await second.from("policy_versions").update({ status: "published", file_path_ar: await uploadPdf(policy) }).eq("id", v.id);
    expect(sneaky.error?.message).toMatch(/cannot change the version/i);
    expect((await second.from("policy_versions").update({ status: "published" }).eq("id", v.id)).error).toBeNull();
    const later = await (await asRole("super_admin")).from("policy_versions").update({ file_path_ar: await uploadPdf(policy) }).eq("id", v.id);
    expect(later.error?.message).toMatch(/never be changed/i);
    const master = await masterKeyClient().from("policy_versions").update({ file_path_ar: null }).eq("id", v.id);
    expect(master.error?.message).toMatch(/never be changed/i);
  });

  it("nobody outside the policy admins can add one", async () => {
    const policy = await newPolicy();
    const v = (await draft(policy)).data!;
    for (const c of [signedOutClient(), await asRole("finance"), await asRole("library_operator")]) {
      const { data } = await c.from("policy_versions").update({ file_path_ar: `policies/${policy}/${crypto.randomUUID()}.pdf` }).eq("id", v.id).select("id");
      expect(data ?? []).toHaveLength(0);
    }
    const { data } = await masterKeyClient().from("policy_versions").select("file_path_ar").eq("id", v.id).single();
    expect(data?.file_path_ar).toBeNull();
  });
});
