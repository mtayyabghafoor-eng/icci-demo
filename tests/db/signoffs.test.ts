// Phase 2, slice P2.6: policy sign-offs and the grid (PLAN.md 5.2;
// docs/PHASE-2-AND-3.md 4.1).
// Owner's choices: overdue = still unsigned 30 days after publishing; a scan
// is optional (15 Nov 2026); nobody records or withdraws their own sign-off
// (16 Nov 2026). One live sign-off per person per version; only published
// versions; never before approval or in the future; never changed or
// deleted, only withdrawn with a reason. The grid is worked out against the
// current version, so a new version turns everyone back to unsigned.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { addDays, addYears, todayInDublin } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";

const SCANS = "signoff-scans";
const second = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
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

async function newPerson(role = "Contractor", active = true) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("people")
    .insert({
      full_name: testName("signoff person"),
      person_role_id: await listId("person_roles", role),
      section_id: await listId("sections", "Maintenance"),
      active,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

/** A policy that Contractors must sign, with nothing published yet. */
async function newPolicy() {
  const c = await asRole("centre_admin");
  const { data, error } = await c.from("policies").insert({ title: testName("signoff policy"), owner_person_id: await newPerson() }).select("id").single();
  if (error) throw error;
  const req = await c.from("policy_required_roles").insert({ policy_id: data.id, person_role_id: await listId("person_roles", "Contractor") });
  if (req.error) throw req.error;
  return data.id as string;
}

/** Uploads a draft as Centre Admin; Second Admin publishes it unless `publish` is false. */
async function newVersion(policyId: string, label = "v1", approvedAgo = 10, publish = true) {
  const c = await asRole("centre_admin");
  const path = `policies/${policyId}/${crypto.randomUUID()}.pdf`;
  const up = await c.storage.from("policy-files").upload(path, TINY_PDF, { contentType: "application/pdf" });
  if (up.error) throw up.error;
  const approved_on = addDays(today(), -approvedAgo);
  const { data, error } = await c
    .from("policy_versions")
    .insert({ policy_id: policyId, version_label: label, file_path: path, approved_on, next_review_on: addYears(approved_on, 1) })
    .select("id, approved_on")
    .single();
  if (error) throw error;
  if (publish) {
    const p = await (await second()).from("policy_versions").update({ status: "published" }).eq("id", data.id);
    if (p.error) throw p.error;
  }
  return data as { id: string; approved_on: string };
}

async function setup() {
  const policy = await newPolicy();
  const version = await newVersion(policy);
  const person = await newPerson();
  return { policy, version, person };
}

type Signoff = {
  id: number;
  person_id: string;
  policy_version_id: string;
  signed_on: string;
  scan_path: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string;
};

function signOff(client: SupabaseClient, person_id: string, policy_version_id: string, fields: Record<string, unknown> = {}) {
  return client
    .from("policy_signoffs")
    .insert({ person_id, policy_version_id, signed_on: addDays(today(), -1), ...fields })
    .select()
    .single<Signoff>();
}
async function mustSignOff(person_id: string, policy_version_id: string, fields: Record<string, unknown> = {}) {
  const { data, error } = await signOff(await asRole("centre_admin"), person_id, policy_version_id, fields);
  if (error) throw error;
  return data!;
}

async function personOfAccount(email: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("people").select("id").eq("app_user_id", userIdOf(email)).single();
  if (error) throw new Error(`${email} is not linked to a person (run npm run db:seed): ${error.message}`);
  return data.id;
}

type Square = { person_id: string; policy_id: string; policy_version_id: string; version_label: string; status: string; signed_on: string | null };
async function squareOf(person_id: string, policy_id: string): Promise<Square | undefined> {
  const { data, error } = await (await asRole("centre_admin")).from("policy_grid").select("*").eq("person_id", person_id).eq("policy_id", policy_id);
  if (error) throw error;
  return (data ?? [])[0] as Square | undefined;
}

// ---------------------------------------------------------------------------
describe("who can see and record sign-offs", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add or withdraw sign-offs, or see the grid`, async () => {
      const { version, person, policy } = await setup();
      const s = await mustSignOff(person, version.id);
      const c = await who.client();
      for (const table of ["policy_signoffs", "policy_grid"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
      const add = await signOff(c, await newPerson(), version.id);
      expect(add.data).toBeNull();
      const w = await c.from("policy_signoffs").update({ withdrawn_reason: "Test: not allowed" }).eq("id", s.id).select();
      expect(w.data ?? []).toHaveLength(0);
      expect((await squareOf(person, policy))?.status).toBe("signed");
    });

    it(`${who.label} cannot add or open sign-off scans`, async () => {
      const { version } = await setup();
      const path = `signoffs/${version.id}/${crypto.randomUUID()}.pdf`;
      expect((await (await asRole("centre_admin")).storage.from(SCANS).upload(path, TINY_PDF, { contentType: "application/pdf" })).error).toBeNull();
      const c = await who.client();
      expect((await c.storage.from(SCANS).upload(`signoffs/${version.id}/${crypto.randomUUID()}.pdf`, TINY_PDF, { contentType: "application/pdf" })).error).not.toBeNull();
      expect((await c.storage.from(SCANS).download(path)).error).not.toBeNull();
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can record a sign-off; who entered it is filled in by the database`, async () => {
      const { version, person } = await setup();
      const { data, error } = await signOff(await asRole(role), person, version.id);
      expect(error).toBeNull();
      expect(data?.created_by).toBe(userIdOf(seedAdmin(role).email));
    });
  }
});

