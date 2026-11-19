// Phase 2, slice P2.2: connect people to what exists (docs/PHASE-2-AND-3.md 4.1).
// Owner's choices, 15 Nov 2026:
//   * "Reported by" on a new asset entry is EITHER a person from the
//     directory OR a typed name (for "a visitor told reception"), never both,
//     never neither. Old entries keep their typed names. Only switched-on
//     people can be picked.
//   * A stocktake approval names the admin who sent the stocktake: their
//     person record if their account is linked to one, otherwise their name.
//   * A person can be linked to at most one admin account (and an account to
//     at most one person). Only a Super Admin sets, changes or removes a
//     link, and never on their own account. Centre Admins can see links.
//   * "Your own entry" (no self-approval) still means the account that made
//     it, whoever is named as the reporter.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SEED_ADMINS, seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedInClient, signedOutClient, testName, userIdOf } from "./clients";
import { fixedAssetFields, idOf, newFixedAsset } from "./items-helpers";

const secondCentreAdmin = () => signedInClient(SEED_ADMINS.find((a) => a.email.startsWith("second.admin"))!.email);
const note = "Test note: made-up event";

async function listId(table: "person_roles" | "sections", name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from(table).select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function newPerson(extra: Record<string, unknown> = {}) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("people")
    .insert({
      full_name: testName("person"),
      person_role_id: await listId("person_roles", "Volunteer"),
      section_id: await listId("sections", "Volunteers"),
      ...extra,
    })
    .select("id, active, app_user_id")
    .single();
  if (error) throw error;
  return data as { id: string; active: boolean; app_user_id: string | null };
}

async function personOfAccount(email: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("people").select("id").eq("app_user_id", userIdOf(email)).single();
  if (error) throw new Error(`${email} is not linked to a person (run npm run db:seed): ${error.message}`);
  return data.id;
}

type Ev = { id: number; reported_by: string | null; reported_by_person_id: string | null };

function report(client: SupabaseClient, item_id: string, who: Record<string, unknown>, kind = "damage") {
  return client.from("asset_events").insert({ item_id, kind, note, ...who }).select("id, reported_by, reported_by_person_id").single<Ev>();
}

