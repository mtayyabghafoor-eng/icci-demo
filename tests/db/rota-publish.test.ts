// Phase 3, slice P3.3: publishing a rota week (docs/PHASE-2-AND-3.md 5.1).
// Owner's choices, 18 Nov 2026 (all recommended):
//   * Super Admin and Centre Admin only; the admin who built the week may
//     publish it (publishing a rota is not an approval).
//   * A week can be published again; every publication is kept, never
//     changed or deleted, with a frozen copy (names and roles only).
//   * Warnings showing: the admin must tick "I have seen the warnings".
//   * Changed since publishing: slots added, swapped or emptied after the
//     latest publication; slots taken off are listed as removed.
//   * Home page: today's slots and how many are not filled.
// All of it is enforced by the database itself, so these tests talk to it
// directly. Weeks are in 2090-2099 (future) or 2020-2023 (ended, recorded
// with the master key).
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

type Frozen = {
  week_start: string;
  previous_publication_id: number | null;
  entries: { id: number; date: string; slot: string; person: string | null; person_role: string | null; changed: boolean; [k: string]: unknown }[];
  removed: { id: number; slot: string; person: string | null }[];
};
type Publication = {
  id: number;
  week_id: string;
  published_by: string;
  published_at: string;
  seen_warnings: boolean;
  warning_count: number;
  change_count: number;
  frozen_copy: Frozen;
};

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

/** Prayer times for every day of the week, so no "no prayer time" warnings. */
async function addPrayerTimes(monday: string) {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    prayer_date: addDays(monday, i),
    fajr: "06:45",
    dhuhr: "12:20",
    asr: "13:55",
    maghrib: "16:20",
    isha: "18:05",
    ...(i === 4 ? { jumuah_1: "13:00", jumuah_2: "14:00" } : {}),
  }));
  const { error } = await masterKeyClient().from("prayer_times").upsert(rows, { onConflict: "prayer_date" });
  if (error) throw error;
}

/** A future week started by an admin. With `quiet`, prayer times are entered so it has no warnings. */
async function newWeek(role = "centre_admin", quiet = true) {
  const week_start = await freeMonday(2090, 10);
  if (quiet) await addPrayerTimes(week_start);
  const { data, error } = await (await asRole(role)).from("rota_weeks").insert({ week_start }).select().single();
  if (error) throw error;
  return data as { id: string; week_start: string; status: string };
}

async function slotType(name: string): Promise<string> {
  const { data, error } = await masterKeyClient().from("rota_slot_types").select("id").eq("name", name).single();
  if (error) throw error;
  return data.id;
}

async function newPerson(roleName = "Board member", phone: string | null = null) {
  const db = masterKeyClient();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", roleName).single(),
    db.from("sections").select("id").eq("name", "Volunteers").single(),
  ]);
  const full_name = testName("rota publish person");
  const { data, error } = await db
    .from("people")
    .insert({ full_name, person_role_id: role.data!.id, section_id: section.data!.id, phone })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string, full_name };
}

async function firstSlot(weekId: string, slotName = "Fajr"): Promise<number> {
  const { data, error } = await masterKeyClient()
    .from("rota_entries")
    .select("id")
    .eq("week_id", weekId)
    .eq("slot_type_id", await slotType(slotName))
    .order("assignment_date")
    .limit(1)
    .single();
  if (error) throw error;
  return data.id;
}

async function publications(weekId: string): Promise<Publication[]> {
  const { data, error } = await masterKeyClient().from("rota_publications").select("*").eq("week_id", weekId).order("id");
  if (error) throw error;
  return (data ?? []) as Publication[];
}

async function statusOf(weekId: string) {
  return (await masterKeyClient().from("rota_weeks").select("status").eq("id", weekId).single()).data?.status;
}

async function changes(c: SupabaseClient, weekId: string) {
  const { data, error } = await c.from("rota_changes").select("kind, assignment_id").eq("week_id", weekId);
  if (error) throw error;
  return (data ?? []) as { kind: string; assignment_id: number }[];
}

