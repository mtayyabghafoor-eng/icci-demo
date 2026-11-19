// Phase 3, slice P3.2: rota weeks, assignments and warnings (docs/PHASE-2-AND-3.md
// 5.1). Owner's choices, 18 Nov 2026 (all recommended):
//   * Super Admin and Centre Admin only.
//   * A new week starts with empty prayer slots every day and the Jumu'ah
//     slots on Friday; shifts and on call are added by hand.
//   * One person per slot. Nothing is typed over or deleted: putting someone
//     on, swapping or taking off adds a new entry that replaces the old one.
//   * A week is locked once its Sunday has passed.
//   * Warnings, never refusals: double-booking (a prayer duty lasts 30
//     minutes, Jumu'ah 60), Garda vetting not valid on that day, no prayer
//     time entered.
// All of it is enforced by the database itself, so these tests talk to it
// directly. Weeks the website can change are in 2090-2099; past weeks are
// recorded with the master key in 2020-2023 (prayer times there are added by
// these tests only).
import type { SupabaseClient } from "@supabase/supabase-js";
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

type Entry = { id: number; assignment_date: string; slot_type_id: string; person_id: string | null; replaces_id: number | null };
type Warning = { assignment_id: number; kind: string; other_assignment_id: number | null; vetting: string | null };

