// Phase 3, slice P3.1: prayer times and rota slot types (docs/PHASE-2-AND-3.md
// 5.1). Owner's choices, 18 Nov 2026 (all recommended):
//   * Super Admin and Centre Admin only. Finance and the Library Operator see
//     nothing.
//   * Slot types are a list that can grow: add, rename, reorder, tick "needs
//     Garda vetting", switch off (never delete). Security, Volunteers and
//     Funeral on call need vetting to start with; the prayer slots do not.
//   * Prayer times are typed in from the Centre's timetable, never
//     calculated: one row per date with the five prayers, and on Fridays the
//     two Jumu'ah times. Past days can be corrected; every change is in the
//     audit log. Nothing is deleted.
// All of it is enforced by the database itself, so these tests talk to it
// directly. Test prayer times use months in 2000-2019, before the app
// existed, so they never mix with the made-up times the screens show.
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { fullDayLabel } from "@/lib/rota/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const WINTER = { fajr: "06:45", dhuhr: "12:20", asr: "13:55", maghrib: "16:20", isha: "18:05" };

/** A month in 2000-2019 with no prayer times yet ("2007-03"). */
async function freeTestMonth(): Promise<string> {
  for (let tries = 0; tries < 50; tries++) {
    const year = 2000 + Math.floor(Math.random() * 20);
    const month = `${year}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}`;
    const { count, error } = await masterKeyClient()
      .from("prayer_times")
      .select("id", { count: "exact", head: true })
      .gte("prayer_date", `${month}-01`)
      .lte("prayer_date", `${month}-28`);
    if (error) throw error;
    if (!count) return month;
  }
  throw new Error("No free test month left in 2000-2019. Run npm run db:reset.");
}

/** The first Friday and the first non-Friday of a month. */
function daysOf(month: string) {
  const days = Array.from({ length: 28 }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
  const isFriday = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay() === 5;
  return { friday: days.find(isFriday)!, weekday: days.find((d) => !isFriday(d))!, all: days };
}

const hm = (t: string | null) => (t === null ? null : t.slice(0, 5));

async function newSlotType(fields: Record<string, unknown> = {}) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("rota_slot_types")
    .insert({ name: testName("slot"), slot_group: "shift", ...fields })
    .select()
    .single();
  if (error) throw error;
  return data as { id: string; name: string; slot_group: string; display_order: number; needs_vetting: boolean; active: boolean };
}

// ---------------------------------------------------------------------------
describe("the starting list of slot types", () => {
  it("has the twelve slots in four groups, in order, with the right vetting ticks and times (plus Eid prayer, P3.4)", async () => {
    const { data, error } = await (await asRole("centre_admin"))
      .from("rota_slot_types")
      .select("name, slot_group, prayer_time, needs_vetting, display_order")
      .not("name", "like", "Test run%")
      .order("slot_group")
      .order("display_order");
    expect(error).toBeNull();
    const byGroup = (g: string) => (data ?? []).filter((t) => t.slot_group === g).map((t) => t.name);
    expect(byGroup("prayer")).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
    expect(byGroup("jumuah")).toEqual(["Jumu'ah 1", "Jumu'ah 2"]);
    expect(byGroup("shift")).toEqual(["Security", "Cleaning", "Reception", "Volunteers", "Eid prayer"]);
    expect(byGroup("on_call")).toEqual(["Funeral on call"]);
    const vetted = (data ?? []).filter((t) => t.needs_vetting).map((t) => t.name).sort();
    expect(vetted).toEqual(["Funeral on call", "Security", "Volunteers"]);
    const time = new Map((data ?? []).map((t) => [t.name, t.prayer_time]));
    expect(time.get("Fajr")).toBe("fajr");
    expect(time.get("Isha")).toBe("isha");
    expect(time.get("Jumu'ah 2")).toBe("jumuah_2");
    expect(time.get("Security")).toBeNull();
  });
});

describe("who can see and change slot types", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add, change or reorder slot types`, async () => {
      const t = await newSlotType();
      const c = await who.client();
      expect((await c.from("rota_slot_types").select("id").limit(5)).data ?? []).toEqual([]);
      expect((await c.from("rota_slot_types").insert({ name: testName("not allowed"), slot_group: "shift" }).select()).error).not.toBeNull();
      await c.from("rota_slot_types").update({ name: "Test run changed", needs_vetting: true }).eq("id", t.id);
      expect((await c.rpc("move_rota_slot_type", { p_id: t.id, p_direction: "up" })).error).not.toBeNull();
      const { data } = await masterKeyClient().from("rota_slot_types").select("name, needs_vetting, display_order").eq("id", t.id).single();
      expect(data).toEqual({ name: t.name, needs_vetting: false, display_order: t.display_order });
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add, rename, tick vetting, and switch a slot type off and on`, async () => {
      const c = await asRole(role);
      const { data, error } = await c.from("rota_slot_types").insert({ name: testName("car park"), slot_group: "shift" }).select().single();
      expect(error).toBeNull();
      expect(data!.needs_vetting).toBe(false);
      expect((await c.from("rota_slot_types").update({ name: testName("renamed"), needs_vetting: true }).eq("id", data!.id)).error).toBeNull();
      expect((await c.from("rota_slot_types").update({ active: false }).eq("id", data!.id)).error).toBeNull();
      expect((await c.from("rota_slot_types").update({ active: true }).eq("id", data!.id)).error).toBeNull();
    });
  }
});