// ---------------------------------------------------------------------------
describe("'reported by' on a new asset entry", () => {
  it("can be a person from the directory", async () => {
    const person = await newPerson();
    const item = await newFixedAsset();
    const { data, error } = await report(await asRole("centre_admin"), item.id, { reported_by_person_id: person.id });
    expect(error).toBeNull();
    expect(data).toMatchObject({ reported_by: null, reported_by_person_id: person.id });
  });

  it("can still be a typed name (for someone not in the directory)", async () => {
    const item = await newFixedAsset();
    const { data, error } = await report(await asRole("centre_admin"), item.id, { reported_by: "  A visitor told reception (fictional) " });
    expect(error).toBeNull();
    expect(data).toMatchObject({ reported_by: "A visitor told reception (fictional)", reported_by_person_id: null });
  });

  it("cannot be both, and cannot be neither (a blank name counts as none)", async () => {
    const person = await newPerson();
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    expect((await report(c, item.id, { reported_by_person_id: person.id, reported_by: "Someone (fictional)" })).error?.message).toMatch(
      /either.*not both/i,
    );
    expect((await report(c, item.id, {})).error?.message).toMatch(/who reported it/i);
    expect((await report(c, item.id, { reported_by: "   " })).error?.message).toMatch(/who reported it/i);
  });

  it("cannot be a switched-off person, or someone who does not exist", async () => {
    const person = await newPerson();
    const c = await asRole("centre_admin");
    await c.from("people").update({ active: false }).eq("id", person.id);
    const item = await newFixedAsset();
    expect((await report(c, item.id, { reported_by_person_id: person.id })).error?.message).toMatch(/switched off/i);
    expect((await report(c, item.id, { reported_by_person_id: crypto.randomUUID() })).error).not.toBeNull();
  });

  it("a switched-off person stays on entries made before", async () => {
    const person = await newPerson();
    const c = await asRole("centre_admin");
    const item = await newFixedAsset();
    const { data } = await report(c, item.id, { reported_by_person_id: person.id });
    await c.from("people").update({ active: false }).eq("id", person.id);
    const { data: still } = await c.from("asset_events").select("reported_by_person_id").eq("id", data!.id).single();
    expect(still).toEqual({ reported_by_person_id: person.id });
  });

  it("cannot be changed afterwards, not even when deciding a disposal", async () => {
    const person = await newPerson();
    const other = await newPerson();
    const item = await newFixedAsset();
    const { data: ev } = await report(await asRole("centre_admin"), item.id, { reported_by_person_id: person.id }, "disposal");
    const second = await secondCentreAdmin();
    const sneaky = await second.from("asset_events").update({ status: "approved", reported_by_person_id: other.id }).eq("id", ev!.id);
    expect(sneaky.error?.message).toMatch(/only the decision/i);
    const m = await masterKeyClient().from("asset_events").update({ reported_by_person_id: other.id }).eq("id", ev!.id);
    expect(m.error).not.toBeNull();
  });

  it("naming yourself or someone else does not change who may approve a disposal", async () => {
    const me = await asRole("centre_admin");
    const item = await newFixedAsset();
    const mine = await personOfAccount(seedAdmin("centre_admin").email);
    const { data: ev } = await report(me, item.id, { reported_by_person_id: await (await newPerson()).id }, "disposal");
    // Still my entry: I cannot approve it.
    expect((await me.from("asset_events").update({ status: "approved" }).eq("id", ev!.id)).error?.message).toMatch(/different admin/i);
    expect(mine).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("stocktake approvals name the admin who sent the stocktake", () => {
  async function missingAfterStocktake(starter: SupabaseClient, approver: SupabaseClient) {
    const c = await asRole("centre_admin");
    const { data: room, error } = await c
      .from("locations")
      .insert({ name: testName("reported-by room"), kind: "room", parent_id: await idOf("locations", "Test Building A") })
      .select("id")
      .single();
    if (error) throw error;
    const { data: item, error: itemError } = await c.from("items").insert(await fixedAssetFields({ location_id: room.id })).select("id").single();
    if (itemError) throw itemError;
    // A second asset that is scanned (a stocktake cannot be sent empty).
    const { data: seen, error: seenError } = await c.from("items").insert(await fixedAssetFields({ location_id: room.id })).select("label_serial").single();
    if (seenError) throw seenError;
    const st = await starter.from("stocktakes").insert({ location_id: room.id }).select("id").single();
    if (st.error) throw st.error;
    const scan = await starter.from("stocktake_scans").insert({ stocktake_id: st.data.id, label_serial: seen.label_serial });
    if (scan.error) throw scan.error;
    const sent = await starter.rpc("submit_stocktake", { p_stocktake_id: st.data.id });
    if (sent.error) throw sent.error;
    const { data: diff } = await masterKeyClient().from("stocktake_differences").select("id").eq("stocktake_id", st.data.id).single();
    const ok = await approver.from("stocktake_differences").update({ status: "approved" }).eq("id", diff!.id);
    if (ok.error) throw ok.error;
    const { data: ev } = await masterKeyClient()
      .from("asset_events")
      .select("reported_by, reported_by_person_id")
      .eq("item_id", item.id)
      .single();
    return ev as Ev;
  }

  it("as their person record when their account is linked", async () => {
    const ev = await missingAfterStocktake(await asRole("centre_admin"), await secondCentreAdmin());
    expect(ev).toEqual({ reported_by: null, reported_by_person_id: await personOfAccount(seedAdmin("centre_admin").email) });
  });

  it("as their name when it is not", async () => {
    const ev = await missingAfterStocktake(await asRole("super_admin"), await asRole("centre_admin"));
    expect(ev).toEqual({ reported_by: "Test Super Admin", reported_by_person_id: null });
  });
});

// ---------------------------------------------------------------------------
describe("linking a person to an admin account", () => {
  const financeId = () => userIdOf(seedAdmin("finance").email);
  const superId = () => userIdOf(seedAdmin("super_admin").email);
  /** Leaves the finance account unlinked, whatever a test did. */
  async function unlinkFinance() {
    await masterKeyClient().from("people").update({ app_user_id: null }).eq("app_user_id", financeId());
  }

  it("a Super Admin can link, change and remove a link", async () => {
    const c = await asRole("super_admin");
    const a = await newPerson();
    const b = await newPerson();
    try {
      expect((await c.from("people").update({ app_user_id: financeId() }).eq("id", a.id)).error).toBeNull();
      // One account, one person: linking it to a second person is refused.
      expect((await c.from("people").update({ app_user_id: financeId() }).eq("id", b.id)).error).not.toBeNull();
      // Change: remove from a, give to b.
      expect((await c.from("people").update({ app_user_id: null }).eq("id", a.id)).error).toBeNull();
      expect((await c.from("people").update({ app_user_id: financeId() }).eq("id", b.id)).error).toBeNull();
      const { data } = await c.from("people").select("id").eq("app_user_id", financeId());
      expect(data).toEqual([{ id: b.id }]);
    } finally {
      await unlinkFinance();
    }
  });

  it("a Centre Admin can see links but not set them, even when adding a new person", async () => {
    const c = await asRole("centre_admin");
    const p = await newPerson();
    try {
      const set = await c.from("people").update({ app_user_id: financeId() }).eq("id", p.id);
      expect(set.error?.message).toMatch(/only a super admin/i);
      const add = await c
        .from("people")
        .insert({
          full_name: testName("person"),
          person_role_id: await listId("person_roles", "Volunteer"),
          section_id: await listId("sections", "Volunteers"),
          app_user_id: financeId(),
        });
      expect(add.error?.message).toMatch(/only a super admin/i);
      const { data } = await c.from("people").select("app_user_id").eq("app_user_id", userIdOf(seedAdmin("centre_admin").email));
      expect(data).toHaveLength(1);
    } finally {
      await unlinkFinance();
    }
  });

  it("nobody can link, change or remove the link on their own account", async () => {
    const c = await asRole("super_admin");
    const p = await newPerson();
    expect((await c.from("people").update({ app_user_id: superId() }).eq("id", p.id)).error?.message).toMatch(/your own account/i);

    // Linked by someone else (here the master key stands in for another Super Admin)...
    const m = masterKeyClient();
    expect((await m.from("people").update({ app_user_id: superId() }).eq("id", p.id)).error).toBeNull();
    try {
      // ...the Super Admin cannot remove it or move it to another person.
      expect((await c.from("people").update({ app_user_id: null }).eq("id", p.id)).error?.message).toMatch(/your own account/i);
      const other = await newPerson();
      expect((await c.from("people").update({ app_user_id: superId() }).eq("id", other.id)).error).not.toBeNull();
    } finally {
      await m.from("people").update({ app_user_id: null }).eq("id", p.id);
    }
  });

  it("finance, the library operator, a switched-off account, a password-only sign-in and a signed-out visitor cannot link", async () => {
    const p = await newPerson();
    for (const client of [
      signedOutClient(),
      await asRole("finance"),
      await asRole("library_operator"),
      await asRole("centre_admin", false),
      await passwordOnlyClient(seedAdmin("super_admin").email),
    ]) {
      await client.from("people").update({ app_user_id: financeId() }).eq("id", p.id);
    }
    const { data } = await masterKeyClient().from("people").select("app_user_id").eq("id", p.id).single();
    expect(data).toEqual({ app_user_id: null });
  });

  it("can only point at a real admin account", async () => {
    const p = await newPerson();
    expect((await (await asRole("super_admin")).from("people").update({ app_user_id: crypto.randomUUID() }).eq("id", p.id)).error).not.toBeNull();
  });

  it("every link change is in the audit log", async () => {
    const c = await asRole("super_admin");
    const p = await newPerson();
    try {
      await c.from("people").update({ app_user_id: financeId() }).eq("id", p.id);
      const { data } = await masterKeyClient()
        .from("audit_log")
        .select("new_values")
        .eq("table_name", "people")
        .eq("record_id", p.id)
        .order("id", { ascending: false })
        .limit(1)
        .single();
      expect((data!.new_values as { app_user_id: string }).app_user_id).toBe(financeId());
    } finally {
      await unlinkFinance();
    }
  });
});