describe("sign-off rules", () => {
  it("nobody can record or withdraw their own sign-off", async () => {
    const { version } = await setup();
    const mine = await personOfAccount(seedAdmin("centre_admin").email);
    const own = await signOff(await asRole("centre_admin"), mine, version.id);
    expect(own.error?.message).toMatch(/your own sign-off/i);
    // Another admin can; then the owner of it cannot withdraw it.
    const { data, error } = await signOff(await second(), mine, version.id);
    expect(error).toBeNull();
    const w = await (await asRole("centre_admin")).from("policy_signoffs").update({ withdrawn_reason: "Test: mine" }).eq("id", data!.id);
    expect(w.error?.message).toMatch(/your own sign-off/i);
  });

  it("only a published version can be signed", async () => {
    const policy = await newPolicy();
    const draft = await newVersion(policy, "v1", 10, false);
    const r = await signOff(await asRole("centre_admin"), await newPerson(), draft.id);
    expect(r.error?.message).toMatch(/only a published version/i);
  });

  it("the date cannot be in the future or before the version was approved", async () => {
    const { version, person } = await setup();
    const c = await asRole("centre_admin");
    expect((await signOff(c, person, version.id, { signed_on: addDays(today(), 1) })).error?.message).toMatch(/future/i);
    expect((await signOff(c, person, version.id, { signed_on: addDays(version.approved_on, -1) })).error?.message).toMatch(/before the version was approved/i);
    expect((await signOff(c, person, version.id, { signed_on: version.approved_on })).error).toBeNull();
  });

  it("one live sign-off per person per version", async () => {
    const { version, person } = await setup();
    await mustSignOff(person, version.id);
    expect((await signOff(await asRole("centre_admin"), person, version.id)).error).not.toBeNull();
  });

  it("no new sign-offs for switched-off people or policies", async () => {
    const { version, policy } = await setup();
    const off = await newPerson("Contractor", false);
    expect((await signOff(await asRole("centre_admin"), off, version.id)).error?.message).toMatch(/switched off/i);
    await (await asRole("centre_admin")).from("policies").update({ active: false }).eq("id", policy);
    expect((await signOff(await asRole("centre_admin"), await newPerson(), version.id)).error?.message).toMatch(/switched off/i);
  });

  it("a scan is optional, must be uploaded first, and must belong to this version", async () => {
    const { version, person } = await setup();
    const other = (await setup()).version;
    const c = await asRole("centre_admin");
    const missing = await signOff(c, person, version.id, { scan_path: `signoffs/${version.id}/${crypto.randomUUID()}.pdf` });
    expect(missing.error?.message).toMatch(/could not be found/i);
    const elsewherePath = `signoffs/${other.id}/${crypto.randomUUID()}.pdf`;
    await c.storage.from(SCANS).upload(elsewherePath, TINY_PDF, { contentType: "application/pdf" });
    expect((await signOff(c, person, version.id, { scan_path: elsewherePath })).error?.message).toMatch(/different policy version/i);
    const path = `signoffs/${version.id}/${crypto.randomUUID()}.pdf`;
    expect((await c.storage.from(SCANS).upload(path, TINY_PDF, { contentType: "application/pdf" })).error).toBeNull();
    const ok = await signOff(c, person, version.id, { scan_path: path });
    expect(ok.error).toBeNull();
    expect(ok.data?.scan_path).toBe(path);
  });

  it("one signed sheet can be entered for several people at once", async () => {
    const { version } = await setup();
    const people = [await newPerson(), await newPerson(), await newPerson()];
    const { data, error } = await (await asRole("centre_admin"))
      .from("policy_signoffs")
      .insert(people.map((person_id) => ({ person_id, policy_version_id: version.id, signed_on: today() })))
      .select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(3);
  });
});

