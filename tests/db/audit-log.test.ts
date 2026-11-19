// The audit log: every change is recorded, and nobody can alter the record.
import { beforeAll, describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, signedOutClient, testName, userIdOf } from "./clients";

let location: { id: string; name: string };
let entryId: number;

beforeAll(async () => {
  const c = await asRole("centre_admin");
  const ins = await c.from("locations").insert({ name: testName("audit"), kind: "building" }).select().single();
  if (ins.error) throw ins.error;
  location = ins.data;
  const upd = await c.from("locations").update({ name: location.name + " renamed" }).eq("id", location.id);
  if (upd.error) throw upd.error;
  const first = await masterKeyClient()
    .from("audit_log")
    .select("id")
    .eq("table_name", "locations")
    .eq("record_id", location.id)
    .eq("action", "insert")
    .single();
  if (first.error) throw first.error;
  entryId = first.data.id;
});

describe("every change is recorded automatically", () => {
  it("records a new location: who, when and the new values", async () => {
    const { data } = await (await asRole("super_admin"))
      .from("audit_log")
      .select("*")
      .eq("table_name", "locations")
      .eq("record_id", location.id)
      .eq("action", "insert");
    expect(data).toHaveLength(1);
    const e = data![0];
    expect(e.changed_by).toBe(userIdOf(seedAdmin("centre_admin").email));
    expect(e.old_values).toBeNull();
    expect(e.new_values.name).toBe(location.name);
    expect(Math.abs(Date.now() - new Date(e.changed_at).getTime())).toBeLessThan(10 * 60_000);
  });

  it("records a change with the old and the new values", async () => {
    const { data } = await (await asRole("super_admin"))
      .from("audit_log")
      .select("*")
      .eq("table_name", "locations")
      .eq("record_id", location.id)
      .eq("action", "update");
    expect(data).toHaveLength(1);
    expect(data![0].old_values.name).toBe(location.name);
    expect(data![0].new_values.name).toBe(location.name + " renamed");
  });

  it("records changes to accounts too", async () => {
    const secondId = userIdOf("second.admin@icci-prototype.test");
    const c = await asRole("super_admin");
    const before = new Date().toISOString();
    await c.from("app_users").update({ display_name: "Test Second Admin" }).eq("id", secondId);
    const { data } = await c
      .from("audit_log")
      .select("changed_by")
      .eq("table_name", "app_users")
      .eq("record_id", secondId)
      .eq("action", "update")
      .gte("changed_at", new Date(Date.parse(before) - 60_000).toISOString());
    expect(data!.length).toBeGreaterThanOrEqual(1);
  });
});

describe("only super_admin can read the audit log", () => {
  it("signed-out visitor cannot", async () => {
    const { data } = await signedOutClient().from("audit_log").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });

  for (const role of ["centre_admin", "finance", "library_operator"]) {
    it(`${role} cannot`, async () => {
      const { data } = await (await asRole(role)).from("audit_log").select("id").limit(1);
      expect(data ?? []).toHaveLength(0);
    });
  }

  it("a deactivated account cannot", async () => {
    const { data } = await (await asRole("centre_admin", false)).from("audit_log").select("id").limit(1);
    expect(data ?? []).toHaveLength(0);
  });
});

describe("nobody can add, change or remove audit entries", () => {
  it("super_admin cannot write an entry by hand", async () => {
    const { error } = await (await asRole("super_admin"))
      .from("audit_log")
      .insert({ table_name: "locations", record_id: "fake", action: "insert" });
    expect(error).not.toBeNull();
  });

  it("super_admin cannot change an entry", async () => {
    const { error } = await (await asRole("super_admin"))
      .from("audit_log")
      .update({ new_values: { name: "forged" } })
      .eq("id", entryId);
    expect(error).not.toBeNull();
  });

  it("super_admin cannot delete an entry", async () => {
    const { error } = await (await asRole("super_admin")).from("audit_log").delete().eq("id", entryId);
    expect(error).not.toBeNull();
  });

  it("even the master key cannot write, change or delete an entry", async () => {
    const m = masterKeyClient();
    const ins = await m.from("audit_log").insert({ table_name: "locations", record_id: "fake", action: "insert" });
    const upd = await m.from("audit_log").update({ new_values: { name: "forged" } }).eq("id", entryId);
    const del = await m.from("audit_log").delete().eq("id", entryId);
    expect(ins.error).not.toBeNull();
    expect(upd.error).not.toBeNull();
    expect(del.error).not.toBeNull();
    const still = await m.from("audit_log").select("new_values").eq("id", entryId).single();
    expect(still.data!.new_values.name).toBe(location.name);
  });
});