// ---------------------------------------------------------------------------
describe("who can publish", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot publish, read publications or see changes`, async () => {
      const week = await newWeek();
      const admin = await asRole("centre_admin");
      expect((await admin.rpc("publish_rota_week", { p_week_id: week.id })).error).toBeNull();
      const c = await who.client();
      expect((await c.from("rota_publications").select("id").eq("week_id", week.id)).data ?? []).toEqual([]);
      expect((await c.from("rota_changes").select("assignment_id").eq("week_id", week.id)).data ?? []).toEqual([]);
      expect((await c.rpc("publish_rota_week", { p_week_id: week.id, p_seen_warnings: true })).error).not.toBeNull();
      expect((await c.from("rota_publications").insert({ week_id: week.id, seen_warnings: true }).select()).error).not.toBeNull();
      expect(await publications(week.id)).toHaveLength(1);
    });
  }

  for (const role of ["super_admin", "centre_admin"]) {
    it(`${role} can publish a week they built; it becomes published`, async () => {
      const c = await asRole(role);
      const week = await newWeek(role);
      expect(week.status).toBe("draft");
      const { data: id, error } = await c.rpc("publish_rota_week", { p_week_id: week.id });
      expect(error).toBeNull();
      const [pub] = await publications(week.id);
      expect(pub.id).toBe(id);
      expect(pub.published_by).toBe(userIdOf(seedAdmin(role).email));
      expect(pub.warning_count).toBe(0);
      expect(pub.change_count).toBe(0);
      expect(pub.frozen_copy.week_start).toBe(week.week_start);
      expect(pub.frozen_copy.previous_publication_id).toBeNull();
      expect(pub.frozen_copy.entries.length).toBeGreaterThan(30);
      expect(pub.frozen_copy.entries.every((e) => e.changed === false)).toBe(true);
      expect(await statusOf(week.id)).toBe("published");
    });
  }
});

describe("publishing", () => {
  it("with warnings showing, needs the tick; the number of warnings is kept", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek("centre_admin", false); // no prayer times: every prayer slot warns
    const refused = await c.rpc("publish_rota_week", { p_week_id: week.id });
    expect(refused.error?.message).toMatch(/I have seen the warnings/);
    expect(await statusOf(week.id)).toBe("draft");
    expect(await publications(week.id)).toHaveLength(0);
    const { count } = await c.from("rota_warnings").select("assignment_id", { count: "exact", head: true }).eq("week_id", week.id);
    expect((await c.rpc("publish_rota_week", { p_week_id: week.id, p_seen_warnings: true })).error).toBeNull();
    const [pub] = await publications(week.id);
    expect(pub.seen_warnings).toBe(true);
    expect(pub.warning_count).toBe(count);
  });

  it("the frozen copy has names and roles, never phone numbers", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const person = await newPerson("Board member", "+353 1 555 0199");
    const slot = await firstSlot(week.id);
    const { data: newId } = await c.rpc("assign_rota_person", { p_assignment_id: slot, p_person_id: person.id });
    expect((await c.rpc("publish_rota_week", { p_week_id: week.id })).error).toBeNull();
    const [pub] = await publications(week.id);
    const entry = pub.frozen_copy.entries.find((e) => e.id === newId)!;
    expect(entry.person).toBe(person.full_name);
    expect(entry.person_role).toBe("Board member");
    expect(entry.slot).toBe("Fajr");
    // The whole made-up number, not just "555": a record number can be 555 (20 Nov 2026).
    expect(JSON.stringify(pub.frozen_copy)).not.toMatch(/555 ?0199|phone|email/i);
  });

  it("whatever the screen sends, the database works out who, when, warnings and the copy", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const { error } = await c.from("rota_publications").insert({
      week_id: week.id,
      published_by: userIdOf(seedAdmin("super_admin").email),
      published_at: "2001-01-01T00:00:00Z",
      warning_count: 99,
      change_count: 99,
      frozen_copy: { entries: [] },
    });
    expect(error).toBeNull();
    const [pub] = await publications(week.id);
    expect(pub.published_by).toBe(userIdOf(seedAdmin("centre_admin").email));
    expect(pub.published_at.slice(0, 4)).not.toBe("2001");
    expect(pub.warning_count).toBe(0);
    expect(pub.change_count).toBe(0);
    expect(pub.frozen_copy.entries.length).toBeGreaterThan(30);
  });

  it("a publication can never be changed or deleted, even with the master key", async () => {
    const c = await asRole("super_admin");
    const week = await newWeek();
    await c.rpc("publish_rota_week", { p_week_id: week.id });
    const [pub] = await publications(week.id);
    expect((await c.from("rota_publications").update({ warning_count: 5 }).eq("id", pub.id).select()).data ?? []).toEqual([]);
    expect((await c.from("rota_publications").delete().eq("id", pub.id).select()).data ?? []).toEqual([]);
    const db = masterKeyClient();
    expect((await db.from("rota_publications").update({ warning_count: 5 }).eq("id", pub.id)).error?.message).toMatch(/cannot be changed/);
    expect((await db.from("rota_publications").delete().eq("id", pub.id)).error?.message).toMatch(/cannot be deleted/);
    expect((await publications(week.id))[0]).toEqual(pub);
  });

  it("the week's status changes only by publishing, and never back to draft", async () => {
    const c = await asRole("super_admin");
    const week = await newWeek();
    expect((await c.from("rota_weeks").update({ status: "published" }).eq("id", week.id)).error?.message).toMatch(/only by publishing/);
    expect((await masterKeyClient().from("rota_weeks").update({ status: "published" }).eq("id", week.id)).error?.message).toMatch(/only by publishing/);
    await c.rpc("publish_rota_week", { p_week_id: week.id });
    expect((await c.from("rota_weeks").update({ status: "draft" }).eq("id", week.id)).error?.message).toMatch(/only by publishing/);
    expect((await masterKeyClient().from("rota_weeks").update({ status: "draft" }).eq("id", week.id)).error?.message).toMatch(/only by publishing/);
    expect(await statusOf(week.id)).toBe("published");
  });

  it("a week that has ended cannot be published by an admin", async () => {
    const week_start = await freeMonday(2020, 4);
    const { data: week } = await masterKeyClient().from("rota_weeks").insert({ week_start }).select("id").single();
    const c = await asRole("centre_admin");
    const { error } = await c.rpc("publish_rota_week", { p_week_id: week!.id, p_seen_warnings: true });
    expect(error?.message).toMatch(/has ended/);
    expect(await publications(week!.id)).toHaveLength(0);
  });

  it("a week that does not exist cannot be published", async () => {
    const c = await asRole("centre_admin");
    const { error } = await c.rpc("publish_rota_week", { p_week_id: "00000000-0000-4000-8000-000000000000" });
    expect(error).not.toBeNull();
  });
});

describe("changed since publishing", () => {
  it("a week never published shows no changes", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    await c.rpc("assign_rota_person", { p_assignment_id: await firstSlot(week.id), p_person_id: (await newPerson()).id });
    expect(await changes(c, week.id)).toEqual([]);
  });

  it("changing one name after publishing marks exactly that slot; the next publication freezes it", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    const first = await newPerson();
    const second = await newPerson();
    const fajr = await firstSlot(week.id, "Fajr");
    const { data: withFirst } = await c.rpc("assign_rota_person", { p_assignment_id: fajr, p_person_id: first.id });
    await c.rpc("publish_rota_week", { p_week_id: week.id });
    expect(await changes(c, week.id)).toEqual([]);

    // Swap, then swap again before publishing: still one changed slot.
    const { data: middle } = await c.rpc("assign_rota_person", { p_assignment_id: withFirst, p_person_id: second.id });
    const { data: withSecond } = await c.rpc("assign_rota_person", { p_assignment_id: middle, p_person_id: null });
    const { data: finalId } = await c.rpc("assign_rota_person", { p_assignment_id: withSecond, p_person_id: second.id });
    expect(await changes(c, week.id)).toEqual([{ kind: "changed", assignment_id: finalId }]);

    // Publish again (a different admin this time is fine, so is the same one).
    expect((await c.rpc("publish_rota_week", { p_week_id: week.id })).error).toBeNull();
    const [pub1, pub2] = await publications(week.id);
    expect(pub2.frozen_copy.previous_publication_id).toBe(pub1.id);
    expect(pub2.change_count).toBe(1);
    const changed = pub2.frozen_copy.entries.filter((e) => e.changed);
    expect(changed.map((e) => [e.id, e.person])).toEqual([[finalId, second.full_name]]);
    expect(pub2.frozen_copy.removed).toEqual([]);
    expect(await changes(c, week.id)).toEqual([]);
    expect(await statusOf(week.id)).toBe("published");
    // The first publication still shows the first name.
    expect(pub1.frozen_copy.entries.find((e) => e.id === withFirst)?.person).toBe(first.full_name);
  });

  it("a slot added after publishing is changed; a slot taken off is listed as removed with who was on it", async () => {
    const c = await asRole("super_admin");
    const week = await newWeek("super_admin");
    const person = await newPerson();
    const cleaning = await slotType("Cleaning");
    const shift = await c
      .from("rota_assignments")
      .insert({ week_id: week.id, assignment_date: week.week_start, slot_type_id: cleaning, start_time: "09:00", end_time: "11:00" })
      .select("id")
      .single();
    const { data: filled } = await c.rpc("assign_rota_person", { p_assignment_id: shift.data!.id, p_person_id: person.id });
    await c.rpc("publish_rota_week", { p_week_id: week.id });

    // Swap then remove the shift; add another one.
    const { data: swapped } = await c.rpc("assign_rota_person", { p_assignment_id: filled, p_person_id: null });
    await c.from("rota_assignments").update({ removed_at: new Date().toISOString() }).eq("id", swapped);
    const added = await c
      .from("rota_assignments")
      .insert({ week_id: week.id, assignment_date: addDays(week.week_start, 2), slot_type_id: cleaning, start_time: "14:00", end_time: "15:00" })
      .select("id")
      .single();
    const now = await changes(c, week.id);
    expect(now).toHaveLength(2);
    expect(now).toContainEqual({ kind: "removed", assignment_id: filled });
    expect(now).toContainEqual({ kind: "changed", assignment_id: added.data!.id });

    await c.rpc("publish_rota_week", { p_week_id: week.id });
    const [, pub2] = await publications(week.id);
    expect(pub2.change_count).toBe(2);
    expect(pub2.frozen_copy.removed.map((r) => [r.id, r.slot, r.person])).toEqual([[filled, "Cleaning", person.full_name]]);
    expect(pub2.frozen_copy.entries.filter((e) => e.changed).map((e) => e.id)).toEqual([added.data!.id]);
  });

  it("a published week can still be changed before it ends", async () => {
    const c = await asRole("centre_admin");
    const week = await newWeek();
    await c.rpc("publish_rota_week", { p_week_id: week.id });
    const { error } = await c.rpc("assign_rota_person", { p_assignment_id: await firstSlot(week.id), p_person_id: (await newPerson()).id });
    expect(error).toBeNull();
  });
});

describe("home page: today's rota", () => {
  it("counts today's slots and those not filled, the same as the rota itself", async () => {
    const c = await asRole("centre_admin");
    const { data, error } = await c.rpc("home_counters").single<{ rota_today: number; rota_today_unfilled: number }>();
    expect(error).toBeNull();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin" }).format(new Date());
    const { data: rows } = await c.from("rota_entries").select("person_id").eq("assignment_date", today);
    expect(data!.rota_today).toBe((rows ?? []).length);
    expect(data!.rota_today_unfilled).toBe((rows ?? []).filter((r) => r.person_id === null).length);
  });
});