describe("withdrawing a wrong sign-off", () => {
  it("needs a reason; who and when are filled in; it can then be entered again", async () => {
    const { version, person } = await setup();
    const s = await mustSignOff(person, version.id);
    const c = await second();
    expect((await c.from("policy_signoffs").update({ withdrawn_reason: "   " }).eq("id", s.id)).error?.message).toMatch(/needs a reason/i);
    const { data, error } = await c.from("policy_signoffs").update({ withdrawn_reason: "  Test:   wrong   person " }).eq("id", s.id).select().single<Signoff>();
    expect(error).toBeNull();
    expect(data).toMatchObject({ withdrawn_reason: "Test: wrong person", withdrawn_by: userIdOf(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email) });
    expect(data?.withdrawn_at).not.toBeNull();
    expect((await c.from("policy_signoffs").update({ withdrawn_reason: "again" }).eq("id", s.id)).error?.message).toMatch(/already withdrawn/i);
    expect((await signOff(c, person, version.id)).error).toBeNull();
  });

  it("a sign-off can never be changed or deleted, even with the master key", async () => {
    const { version, person } = await setup();
    const s = await mustSignOff(person, version.id);
    for (const c of [await asRole("super_admin"), masterKeyClient()]) {
      expect((await c.from("policy_signoffs").update({ signed_on: today() }).eq("id", s.id)).error?.message).toMatch(/cannot be changed/i);
      await c.from("policy_signoffs").delete().eq("id", s.id);
    }
    const { data } = await masterKeyClient().from("policy_signoffs").select("signed_on, withdrawn_at").eq("id", s.id).single();
    expect(data).toEqual({ signed_on: s.signed_on, withdrawn_at: null });
  });

  it("a scan cannot be replaced or deleted", async () => {
    const { version } = await setup();
    const c = await asRole("super_admin");
    const path = `signoffs/${version.id}/${crypto.randomUUID()}.pdf`;
    await c.storage.from(SCANS).upload(path, TINY_PDF, { contentType: "application/pdf" });
    expect((await c.storage.from(SCANS).upload(path, TINY_PDF, { contentType: "application/pdf", upsert: true })).error).not.toBeNull();
    await c.storage.from(SCANS).remove([path]);
    expect((await masterKeyClient().storage.from(SCANS).download(path)).error).toBeNull();
  });

  it("only PDFs and pictures are accepted as scans", async () => {
    const { version } = await setup();
    const up = await (await asRole("centre_admin")).storage
      .from(SCANS)
      .upload(`signoffs/${version.id}/${crypto.randomUUID()}.pdf`, new TextEncoder().encode("hello"), { contentType: "text/plain" });
    expect(up.error).not.toBeNull();
  });
});