const randomMonday = (fromYear: number, years: number) => {
  const start = Date.UTC(fromYear, 0, 1);
  const d = new Date(start + Math.floor(Math.random() * years * 365) * 86_400_000);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

async function freeMonday(fromYear: number, years: number, noPrayerTimes = false): Promise<string> {
  for (let tries = 0; tries < 50; tries++) {
    const monday = randomMonday(fromYear, years);
    const { count } = await masterKeyClient().from("rota_weeks").select("id", { count: "exact", head: true }).eq("week_start", monday);
    if (count) continue;
    if (noPrayerTimes) {
      const pt = await masterKeyClient()
        .from("prayer_times")
        .select("id", { count: "exact", head: true })
        .gte("prayer_date", monday)
        .lte("prayer_date", addDays(monday, 6));
      if (pt.count) continue;
    }
    return monday;
  }
  throw new Error("No free test week found. Run npm run db:reset.");
}

/** A future week, started by an admin. */
async function newWeek(role = "centre_admin") {
  const week_start = await freeMonday(2090, 10);
  const { data, error } = await (await asRole(role)).from("rota_weeks").insert({ week_start }).select().single();
  if (error) throw error;
  return data as { id: string; week_start: string; status: string; created_by: string };
}

/** A week that has ended, recorded with the master key (no prayer times yet). */
async function pastWeek() {
  const week_start = await freeMonday(2020, 4, true);
  const { data, error } = await masterKeyClient().from("rota_weeks").insert({ week_start }).select().single();
  if (error) throw error;
  return data as { id: string; week_start: string };
}

async function slotType(name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("rota_slot_types").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function newPerson(roleName = "Volunteer") {
  const db = masterKeyClient();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", roleName).single(),
    db.from("sections").select("id").eq("name", "Volunteers").single(),
  ]);
  const { data, error } = await db
    .from("people")
    .insert({ full_name: testName("rota person"), person_role_id: role.data!.id, section_id: section.data!.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function entriesOf(c: SupabaseClient, weekId: string): Promise<Entry[]> {
  const { data, error } = await c.from("rota_entries").select("id, assignment_date, slot_type_id, person_id, replaces_id").eq("week_id", weekId);
  if (error) throw error;
  return (data ?? []) as Entry[];
}

async function warningsOf(weekId: string): Promise<Warning[]> {
  const { data, error } = await (await asRole("centre_admin"))
    .from("rota_warnings")
    .select("assignment_id, kind, other_assignment_id, vetting")
    .eq("week_id", weekId);
  if (error) throw error;
  return (data ?? []) as Warning[];
}

/** Adds a slot with the master key (works on past weeks too). */
async function masterSlot(fields: Record<string, unknown>) {
  const { data, error } = await masterKeyClient().from("rota_assignments").insert(fields).select("id").single();
  if (error) throw error;
  return data.id as number;
}

async function prayerSlot(weekId: string, date: string, name: string): Promise<number> {
  const id = await slotType(name);
  const { data } = await masterKeyClient().from("rota_entries").select("id").eq("week_id", weekId).eq("assignment_date", date).eq("slot_type_id", id).limit(1).single();
  return data!.id;
}

/** Puts a person on a slot with the master key; returns the new entry. */
async function masterAssign(assignmentId: number, personId: string): Promise<number> {
  // The master key has no role, so it adds the replacing entry directly.
  const db = masterKeyClient();
  const { data: old, error: readError } = await db.from("rota_assignments").select("week_id, assignment_date, slot_type_id").eq("id", assignmentId).single();
  if (readError) throw readError;
  return masterSlot({ ...old, person_id: personId, replaces_id: assignmentId });
}

const WINTER = { fajr: "06:45", dhuhr: "12:20", asr: "13:55", maghrib: "16:20", isha: "18:05" };

// ---------------------------------------------------------------------------
describe("who can see and change the rota", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, start, fill or change a rota week`, async () => {
      const week = await newWeek();
      const [slot] = await entriesOf(await asRole("centre_admin"), week.id);
      const person = await newPerson();
      const c = await who.client();
      expect((await c.from("rota_weeks").select("id").eq("id", week.id)).data ?? []).toEqual([]);
      expect((await c.from("rota_assignments").select("id").eq("week_id", week.id)).data ?? []).toEqual([]);
      expect((await c.from("rota_entries").select("id").eq("week_id", week.id)).data ?? []).toEqual([]);
      expect((await c.from("rota_warnings").select("assignment_id").eq("week_id", week.id)).data ?? []).toEqual([]);
      expect((await c.from("rota_weeks").insert({ week_start: await freeMonday(2090, 10) }).select()).error).not.toBeNull();
      expect(
        (await c.from("rota_assignments").insert({ week_id: week.id, assignment_date: week.week_start, slot_type_id: await slotType("Cleaning"), start_time: "09:00", end_time: "10:00" }).select())
          .error,
      ).not.toBeNull();
      expect((await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: person })).error).not.toBeNull();
      await c.from("rota_assignments").update({ removed_at: new Date().toISOString() }).eq("id", slot.id);
      const { data } = await masterKeyClient().from("rota_assignments").select("person_id, removed_at").eq("id", slot.id).single();
      expect(data).toEqual({ person_id: null, removed_at: null });
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can start a week, put someone on, add a shift and remove it`, async () => {
      const c = await asRole(role);
      const week = await newWeek(role);
      expect(week.status).toBe("draft");
      expect(week.created_by).toBe(userIdOf(seedAdmin(role).email));
      const [slot] = await entriesOf(c, week.id);
      const { error } = await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: await newPerson() });
      expect(error).toBeNull();
      const shift = await c
        .from("rota_assignments")
        .insert({ week_id: week.id, assignment_date: week.week_start, slot_type_id: await slotType("Cleaning"), start_time: "09:00", end_time: "11:00" })
        .select("id")
        .single();
      expect(shift.error).toBeNull();
      expect((await c.from("rota_assignments").update({ removed_at: new Date().toISOString() }).eq("id", shift.data!.id)).error).toBeNull();
    });
  }
});

describe("a new week", () => {
  it("starts with an empty slot for each prayer every day, and Jumu'ah on Friday only", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const { data: types } = await c.from("rota_slot_types").select("id, slot_group").eq("active", true).in("slot_group", ["prayer", "jumuah"]);
    const prayers = (types ?? []).filter((t) => t.slot_group === "prayer").map((t) => t.id);
    const jumuah = (types ?? []).filter((t) => t.slot_group === "jumuah").map((t) => t.id);
    const entries = await entriesOf(c, week.id);
    expect(entries).toHaveLength(prayers.length * 7 + jumuah.length);
    expect(entries.every((e) => e.person_id === null)).toBe(true);
    const friday = addDays(week.week_start, 4);
    for (const e of entries.filter((x) => jumuah.includes(x.slot_type_id))) expect(e.assignment_date).toBe(friday);
    expect(entries.filter((e) => e.assignment_date === week.week_start && prayers.includes(e.slot_type_id))).toHaveLength(prayers.length);
    expect(await slotType("Fajr")).toSatisfy((id: string) => prayers.includes(id));
  });

  it("must start on a Monday, once per week", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    expect((await c.from("rota_weeks").insert({ week_start: addDays(week.week_start, 1) })).error?.message).toMatch(/starts on a Monday/);
    expect((await c.from("rota_weeks").insert({ week_start: week.week_start })).error?.message).toMatch(/duplicate|unique/i);
  });

  it("cannot change its date, and its status changes only by publishing", async () => {
    const c = await asRole("super_admin");
    const week = await newWeek();
    expect((await c.from("rota_weeks").update({ week_start: addDays(week.week_start, 7) }).eq("id", week.id)).error?.message).toMatch(/cannot change/);
    expect((await c.from("rota_weeks").update({ status: "published" }).eq("id", week.id)).error?.message).toMatch(/only by publishing/);
    expect((await c.from("rota_weeks").insert({ week_start: await freeMonday(2090, 10), status: "published" })).error?.message).toMatch(/as a draft/);
  });
});

