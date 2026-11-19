// Slice 7: label sheet printing. New label numbers are handed out ONLY by the
// database ("print_new_labels"), one after the other, so two admins printing
// at the same moment never get the same numbers. Every sheet is recorded as a
// print run that can never be changed or deleted. "Print again" records a
// reprint of the same numbers without creating new ones.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, userIdOf } from "./clients";

type PrintRun = {
  id: number;
  first_number: number;
  last_number: number;
  label_count: number;
  reprint_of: number | null;
  created_by: string | null;
};

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const admins = ["super_admin", "centre_admin"];

const serial = (n: number) => `ICCI-${String(n).padStart(6, "0")}`;

async function printNew(role: string, count: number): Promise<PrintRun> {
  const { data, error } = await (await asRole(role)).rpc("print_new_labels", { p_count: count });
  if (error) throw error;
  return data as PrintRun;
}

async function labelsInRange(first: number, last: number): Promise<string[]> {
  const { data, error } = await masterKeyClient()
    .from("labels")
    .select("serial")
    .gte("serial", serial(first))
    .lte("serial", serial(last))
    .order("serial");
  if (error) throw error;
  return data.map((l) => l.serial);
}

// ---------------------------------------------------------------------------
describe("who can print labels", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot print new labels`, async () => {
      const { data, error } = await (await who.client()).rpc("print_new_labels", { p_count: 3 });
      expect(error).not.toBeNull();
      expect(data).toBeNull();
    });

    it(`${who.label} cannot print a sheet again`, async () => {
      const run = await printNew("centre_admin", 1);
      const { error } = await (await who.client()).rpc("reprint_labels", { p_run_id: run.id });
      expect(error).not.toBeNull();
      const reprints = await masterKeyClient().from("label_print_runs").select("id").eq("reprint_of", run.id);
      expect(reprints.data).toHaveLength(0);
    });

    it(`${who.label} sees no print runs`, async () => {
      await printNew("centre_admin", 1);
      const { data } = await (await who.client()).from("label_print_runs").select("*").limit(5);
      expect(data ?? []).toHaveLength(0);
    });
  }

  for (const role of admins) {
    it(`${role} can print new labels, and the run records who printed them`, async () => {
      const run = await printNew(role, 3);
      expect(run.label_count).toBe(3);
      expect(run.last_number - run.first_number).toBe(2);
      expect(run.reprint_of).toBeNull();
      expect(run.created_by).toBe(userIdOf(seedAdmin(role).email));
      expect(await labelsInRange(run.first_number, run.last_number)).toEqual([
        serial(run.first_number),
        serial(run.first_number + 1),
        serial(run.first_number + 2),
      ]);
      const seen = await (await asRole(role)).from("label_print_runs").select("id").eq("id", run.id);
      expect(seen.data).toHaveLength(1);
    });
  }

  it("nobody can add a label directly: only a printed sheet creates labels", async () => {
    for (const role of admins) {
      const { error } = await (await asRole(role)).from("labels").insert({ serial: "ICCI-999996" });
      expect(error, role).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
describe("label numbers", () => {
  it("start straight after the highest label that exists", async () => {
    const before = await masterKeyClient().from("labels").select("serial").order("serial", { ascending: false }).limit(1).single();
    const highest = Number(before.data!.serial.slice(5));
    const run = await printNew("centre_admin", 2);
    expect(run.first_number).toBe(highest + 1);
  });

  it("carry on from one sheet to the next with no gaps", async () => {
    const a = await printNew("centre_admin", 4);
    const b = await printNew("super_admin", 4);
    expect(b.first_number).toBe(a.last_number + 1);
  });

  it("are never handed out twice, even when admins print at the same moment", async () => {
    const runs = await Promise.all([
      printNew("centre_admin", 5),
      printNew("super_admin", 5),
      printNew("centre_admin", 5),
      printNew("super_admin", 5),
    ]);
    const numbers = runs.flatMap((r) => Array.from({ length: r.label_count }, (_, i) => r.first_number + i));
    expect(new Set(numbers).size).toBe(20);
    for (const r of runs) {
      expect(await labelsInRange(r.first_number, r.last_number)).toHaveLength(5);
    }
  });

  it("a sheet must have between 1 and 210 labels (ten sheets)", async () => {
    const c = await asRole("centre_admin");
    for (const p_count of [0, -1, 211, 5000]) {
      const { error } = await c.rpc("print_new_labels", { p_count });
      expect(error?.message, String(p_count)).toMatch(/between 1 and 210/i);
    }
    const ten = await printNew("centre_admin", 210);
    expect(ten.label_count).toBe(210);
  });
});

// ---------------------------------------------------------------------------
describe("printing a sheet again", () => {
  it("prints the same numbers and creates no new labels", async () => {
    const run = await printNew("centre_admin", 3);
    const { data, error } = await (await asRole("super_admin")).rpc("reprint_labels", { p_run_id: run.id });
    expect(error).toBeNull();
    const again = data as PrintRun;
    expect(again).toMatchObject({ first_number: run.first_number, last_number: run.last_number, reprint_of: run.id });
    expect(again.created_by).toBe(userIdOf(seedAdmin("super_admin").email));
    expect(await labelsInRange(run.first_number, run.last_number)).toHaveLength(3);
    const next = await printNew("centre_admin", 1);
    expect(next.first_number).toBeGreaterThan(run.last_number);
  });

  it("a reprint of a reprint points back to the original sheet", async () => {
    const run = await printNew("centre_admin", 1);
    const c = await asRole("centre_admin");
    const first = (await c.rpc("reprint_labels", { p_run_id: run.id })).data as PrintRun;
    const second = (await c.rpc("reprint_labels", { p_run_id: first.id })).data as PrintRun;
    expect(second.reprint_of).toBe(run.id);
  });

  it("a print run that does not exist cannot be printed again", async () => {
    const { error } = await (await asRole("centre_admin")).rpc("reprint_labels", { p_run_id: 999999999 });
    expect(error?.message).toMatch(/could not be found/i);
  });
});

// ---------------------------------------------------------------------------
describe("print runs are a permanent record", () => {
  it("an admin cannot change a print run", async () => {
    const run = await printNew("centre_admin", 1);
    const { data } = await (await asRole("super_admin"))
      .from("label_print_runs")
      .update({ last_number: run.last_number + 5 })
      .eq("id", run.id)
      .select();
    expect(data ?? []).toHaveLength(0);
  });

  it("an admin cannot add a print run by hand", async () => {
    const { error } = await (await asRole("super_admin")).from("label_print_runs").insert({ first_number: 1, last_number: 2 });
    expect(error).not.toBeNull();
  });

  it("even the master key cannot change or delete a print run", async () => {
    const run = await printNew("centre_admin", 1);
    const m = masterKeyClient();
    const changed = await m.from("label_print_runs").update({ last_number: run.last_number + 5 }).eq("id", run.id);
    expect(changed.error?.message).toMatch(/cannot be changed/i);
    const deleted = await m.from("label_print_runs").delete().eq("id", run.id);
    expect(deleted.error).not.toBeNull();
    const still = await m.from("label_print_runs").select("last_number").eq("id", run.id).single();
    expect(still.data!.last_number).toBe(run.last_number);
  });
});