describe("the grid", () => {
  it("a square for each switched-on person whose role must sign; unsigned until signed", async () => {
    const { policy, version, person } = await setup();
    expect(await squareOf(person, policy)).toMatchObject({ status: "unsigned", policy_version_id: version.id, signed_on: null });
    const s = await mustSignOff(person, version.id);
    expect(await squareOf(person, policy)).toMatchObject({ status: "signed", signed_on: s.signed_on });
    await (await second()).from("policy_signoffs").update({ withdrawn_reason: "Test: wrong" }).eq("id", s.id);
    expect((await squareOf(person, policy))?.status).toBe("unsigned");
  });

  it("no square for other roles, switched-off people, or a policy with nothing published", async () => {
    const { policy } = await setup();
    expect(await squareOf(await newPerson("Imam"), policy)).toBeUndefined();
    expect(await squareOf(await newPerson("Contractor", false), policy)).toBeUndefined();
    const draftOnly = await newPolicy();
    await newVersion(draftOnly, "v1", 10, false);
    expect(await squareOf(await newPerson(), draftOnly)).toBeUndefined();
  });

  it("publishing a new version turns everyone back to unsigned, with no other action", async () => {
    const { policy, version, person } = await setup();
    await mustSignOff(person, version.id);
    expect((await squareOf(person, policy))?.status).toBe("signed");
    const v2 = await newVersion(policy, "v2", 1);
    expect(await squareOf(person, policy)).toMatchObject({ status: "unsigned", version_label: "v2", policy_version_id: v2.id });
  });

  it("switching off the required role or the policy removes the squares", async () => {
    const { policy, person } = await setup();
    const c = await asRole("centre_admin");
    await c.from("policies").update({ active: false }).eq("id", policy);
    expect(await squareOf(person, policy)).toBeUndefined();
  });

  it("overdue means still unsigned more than 30 days after publishing", async () => {
    const c = await asRole("centre_admin");
    const status = async (published: string, signed: boolean, on: string) =>
      (await c.rpc("signoff_status", { p_published_on: published, p_signed: signed, p_today: on })).data;
    expect(await status("2026-01-01", false, "2026-01-31")).toBe("unsigned");
    expect(await status("2026-01-01", false, "2026-02-01")).toBe("overdue");
    expect(await status("2026-01-01", true, "2027-01-01")).toBe("signed");
  });
});

describe("home page counters", () => {
  it("count overdue and unsigned squares", async () => {
    type C = { signoffs_overdue: number; signoffs_unsigned: number };
    const c = await asRole("centre_admin");
    const before = (await c.rpc("home_counters").single<C>()).data!;
    const { version, person } = await setup();
    const after = (await c.rpc("home_counters").single<C>()).data!;
    expect(after.signoffs_unsigned).toBeGreaterThanOrEqual(before.signoffs_unsigned + 1);
    const { count } = await c.from("policy_grid").select("person_id", { count: "exact", head: true }).eq("status", "unsigned");
    expect(after.signoffs_unsigned).toBe(count);
    await mustSignOff(person, version.id);
    const signed = (await c.rpc("home_counters").single<C>()).data!;
    expect(signed.signoffs_unsigned).toBe(after.signoffs_unsigned - 1);
    expect(typeof signed.signoffs_overdue).toBe("number");
  });
});

describe("the audit log", () => {
  it("records a sign-off and its withdrawal", async () => {
    const { version, person } = await setup();
    const s = await mustSignOff(person, version.id);
    await (await second()).from("policy_signoffs").update({ withdrawn_reason: "Test: audit" }).eq("id", s.id);
    const { data } = await masterKeyClient().from("audit_log").select("action").eq("table_name", "policy_signoffs").eq("record_id", String(s.id)).order("id");
    expect(data?.map((r) => r.action)).toEqual(["insert", "update"]);
  });
});