describe("putting people on, swapping and taking off", () => {
  it("adds a new entry that replaces the old one; the old one is marked removed with who and when", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const [slot] = await entriesOf(c, week.id);
    const a = await newPerson();
    const b = await newPerson();

    const first = await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: a });
    expect(first.error).toBeNull();
    const second = await c.rpc("assign_rota_person", { p_assignment_id: first.data, p_person_id: b });
    expect(second.error).toBeNull();
    const off = await c.rpc("assign_rota_person", { p_assignment_id: second.data, p_person_id: null });
    expect(off.error).toBeNull();

    const { data: chain } = await masterKeyClient()
      .from("rota_assignments")
      .select("id, person_id, replaces_id, removed_at, removed_by")
      .in("id", [slot.id, first.data, second.data, off.data])
      .order("id");
    expect(chain!.map((r) => r.person_id)).toEqual([null, a, b, null]);
    expect(chain!.map((r) => r.replaces_id)).toEqual([null, slot.id, first.data, second.data]);
    expect(chain!.slice(0, 3).every((r) => r.removed_at && r.removed_by === userIdOf(seedAdmin("centre_admin").email))).toBe(true);
    expect(chain![3].removed_at).toBeNull();

    const now = (await entriesOf(c, week.id)).filter((e) => e.slot_type_id === slot.slot_type_id && e.assignment_date === slot.assignment_date);
    expect(now.map((e) => e.id)).toEqual([off.data]);
  });

  it("putting the same person on again changes nothing", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const [slot] = await entriesOf(c, week.id);
    const a = await newPerson();
    const first = await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: a });
    expect((await c.rpc("assign_rota_person", { p_assignment_id: first.data, p_person_id: a })).data).toBe(first.data);
  });

  it("a replaced or removed slot cannot be changed again", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const [slot] = await entriesOf(c, week.id);
    await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: await newPerson() });
    expect((await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: await newPerson() })).error?.message).toMatch(/already removed or replaced/);
    expect((await c.from("rota_assignments").update({ removed_at: new Date().toISOString() }).eq("id", slot.id)).error?.message).toMatch(/already removed or replaced/);
  });

  it("a switched-off person cannot be put on the rota", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const [slot] = await entriesOf(c, week.id);
    const person = await newPerson();
    await masterKeyClient().from("people").update({ active: false }).eq("id", person);
    expect((await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: person })).error?.message).toMatch(/switched off/);
  });
});

