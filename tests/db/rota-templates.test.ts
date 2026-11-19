// Phase 3, slice P3.4: rota templates and funeral on call
// (docs/PHASE-2-AND-3.md 5.1). Owner's choices, 18 Nov 2026 (all recommended):
//   * A template holds only the extra slots: shifts, on call, and extra
//     people on a prayer. Prayers and Jumu'ah still come by themselves.
//   * Exactly four templates (Normal week, Ramadan, Eid al-Fitr, Eid
//     al-Adha); their slots can be added and switched off, never deleted.
//     The two Eid templates are one-day templates: "use" asks for the day.
//   * Funeral on call: one whole-day slot each day in the Normal week (and
//     Ramadan), needing Garda vetting.
//   * "Use this template" adds empty slots to a week, and refuses once
//     anyone is on a slot that week, so it never overwrites a week.
// All of it is enforced by the database itself, so these tests talk to it
// directly. Test templates are made with the master key (admins cannot add
// templates) and named "Test run ..."; weeks are in 2090-2099 (future) or
// 2020-2023 (ended).
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { addDays } from "@/lib/vetting/rules";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

const randomMonday = (fromYear: number, years: number) => {
  const d = new Date(Date.UTC(fromYear, 0, 1) + Math.floor(Math.random() * years * 365) * 86_400_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

async function freeMonday(fromYear: number, years: number): Promise<string> {
  for (let tries = 0; tries < 50; tries++) {
    const monday = randomMonday(fromYear, years);
    const { count } = await masterKeyClient().from("rota_weeks").select("id", { count: "exact", head: true }).eq("week_start", monday);
    if (!count) return monday;
  }
  throw new Error("No free test week found. Run npm run db:reset.");
}

async function newWeek(role = "centre_admin") {
  const week_start = await freeMonday(2090, 10);
  const { data, error } = await (await asRole(role)).from("rota_weeks").insert({ week_start }).select().single();
  if (error) throw error;
  return data as { id: string; week_start: string };
}

const typeIds = new Map<string, string>();
async function slotType(name: string): Promise<string> {
  if (!typeIds.has(name)) {
    const { data, error } = await masterKeyClient().from("rota_slot_types").select("id").eq("name", name).single();
    if (error) throw error;
    typeIds.set(name, data.id);
  }
  return typeIds.get(name)!;
}

async function templateId(name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("rota_templates").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

/** A test template of its own (master key), so tests never touch the four real ones. */
async function testTemplate(kind: "week" | "day" = "week") {
  const { data, error } = await masterKeyClient()
    .from("rota_templates")
    .insert({ name: testName(`template ${kind}`), kind })
    .select("id, name, kind")
    .single();
  if (error) throw error;
  return data as { id: string; name: string; kind: string };
}

async function addTemplateSlot(templateId: string, row: Record<string, unknown>) {
  const { data, error } = await (await asRole("centre_admin"))
    .from("rota_template_slots")
    .insert({ template_id: templateId, ...row })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as number;
}

async function entries(weekId: string) {
  const { data, error } = await masterKeyClient()
    .from("rota_entries")
    .select("id, assignment_date, slot_type_id, slot_group, starts_at, ends_at, person_id, note")
    .eq("week_id", weekId);
  if (error) throw error;
  return data ?? [];
}

async function newPerson() {
  const db = masterKeyClient();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", "Board member").single(),
    db.from("sections").select("id").eq("name", "Volunteers").single(),
  ]);
  const { data, error } = await db
    .from("people")
    .insert({ full_name: testName("rota template person"), person_role_id: role.data!.id, section_id: section.data!.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

// ---------------------------------------------------------------------------
describe("the four templates", () => {
  it("are there, two for a week and two for one day (Eid)", async () => {
    const c = await asRole("centre_admin");
    const { data } = await c.from("rota_templates").select("name, kind").eq("active", true).not("name", "like", "Test run %").order("display_order");
    expect(data).toEqual([
      { name: "Normal week", kind: "week" },
      { name: "Ramadan", kind: "week" },
      { name: "Eid al-Fitr", kind: "day" },
      { name: "Eid al-Adha", kind: "day" },
    ]);
  });

  it("Normal week has funeral on call all day, every day, needing vetting", async () => {
    const c = await asRole("centre_admin");
    const funeral = await slotType("Funeral on call");
    const { data } = await c
      .from("rota_template_slots")
      .select("day_of_week, start_time, end_time, people_count")
      .eq("template_id", await templateId("Normal week"))
      .eq("slot_type_id", funeral)
      .eq("active", true)
      .order("day_of_week");
    expect(data).toEqual([1, 2, 3, 4, 5, 6, 7].map((d) => ({ day_of_week: d, start_time: null, end_time: null, people_count: 1 })));
    const type = await c.from("rota_slot_types").select("needs_vetting, slot_group").eq("id", funeral).single();
    expect(type.data).toEqual({ needs_vetting: true, slot_group: "on_call" });
  });

  it("an admin cannot add, rename or switch off a template (the four are fixed)", async () => {
    const c = await asRole("super_admin");
    expect((await c.from("rota_templates").insert({ name: testName("my template"), kind: "week" }).select()).error).not.toBeNull();
    const id = await templateId("Ramadan");
    const renamed = await c.from("rota_templates").update({ name: "Summer" }).eq("id", id).select();
    expect(renamed.error !== null || (renamed.data ?? []).length === 0).toBe(true);
    const off = await c.from("rota_templates").update({ active: false }).eq("id", id).select();
    expect(off.error !== null || (off.data ?? []).length === 0).toBe(true);
    expect((await masterKeyClient().from("rota_templates").select("name, active").eq("id", id).single()).data).toEqual({ name: "Ramadan", active: true });
  });
});

describe("who can see and use templates", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, edit or use templates`, async () => {
      const t = await testTemplate();
      const slot = await addTemplateSlot(t.id, { day_of_week: 2, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
      const week = await newWeek();
      const c = await who.client();
      expect((await c.from("rota_templates").select("id")).data ?? []).toEqual([]);
      expect((await c.from("rota_template_slots").select("id")).data ?? []).toEqual([]);
      expect((await c.from("rota_template_uses").select("id")).data ?? []).toEqual([]);
      expect(
        (await c.from("rota_template_slots").insert({ template_id: t.id, day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" }).select())
          .error,
      ).not.toBeNull();
      const off = await c.from("rota_template_slots").update({ active: false }).eq("id", slot).select();
      expect(off.error !== null || (off.data ?? []).length === 0).toBe(true);
      expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: t.id })).error).not.toBeNull();
      expect((await c.from("rota_template_uses").insert({ week_id: week.id, template_id: t.id }).select()).error).not.toBeNull();
      expect((await entries(week.id)).filter((e) => e.slot_group === "shift")).toHaveLength(0);
      expect((await masterKeyClient().from("rota_template_slots").select("active").eq("id", slot).single()).data?.active).toBe(true);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can read the templates, add a slot and switch it off and on`, async () => {
      const c = await asRole(role);
      const t = await testTemplate();
      const { data, error } = await c
        .from("rota_template_slots")
        .insert({ template_id: t.id, day_of_week: 3, slot_type_id: await slotType("Reception"), start_time: "10:00", end_time: "16:00", people_count: 2 })
        .select("id, created_by")
        .single();
      expect(error).toBeNull();
      expect(data!.created_by).toBe(userIdOf(seedAdmin(role).email));
      expect((await c.from("rota_template_slots").update({ active: false }).eq("id", data!.id).select()).error).toBeNull();
      expect((await c.from("rota_template_slots").update({ active: true }).eq("id", data!.id).select()).error).toBeNull();
      expect((await c.from("rota_templates").select("id").eq("id", t.id)).data).toHaveLength(1);
    });
  }
});

describe("template slots", () => {
  it("are never deleted, even with the master key; only switching off or on is a change", async () => {
    const t = await testTemplate();
    const id = await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    const c = await asRole("centre_admin");
    await c.from("rota_template_slots").delete().eq("id", id);
    await masterKeyClient().from("rota_template_slots").delete().eq("id", id);
    expect((await masterKeyClient().from("rota_template_slots").select("id").eq("id", id)).data).toHaveLength(1);
    const moved = await c.from("rota_template_slots").update({ start_time: "08:00" }).eq("id", id).select();
    expect(moved.error?.message).toMatch(/switch it off and add a new one/i);
    const master = await masterKeyClient().from("rota_template_slots").update({ day_of_week: 2 }).eq("id", id).select();
    expect(master.error?.message).toMatch(/switch it off and add a new one/i);
  });

  it("refuses what the rota itself would refuse", async () => {
    const week = await testTemplate("week");
    const day = await testTemplate("day");
    const c = await asRole("centre_admin");
    const add = (row: Record<string, unknown>) => c.from("rota_template_slots").insert(row).select();
    const security = await slotType("Security");
    const isha = await slotType("Isha");
    const jumuah = await slotType("Jumu'ah 1");
    const funeral = await slotType("Funeral on call");

    expect((await add({ template_id: week.id, slot_type_id: security, start_time: "18:00", end_time: "22:00" })).error?.message).toMatch(/day of the week/);
    expect((await add({ template_id: week.id, day_of_week: 8, slot_type_id: security, start_time: "18:00", end_time: "22:00" })).error).not.toBeNull();
    expect((await add({ template_id: day.id, day_of_week: 2, slot_type_id: security, start_time: "18:00", end_time: "22:00" })).error?.message).toMatch(/one-day template/);
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: security })).error?.message).toMatch(/start time and an end time/);
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: security, start_time: "22:00", end_time: "18:00" })).error?.message).toMatch(/after the start/);
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: isha, start_time: "18:00", end_time: "19:00" })).error?.message).toMatch(/Prayer times/);
    expect((await add({ template_id: week.id, day_of_week: 2, slot_type_id: jumuah })).error?.message).toMatch(/Friday/);
    expect((await add({ template_id: day.id, slot_type_id: jumuah })).error?.message).toMatch(/Jumu'ah/);
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: funeral, start_time: "09:00" })).error?.message).toMatch(/or neither/);
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: funeral, people_count: 0 })).error).not.toBeNull();
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: funeral, people_count: 21 })).error).not.toBeNull();

    // Allowed: on call all day, an extra person on a prayer, Jumu'ah on Friday, a one-day shift.
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: funeral })).error).toBeNull();
    expect((await add({ template_id: week.id, day_of_week: 1, slot_type_id: isha, note: "Second person" })).error).toBeNull();
    expect((await add({ template_id: week.id, day_of_week: 5, slot_type_id: jumuah })).error).toBeNull();
    expect((await add({ template_id: day.id, slot_type_id: security, start_time: "07:00", end_time: "12:00", people_count: 2 })).error).toBeNull();
  });
});