describe("slot type rules", () => {
  it("a new slot type goes to the end of its group", async () => {
    const a = await newSlotType();
    const b = await newSlotType();
    expect(b.display_order).toBeGreaterThan(a.display_order);
    const { data } = await masterKeyClient().from("rota_slot_types").select("display_order").eq("slot_group", "shift");
    expect(Math.max(...(data ?? []).map((t) => t.display_order))).toBe(b.display_order);
  });

  it("moving up swaps places with the one above; the first one cannot go higher", async () => {
    const a = await newSlotType();
    const b = await newSlotType();
    const c = await asRole("centre_admin");
    expect((await c.rpc("move_rota_slot_type", { p_id: b.id, p_direction: "up" })).error).toBeNull();
    const { data } = await c.from("rota_slot_types").select("id, display_order").in("id", [a.id, b.id]);
    const order = new Map((data ?? []).map((t) => [t.id, t.display_order]));
    expect(order.get(b.id)).toBe(a.display_order);
    expect(order.get(a.id)).toBe(b.display_order);

    const { data: first } = await c.from("rota_slot_types").select("id, display_order").eq("slot_group", "prayer").order("display_order").limit(1).single();
    expect((await c.rpc("move_rota_slot_type", { p_id: first!.id, p_direction: "up" })).error).toBeNull();
    const { data: still } = await c.from("rota_slot_types").select("display_order").eq("id", first!.id).single();
    expect(still!.display_order).toBe(first!.display_order);
    expect((await c.rpc("move_rota_slot_type", { p_id: first!.id, p_direction: "sideways" })).error?.message).toMatch(/up or down/);
  });

  it("a prayer or Jumu'ah slot must say which time it takes; a shift or on-call slot must not", async () => {
    const c = await asRole("centre_admin");
    const add = (fields: Record<string, unknown>) => c.from("rota_slot_types").insert({ name: testName("rule"), ...fields });
    expect((await add({ slot_group: "prayer" })).error?.message).toMatch(/which prayer time/i);
    expect((await add({ slot_group: "prayer", prayer_time: "jumuah_1" })).error?.message).toMatch(/which prayer time/i);
    expect((await add({ slot_group: "jumuah", prayer_time: "asr" })).error?.message).toMatch(/which prayer time/i);
    expect((await add({ slot_group: "shift", prayer_time: "fajr" })).error?.message).toMatch(/which prayer time/i);
    expect((await add({ slot_group: "party" })).error).not.toBeNull();
    expect((await add({ slot_group: "prayer", prayer_time: "fajr" })).error).toBeNull();
  });

  it("the group and the time a slot takes can never change (switch it off and add a new one)", async () => {
    const t = await newSlotType({ slot_group: "prayer", prayer_time: "fajr" });
    const c = await asRole("super_admin");
    expect((await c.from("rota_slot_types").update({ slot_group: "shift", prayer_time: null }).eq("id", t.id)).error?.message).toMatch(/cannot change/i);
    expect((await c.from("rota_slot_types").update({ prayer_time: "isha" }).eq("id", t.id)).error?.message).toMatch(/cannot change/i);
  });

  it("two slot types cannot share a name (ignoring capitals and spaces)", async () => {
    const t = await newSlotType();
    const { error } = await (await asRole("centre_admin")).from("rota_slot_types").insert({ name: `  ${t.name.toUpperCase()} `, slot_group: "on_call" });
    expect(error?.message).toMatch(/duplicate|unique/i);
  });

  it("slot types are never deleted, not even with the master key", async () => {
    const t = await newSlotType();
    await (await asRole("super_admin")).from("rota_slot_types").delete().eq("id", t.id);
    expect((await masterKeyClient().from("rota_slot_types").delete().eq("id", t.id)).error).not.toBeNull();
    const { data } = await masterKeyClient().from("rota_slot_types").select("id").eq("id", t.id);
    expect(data).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
describe("who can see and change prayer times", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, add or correct prayer times`, async () => {
      const month = await freeTestMonth();
      const { weekday, friday } = daysOf(month);
      const { error } = await (await asRole("centre_admin")).from("prayer_times").insert({ prayer_date: weekday, ...WINTER });
      if (error) throw error;
      const c = await who.client();
      expect((await c.from("prayer_times").select("id").eq("prayer_date", weekday)).data ?? []).toEqual([]);
      expect((await c.from("prayer_times").insert({ prayer_date: friday, ...WINTER }).select()).error).not.toBeNull();
      await c.from("prayer_times").update({ fajr: "05:00" }).eq("prayer_date", weekday);
      expect((await c.rpc("save_prayer_month", { p_month: `${month}-01`, p_days: [{ prayer_date: friday, ...WINTER }] })).error).not.toBeNull();
      const { data } = await masterKeyClient().from("prayer_times").select("prayer_date, fajr").gte("prayer_date", `${month}-01`).lte("prayer_date", `${month}-28`);
      expect(data).toEqual([{ prayer_date: weekday, fajr: "06:45:00" }]);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can add a day and correct it later, and the correction is in the audit log`, async () => {
      const month = await freeTestMonth();
      const { weekday } = daysOf(month);
      const c = await asRole(role);
      const { data, error } = await c.from("prayer_times").insert({ prayer_date: weekday, ...WINTER }).select().single();
      expect(error).toBeNull();
      expect(data!.created_by).toBe(userIdOf(seedAdmin(role).email));
      expect((await c.from("prayer_times").update({ asr: "14:00" }).eq("id", data!.id)).error).toBeNull();
      const { data: log } = await masterKeyClient()
        .from("audit_log")
        .select("action, old_values, new_values")
        .eq("table_name", "prayer_times")
        .eq("record_id", String(data!.id))
        .eq("action", "update");
      expect(log).toHaveLength(1);
      expect(log![0].old_values.asr).toBe("13:55:00");
      expect(log![0].new_values.asr).toBe("14:00:00");
    });
  }
});

describe("prayer time rules", () => {
  const insert = async (fields: Record<string, unknown>) => (await asRole("centre_admin")).from("prayer_times").insert(fields).select().single();

  it("the five prayers must be in order; Isha may fall after midnight but not after Fajr", async () => {
    const { all } = daysOf(await freeTestMonth());
    expect((await insert({ prayer_date: all[0], ...WINTER, asr: "12:00" })).error?.message).toMatch(/Asr must be after Dhuhr/);
    expect((await insert({ prayer_date: all[0], ...WINTER, dhuhr: "06:00" })).error?.message).toMatch(/Dhuhr must be after Fajr/);
    expect((await insert({ prayer_date: all[0], ...WINTER, maghrib: "13:00" })).error?.message).toMatch(/Maghrib must be after Asr/);
    expect((await insert({ prayer_date: all[0], ...WINTER, isha: "16:00" })).error?.message).toMatch(/Isha must be after Maghrib/);
    expect((await insert({ prayer_date: all[0], ...WINTER, isha: "07:00" })).error?.message).toMatch(/Isha must be after Maghrib/);
    const summer = { fajr: "02:50", dhuhr: "13:25", asr: "17:40", maghrib: "22:00", isha: "00:15" };
    expect((await insert({ prayer_date: all[1], ...summer })).error).toBeNull();
  });

  it("all five are needed, in whole minutes", async () => {
    const { all } = daysOf(await freeTestMonth());
    expect((await insert({ prayer_date: all[0], ...WINTER, isha: null })).error).not.toBeNull();
    expect((await insert({ prayer_date: all[0], ...WINTER, fajr: "06:45:30" })).error?.message).toMatch(/whole minutes/i);
  });

  it("Jumu'ah times only on a Friday, and the second after the first", async () => {
    const { friday, weekday } = daysOf(await freeTestMonth());
    expect((await insert({ prayer_date: weekday, ...WINTER, jumuah_1: "13:00" })).error?.message).toMatch(/only on a Friday/);
    expect((await insert({ prayer_date: friday, ...WINTER, jumuah_2: "14:00" })).error?.message).toMatch(/second Jumu'ah needs a first/);
    expect((await insert({ prayer_date: friday, ...WINTER, jumuah_1: "14:00", jumuah_2: "13:30" })).error?.message).toMatch(
      /Jumu'ah 2 must be after Jumu'ah 1/,
    );
    expect((await insert({ prayer_date: friday, ...WINTER, jumuah_1: "13:00", jumuah_2: "14:00" })).error).toBeNull();
  });

  it("one row per date, and a row's date can never change", async () => {
    const { all } = daysOf(await freeTestMonth());
    const first = await insert({ prayer_date: all[0], ...WINTER });
    expect(first.error).toBeNull();
    expect((await insert({ prayer_date: all[0], ...WINTER })).error?.message).toMatch(/duplicate|unique/i);
    const c = await asRole("super_admin");
    expect((await c.from("prayer_times").update({ prayer_date: all[1] }).eq("id", first.data!.id)).error?.message).toMatch(/date cannot change/i);
  });

  it("dates must be between 2000 and 2100", async () => {
    expect((await insert({ prayer_date: "1999-12-31", ...WINTER })).error).not.toBeNull();
    expect((await insert({ prayer_date: "2101-01-03", ...WINTER })).error).not.toBeNull();
  });

  it("prayer times are never deleted, not even with the master key", async () => {
    const { all } = daysOf(await freeTestMonth());
    const row = await insert({ prayer_date: all[0], ...WINTER });
    if (row.error) throw row.error;
    await (await asRole("super_admin")).from("prayer_times").delete().eq("id", row.data.id);
    expect((await masterKeyClient().from("prayer_times").delete().eq("id", row.data.id)).error).not.toBeNull();
    expect((await masterKeyClient().from("prayer_times").select("id").eq("id", row.data.id)).data).toHaveLength(1);
  });
});

describe("saving a whole month at once", () => {
  it("adds new days, corrects changed days and leaves unchanged days alone", async () => {
    const month = await freeTestMonth();
    const { friday, all: everyDay } = daysOf(month);
    // Two days that are not that Friday, so no day is sent twice.
    const all = everyDay.filter((d) => d !== friday);
    const c = await asRole("centre_admin");
    const first = await c.rpc("save_prayer_month", {
      p_month: `${month}-01`,
      p_days: [
        { prayer_date: all[0], ...WINTER },
        { prayer_date: all[1], ...WINTER },
        { prayer_date: friday, ...WINTER, jumuah_1: "13:00", jumuah_2: "14:00" },
      ],
    });
    expect(first.error).toBeNull();
    expect(first.data).toEqual({ added: 3, changed: 0 });

    const { data: before } = await masterKeyClient().from("prayer_times").select("prayer_date, updated_at").in("prayer_date", [all[0], all[1]]);
    const second = await c.rpc("save_prayer_month", {
      p_month: `${month}-01`,
      p_days: [
        { prayer_date: all[0], ...WINTER },
        { prayer_date: all[1], ...WINTER, isha: "18:10" },
      ],
    });
    expect(second.error).toBeNull();
    expect(second.data).toEqual({ added: 0, changed: 1 });
    const { data: after } = await masterKeyClient().from("prayer_times").select("prayer_date, isha, updated_at").in("prayer_date", [all[0], all[1]]);
    const was = new Map((before ?? []).map((r) => [r.prayer_date, r.updated_at]));
    const now = new Map((after ?? []).map((r) => [r.prayer_date, r]));
    expect(now.get(all[0])!.updated_at).toBe(was.get(all[0]));
    expect(hm(now.get(all[1])!.isha)).toBe("18:10");
  });

  it("one wrong day refuses the whole month, naming the day, and nothing is saved", async () => {
    const month = await freeTestMonth();
    const { all } = daysOf(month);
    const { error } = await (await asRole("centre_admin")).rpc("save_prayer_month", {
      p_month: `${month}-01`,
      p_days: [
        { prayer_date: all[0], ...WINTER },
        { prayer_date: all[2], ...WINTER, asr: "11:00" },
      ],
    });
    const label = fullDayLabel(all[2]);
    expect(error?.message).toContain(`${label}: Asr must be after Dhuhr`);
    const { count } = await masterKeyClient()
      .from("prayer_times")
      .select("id", { count: "exact", head: true })
      .gte("prayer_date", `${month}-01`)
      .lte("prayer_date", `${month}-28`);
    expect(count).toBe(0);
  });

  it("refuses days outside the month, and a month that does not start on the 1st", async () => {
    const month = await freeTestMonth();
    const c = await asRole("centre_admin");
    const next = month.endsWith("-12") ? `${Number(month.slice(0, 4)) + 1}-01-05` : `${month.slice(0, 5)}${String(Number(month.slice(5)) + 1).padStart(2, "0")}-05`;
    expect((await c.rpc("save_prayer_month", { p_month: `${month}-01`, p_days: [{ prayer_date: next, ...WINTER }] })).error?.message).toMatch(
      /not in this month/i,
    );
    expect((await c.rpc("save_prayer_month", { p_month: `${month}-02`, p_days: [] })).error?.message).toMatch(/first day of a month/i);
  });

  it("a day missing a prayer is refused (a day cannot be half-entered)", async () => {
    const month = await freeTestMonth();
    const { all } = daysOf(month);
    const { error } = await (await asRole("centre_admin")).rpc("save_prayer_month", {
      p_month: `${month}-01`,
      p_days: [{ prayer_date: all[0], ...WINTER, maghrib: null }],
    });
    expect(error?.message).toMatch(/all five prayer times/i);
  });
});