describe("adding slots by hand", () => {
  const add = async (week: { id: string; week_start: string }, fields: Record<string, unknown>) =>
    (await asRole("centre_admin")).from("rota_assignments").insert({ week_id: week.id, assignment_date: week.week_start, ...fields }).select().single();

  it("a shift needs a start and an end, the end after the start", async () => {
    const week = await newWeek();
    const cleaning = await slotType("Cleaning");
    expect((await add(week, { slot_type_id: cleaning })).error?.message).toMatch(/needs a start time and an end time/);
    expect((await add(week, { slot_type_id: cleaning, start_time: "22:00", end_time: "06:00" })).error?.message).toMatch(/end time must be after/);
    expect((await add(week, { slot_type_id: cleaning, start_time: "09:00", end_time: "12:00", note: "  Main   hall  " })).data?.note).toBe("Main hall");
  });

  it("on call is all day or has both times; prayer slots take no times", async () => {
    const week = await newWeek();
    const onCall = await slotType("Funeral on call");
    expect((await add(week, { slot_type_id: onCall })).error).toBeNull();
    expect((await add(week, { slot_type_id: onCall, start_time: "09:00" })).error).not.toBeNull();
    expect((await add(week, { slot_type_id: await slotType("Fajr"), start_time: "06:00", end_time: "07:00" })).error?.message).toMatch(/from Prayer times/);
    expect((await add(week, { slot_type_id: await slotType("Fajr") })).error).toBeNull();
  });

  it("refuses a day outside the week, Jumu'ah on a weekday and a switched-off slot type", async () => {
    const week = await newWeek();
    const cleaning = await slotType("Cleaning");
    expect((await add(week, { slot_type_id: cleaning, start_time: "09:00", end_time: "10:00", assignment_date: addDays(week.week_start, 7) })).error?.message).toMatch(
      /inside that week/,
    );
    expect((await add(week, { slot_type_id: await slotType("Jumu'ah 1") })).error?.message).toMatch(/only on a Friday/);
    const { data: off } = await (await asRole("centre_admin"))
      .from("rota_slot_types")
      .insert({ name: testName("old shift"), slot_group: "shift", active: false })
      .select("id")
      .single();
    expect((await add(week, { slot_type_id: off!.id, start_time: "09:00", end_time: "10:00" })).error?.message).toMatch(/switched off/);
  });

  it("the place must be a switched-on building or room", async () => {
    const week = await newWeek();
    const cleaning = await slotType("Cleaning");
    const db = masterKeyClient();
    const building = await db.from("locations").insert({ name: testName("rota building"), kind: "building" }).select("id").single();
    const room = await db.from("locations").insert({ name: testName("rota room"), kind: "room", parent_id: building.data!.id }).select("id").single();
    const store = await db.from("locations").insert({ name: testName("rota store"), kind: "store_room", parent_id: room.data!.id }).select("id").single();
    const times = { slot_type_id: cleaning, start_time: "09:00", end_time: "10:00" };
    expect((await add(week, { ...times, location_id: room.data!.id })).error).toBeNull();
    expect((await add(week, { ...times, location_id: store.data!.id })).error?.message).toMatch(/building or a room/);
  });

  it("entries cannot be changed, only removed; nothing is ever deleted", async () => {
    const c = await asRole("super_admin");
    const week = await newWeek();
    const [slot] = await entriesOf(c, week.id);
    expect((await c.from("rota_assignments").update({ note: "changed" }).eq("id", slot.id)).error?.message).toMatch(/cannot be changed/);
    await c.from("rota_assignments").delete().eq("id", slot.id);
    expect((await masterKeyClient().from("rota_assignments").delete().eq("id", slot.id)).error).not.toBeNull();
    expect((await masterKeyClient().from("rota_weeks").delete().eq("id", week.id)).error).not.toBeNull();
    expect((await masterKeyClient().from("rota_assignments").select("id").eq("id", slot.id)).data).toHaveLength(1);
  });
});

describe("a week that has ended is locked", () => {
  it("an admin cannot start it, fill it, add to it or remove from it", async () => {
    const week = await pastWeek();
    const c = await asRole("super_admin");
    const [slot] = await entriesOf(c, week.id);
    expect((await c.from("rota_weeks").insert({ week_start: await freeMonday(2020, 4) })).error?.message).toMatch(/has ended/);
    expect((await c.rpc("assign_rota_person", { p_assignment_id: slot.id, p_person_id: await newPerson() })).error?.message).toMatch(/has ended/);
    expect(
      (await c.from("rota_assignments").insert({ week_id: week.id, assignment_date: week.week_start, slot_type_id: await slotType("Cleaning"), start_time: "09:00", end_time: "10:00" }))
        .error?.message,
    ).toMatch(/has ended/);
    expect((await c.from("rota_assignments").update({ removed_at: new Date().toISOString() }).eq("id", slot.id)).error?.message).toMatch(/has ended/);
  });
});

