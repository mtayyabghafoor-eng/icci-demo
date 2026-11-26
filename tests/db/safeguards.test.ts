// Rules that apply to every table (CLAUDE.md "Rules with no exceptions").
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, signedOutClient, testName, userIdOf } from "./clients";

type TableReport = {
  table_name: string;
  rls_enabled: boolean;
  blocks_delete: boolean;
  audited: boolean;
  has_record_columns: boolean;
};

describe("every table in the database", () => {
  it("has row-level security, blocks deleting, is audited and records who/when", async () => {
    const { data, error } = await masterKeyClient().rpc("security_report");
    expect(error).toBeNull();
    const tables = data as TableReport[];
    expect(tables.map((t) => t.table_name)).toEqual(
      expect.arrayContaining(["app_users", "audit_log", "item_categories", "items", "labels", "locations", "roles", "stock_movements", "stocktakes", "stocktake_scans", "stocktake_differences"]),
    );
    for (const t of tables) {
      expect(t, t.table_name).toMatchObject({ rls_enabled: true, blocks_delete: true });
      if (t.table_name !== "audit_log") {
        expect(t, t.table_name).toMatchObject({ audited: true, has_record_columns: true });
      }
    }
  });

  it("the security report itself is hidden from signed-out visitors and admins", async () => {
    const out = await signedOutClient().rpc("security_report");
    const admin = await (await asRole("super_admin")).rpc("security_report");
    expect(out.error).not.toBeNull();
    expect(admin.error).not.toBeNull();
  });
});

// Audit fixes 6 and 8 (15 Nov 2026), and the slow searches noted in slice 9.
// A second report checks everything else in the database, not only tables.
// It lists problems; the list must be empty.
type Problem = { object_kind: string; object_name: string; problem: string };

describe("everything else in the database", () => {
  async function problems() {
    const { data, error } = await masterKeyClient().rpc("security_problems");
    expect(error).toBeNull();
    return data as Problem[];
  }
  const ofKind = (list: Problem[], kind: string) => list.filter((p) => p.object_kind === kind);

  it("every view applies the reader's own access rules", async () => {
    expect(ofKind(await problems(), "view")).toEqual([]);
  });

  it("signed-out visitors cannot use any table, view or database function", async () => {
    const list = await problems();
    expect(ofKind(list, "anon_access")).toEqual([]);
    expect(ofKind(list, "function_open")).toEqual([]);
  });

  // Round C3 (migration 0056).
  it("signed-out visitors cannot read or change a number counter, and no admin can reset one", async () => {
    const list = await problems();
    expect(ofKind(list, "anon_sequence")).toEqual([]);
    expect(ofKind(list, "sequence_reset")).toEqual([]);
  });

  it("functions that run with the owner's rights fix where they look things up", async () => {
    expect(ofKind(await problems(), "function_search_path")).toEqual([]);
  });

  it("no rule can be switched off by a setting someone could change by hand", async () => {
    expect(ofKind(await problems(), "setting_flag")).toEqual([]);
  });

  it("every access rule checks the role once per search, not once per row (keeps lists fast)", async () => {
    expect(ofKind(await problems(), "policy_per_row")).toEqual([]);
  });

  it("no file store is public", async () => {
    expect(ofKind(await problems(), "public_bucket")).toEqual([]);
  });

  it("finds nothing else wrong", async () => {
    expect(await problems()).toEqual([]);
  });

  it("is hidden from signed-out visitors and admins", async () => {
    expect((await signedOutClient().rpc("security_problems")).error).not.toBeNull();
    expect((await (await asRole("super_admin")).rpc("security_problems")).error).not.toBeNull();
  });
});

describe("nothing can be deleted", () => {
  it("super_admin cannot delete a location, an account or a role", async () => {
    const c = await asRole("super_admin");
    const loc = await c.from("locations").insert({ name: testName("nodelete"), kind: "building" }).select().single();
    expect(loc.error).toBeNull();
    const results = [
      await c.from("locations").delete().eq("id", loc.data!.id),
      await c.from("app_users").delete().eq("id", userIdOf(seedAdmin("finance").email)),
      await c.from("roles").delete().eq("code", "finance"),
    ];
    for (const r of results) expect(r.error).not.toBeNull();
    const still = await c.from("locations").select("id").eq("id", loc.data!.id);
    expect(still.data).toHaveLength(1);
  });

  it("even the master key cannot delete", async () => {
    const m = masterKeyClient();
    const loc = await m.from("locations").insert({ name: testName("nodelete-master"), kind: "building" }).select().single();
    expect(loc.error).toBeNull();
    for (const r of [
      await m.from("locations").delete().eq("id", loc.data!.id),
      await m.from("app_users").delete().eq("id", userIdOf(seedAdmin("finance").email)),
      await m.from("roles").delete().eq("code", "finance"),
    ]) {
      expect(r.error?.message).toMatch(/cannot be deleted/i);
    }
  });

  it("the master key cannot move an item, or change its condition, without an asset entry", async () => {
    const m = masterKeyClient();
    const { data: item } = await m.from("items").select("id, location_id").eq("kind", "fixed_asset").neq("condition", "disposed").limit(1).single();
    const { data: other } = await m.from("locations").select("id").eq("kind", "room").neq("id", item!.location_id).limit(1).single();
    expect((await m.from("items").update({ location_id: other!.id }).eq("id", item!.id)).error?.message).toMatch(/Move/);
    expect((await m.from("items").update({ condition: "missing" }).eq("id", item!.id)).error?.message).toMatch(/condition/i);
  });

  it("a sign-in account cannot be deleted while it has an account record", async () => {
    const { error } = await masterKeyClient().auth.admin.deleteUser(userIdOf(seedAdmin("finance").email));
    expect(error).not.toBeNull();
  });
});