describe("using a template", () => {
  it("adds empty slots to the week, as many as each template slot asks for", async () => {
    const t = await testTemplate();
    await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Security"), start_time: "18:00", end_time: "22:00", people_count: 2 });
    await addTemplateSlot(t.id, { day_of_week: 7, slot_type_id: await slotType("Funeral on call"), note: "Test run note" });
    await addTemplateSlot(t.id, { day_of_week: 3, slot_type_id: await slotType("Isha") });
    const off = await addTemplateSlot(t.id, { day_of_week: 2, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    await (await asRole("centre_admin")).from("rota_template_slots").update({ active: false }).eq("id", off);

    const week = await newWeek();
    const before = await entries(week.id);
    const c = await asRole("centre_admin");
    const { data: added, error } = await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: t.id });
    expect(error).toBeNull();
    expect(added).toBe(4);
    const after = await entries(week.id);
    expect(after).toHaveLength(before.length + 4);
    const fresh = after.filter((e) => !before.some((b) => b.id === e.id));
    expect(fresh.every((e) => e.person_id === null)).toBe(true);
    const security = fresh.filter((e) => e.slot_type_id === typeIds.get("Security"));
    expect(security.map((e) => [e.assignment_date, e.starts_at, e.ends_at])).toEqual([
      [week.week_start, "18:00:00", "22:00:00"],
      [week.week_start, "18:00:00", "22:00:00"],
    ]);
    const funeral = fresh.find((e) => e.slot_type_id === typeIds.get("Funeral on call"))!;
    expect([funeral.assignment_date, funeral.starts_at, funeral.note]).toEqual([addDays(week.week_start, 6), null, "Test run note"]);
    expect(fresh.find((e) => e.slot_type_id === typeIds.get("Isha"))!.assignment_date).toBe(addDays(week.week_start, 2));
    expect(fresh.some((e) => e.slot_type_id === typeIds.get("Cleaning"))).toBe(false);

    const { data: uses } = await c.from("rota_template_uses").select("template_id, used_by, slots_added, on_day").eq("week_id", week.id);
    expect(uses).toEqual([{ template_id: t.id, used_by: userIdOf(seedAdmin("centre_admin").email), slots_added: 4, on_day: null }]);
  });

  it("the Normal week fills a week with shifts and funeral on call every day", async () => {
    const week = await newWeek("super_admin");
    const c = await asRole("super_admin");
    const { data: added, error } = await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: await templateId("Normal week") });
    expect(error).toBeNull();
    expect(added).toBeGreaterThan(20);
    const funeralId = await slotType("Funeral on call");
    const all = await entries(week.id);
    const onCall = all.filter((e) => e.slot_type_id === funeralId);
    expect(onCall.map((e) => e.assignment_date).sort()).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => addDays(week.week_start, d)));
    expect(onCall.every((e) => e.starts_at === null && e.person_id === null)).toBe(true);
    expect(all.filter((e) => e.slot_group === "shift").length).toBeGreaterThan(10);
  });

  it("refuses once anyone is on a slot that week, so it never overwrites a week", async () => {
    const t = await testTemplate();
    await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    const week = await newWeek();
    const c = await asRole("centre_admin");
    const [fajr] = (await entries(week.id)).filter((e) => e.slot_group === "prayer");
    expect((await c.rpc("assign_rota_person", { p_assignment_id: fajr.id, p_person_id: await newPerson() })).error).toBeNull();
    const before = await entries(week.id);
    const refused = await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: t.id });
    expect(refused.error?.message).toMatch(/already has people on it/);
    expect(await entries(week.id)).toHaveLength(before.length);
    // Even with the master key.
    const master = await masterKeyClient().from("rota_template_uses").insert({ week_id: week.id, template_id: t.id }).select();
    expect(master.error?.message).toMatch(/already has people on it/);
  });

  it("one week template per week; the same Eid template once per week", async () => {
    const a = await testTemplate("week");
    const b = await testTemplate("week");
    const eid = await testTemplate("day");
    for (const t of [a, b]) await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    await addTemplateSlot(eid.id, { slot_type_id: await slotType("Security"), start_time: "07:00", end_time: "12:00", people_count: 3 });
    const week = await newWeek();
    const c = await asRole("centre_admin");
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: a.id })).error).toBeNull();
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: a.id })).error?.message).toMatch(/already has the .* template/);
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: b.id })).error?.message).toMatch(/already has the .* template/);
    // An Eid day on top of the week template.
    const thursday = addDays(week.week_start, 3);
    const { data: added, error } = await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: eid.id, p_day: thursday });
    expect(error).toBeNull();
    expect(added).toBe(3);
    const eidSlots = (await entries(week.id)).filter((e) => e.slot_type_id === typeIds.get("Security"));
    expect(eidSlots.map((e) => e.assignment_date)).toEqual([thursday, thursday, thursday]);
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: eid.id, p_day: addDays(week.week_start, 4) })).error?.message).toMatch(
      /already has the .* template/,
    );
  });

  it("an Eid template needs a day inside the week; a week template takes none", async () => {
    const eid = await testTemplate("day");
    const weekly = await testTemplate("week");
    await addTemplateSlot(eid.id, { slot_type_id: await slotType("Security"), start_time: "07:00", end_time: "12:00" });
    await addTemplateSlot(weekly.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    const week = await newWeek();
    const c = await asRole("centre_admin");
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: eid.id })).error?.message).toMatch(/which day/);
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: eid.id, p_day: addDays(week.week_start, 7) })).error?.message).toMatch(/inside that week/);
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: weekly.id, p_day: week.week_start })).error?.message).toMatch(/whole week/);
  });

  it("refuses a week that has ended, a missing week and a template with nothing on", async () => {
    const t = await testTemplate();
    await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    const empty = await testTemplate();
    const c = await asRole("centre_admin");
    const old = await masterKeyClient().from("rota_weeks").insert({ week_start: await freeMonday(2020, 4) }).select("id").single();
    expect((await c.rpc("use_rota_template", { p_week_id: old.data!.id, p_template_id: t.id })).error?.message).toMatch(/has ended/);
    expect((await c.rpc("use_rota_template", { p_week_id: "00000000-0000-0000-0000-000000000000", p_template_id: t.id })).error?.message).toMatch(/does not exist/);
    const week = await newWeek();
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: empty.id })).error?.message).toMatch(/no slots switched on/);
  });

  it("a use is kept for good: it cannot be changed or deleted, even with the master key", async () => {
    const t = await testTemplate();
    await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    const week = await newWeek();
    const c = await asRole("centre_admin");
    expect((await c.rpc("use_rota_template", { p_week_id: week.id, p_template_id: t.id })).error).toBeNull();
    const { data: use } = await masterKeyClient().from("rota_template_uses").select("id").eq("week_id", week.id).single();
    expect((await masterKeyClient().from("rota_template_uses").update({ slots_added: 99 }).eq("id", use!.id).select()).error?.message).toMatch(/cannot be changed/);
    await masterKeyClient().from("rota_template_uses").delete().eq("id", use!.id);
    expect((await masterKeyClient().from("rota_template_uses").select("slots_added").eq("id", use!.id).single()).data?.slots_added).toBe(1);
  });

  it("forged fields are overwritten: who used it and how many slots were added", async () => {
    const t = await testTemplate();
    await addTemplateSlot(t.id, { day_of_week: 1, slot_type_id: await slotType("Cleaning"), start_time: "07:00", end_time: "09:00" });
    const week = await newWeek();
    const c = await asRole("centre_admin");
    const { data, error } = await c
      .from("rota_template_uses")
      .insert({ week_id: week.id, template_id: t.id, used_by: userIdOf(seedAdmin("super_admin").email), slots_added: 50 })
      .select("used_by, slots_added")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ used_by: userIdOf(seedAdmin("centre_admin").email), slots_added: 1 });
  });
});