// ---------------------------------------------------------------------------
describe("warnings (worked out, never refusals)", () => {
  it("double-booking: the same person on overlapping duties that day, both ways; a prayer duty lasts 30 minutes", async () => {
    const week = await pastWeek();
    const day = week.week_start;
    await masterKeyClient().from("prayer_times").insert({ prayer_date: day, ...WINTER });
    const person = await newPerson("Board member"); // needs no vetting, so only double-booking shows
    const dhuhr = await masterAssign(await prayerSlot(week.id, day, "Dhuhr"), person); // 12:20-12:50
    const security = await masterSlot({ week_id: week.id, assignment_date: day, slot_type_id: await slotType("Cleaning"), person_id: person, start_time: "12:45", end_time: "14:00" });
    const later = await masterSlot({ week_id: week.id, assignment_date: day, slot_type_id: await slotType("Cleaning"), person_id: person, start_time: "16:30", end_time: "17:00" });

    const w = (await warningsOf(week.id)).filter((x) => x.kind === "double_booked");
    expect(w).toEqual(
      expect.arrayContaining([
        { assignment_id: dhuhr, kind: "double_booked", other_assignment_id: security, vetting: null },
        { assignment_id: security, kind: "double_booked", other_assignment_id: dhuhr, vetting: null },
      ]),
    );
    expect(w).toHaveLength(2); // 16:30 Cleaning clashes with nothing (Maghrib is unfilled)
    expect(w.some((x) => x.assignment_id === later)).toBe(false);
  });

  it("vetting: a slot or role that needs it warns unless a vetting covers that day", async () => {
    const week = await pastWeek();
    const day = addDays(week.week_start, 2);
    const security = await slotType("Security");
    const cleaning = await slotType("Cleaning");
    const db = masterKeyClient();
    const slot = (person: string, type: string, start: string) =>
      masterSlot({ week_id: week.id, assignment_date: day, slot_type_id: type, person_id: person, start_time: start, end_time: addMinutes(start, 30) });

    const neverVetted = await newPerson("Board member");
    const vetted = await newPerson("Board member");
    await db.from("vetting_records").insert({ person_id: vetted, kind: "vetted", happened_on: "2019-01-01", expires_on: addDays(day, 1) });
    const expired = await newPerson("Board member");
    await db.from("vetting_records").insert({ person_id: expired, kind: "vetted", happened_on: "2017-01-01", expires_on: addDays(day, -1) });
    const roleNeeds = await newPerson("Volunteer");
    const roleFree = await newPerson("Board member");

    const a = await slot(neverVetted, security, "08:00");
    const b = await slot(vetted, security, "08:00");
    const c = await slot(expired, security, "08:00");
    const d = await slot(roleNeeds, cleaning, "08:00");
    const e = await slot(roleFree, cleaning, "08:00");

    const v = new Map((await warningsOf(week.id)).filter((x) => x.kind === "vetting").map((x) => [x.assignment_id, x.vetting]));
    expect(v.get(a)).toBe("none");
    expect(v.has(b)).toBe(false);
    expect(v.get(c)).toBe("expired");
    expect(v.get(d)).toBe("none");
    expect(v.has(e)).toBe(false);
  });

  it("a prayer slot on a day with no prayer time entered is pointed out, until the time is entered", async () => {
    const week = await pastWeek();
    const before = (await warningsOf(week.id)).filter((x) => x.kind === "no_prayer_time");
    const { count } = await masterKeyClient().from("rota_entries").select("id", { count: "exact", head: true }).eq("week_id", week.id).in("slot_group", ["prayer", "jumuah"]);
    expect(before).toHaveLength(count!);
    const friday = addDays(week.week_start, 4);
    await masterKeyClient().from("prayer_times").insert({ prayer_date: friday, ...WINTER, jumuah_1: "13:00" });
    const after = (await warningsOf(week.id)).filter((x) => x.kind === "no_prayer_time");
    const jumuah2 = await prayerSlot(week.id, friday, "Jumu'ah 2");
    const fajrFriday = await prayerSlot(week.id, friday, "Fajr");
    expect(after.some((x) => x.assignment_id === jumuah2)).toBe(true); // no second Jumu'ah time that Friday
    expect(after.some((x) => x.assignment_id === fajrFriday)).toBe(false);
  });
});

function addMinutes(hhmm: string, minutes: number): string {
  const total = Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)) + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
