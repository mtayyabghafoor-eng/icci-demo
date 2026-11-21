import { describe, expect, it } from "vitest";
import { checkDayTimes, isFriday } from "@/lib/rota/rules";
import {
  labelSerial,
  SEED_ADMINS,
  SEED_LABEL_COUNT,
  SEED_LOCATIONS,
  seedAssetEvents,
  seedItems,
  seedPrayerDay,
  seedPrayerMonths,
  seedRotaPlan,
  SEED_PEOPLE,
  seedStock,
  SEED_TRAINING_TYPES,
  seedTraining,
  seedVetting,
  SEED_TYPED_RENEWALS,
  SEED_LIBRARY_FIRST_LABEL,
  SEED_LIBRARY_LABEL_COUNT,
  seedLibrary,
  SEED_BORROWERS,
  seedLoans,
  SEED_VEHICLES,
} from "../../scripts/seed-data.mts";
import { readFileSync } from "node:fs";
import { normaliseIsbn } from "@/lib/library/rules";

describe("seed data is obviously fictional", () => {
  it("every email uses the reserved .test domain (can never reach a real inbox)", () => {
    for (const a of SEED_ADMINS) expect(a.email).toMatch(/@icci-prototype\.test$/);
  });

  it('every name starts with "Test "', () => {
    for (const a of SEED_ADMINS) expect(a.displayName).toMatch(/^Test /);
    for (const l of SEED_LOCATIONS) expect(l.name).toMatch(/^Test /);
  });

  it("only uses roles from the plan", () => {
    const allowed = ["super_admin", "centre_admin", "finance", "library_operator"];
    for (const a of SEED_ADMINS) expect(allowed).toContain(a.role);
  });

  it("includes two active centre admins, so 'nobody approves their own entry' can be tested", () => {
    expect(SEED_ADMINS.filter((a) => a.role === "centre_admin" && a.active)).toHaveLength(2);
  });
});

describe("seed locations", () => {
  const byName = new Map(SEED_LOCATIONS.map((l) => [l.name, l]));
  const parentKind = { building: null, room: "building", store_room: "room", shelf: "store_room" } as const;

  it("has 15 locations with unique names", () => {
    expect(SEED_LOCATIONS).toHaveLength(15);
    expect(byName.size).toBe(15);
  });

  it("follows building > room > store room > shelf", () => {
    for (const l of SEED_LOCATIONS) {
      const parent = l.parent ? byName.get(l.parent) : null;
      expect(parent?.kind ?? null).toBe(parentKind[l.kind]);
    }
  });

  it("lists every parent before its children (so the seed can insert in order)", () => {
    SEED_LOCATIONS.forEach((l, i) => {
      if (l.parent) expect(SEED_LOCATIONS.findIndex((p) => p.name === l.parent)).toBeLessThan(i);
    });
  });
});

describe("seed items and labels", () => {
  const items = seedItems();
  const places = new Map(SEED_LOCATIONS.map((l) => [l.name, l.kind]));

  it("creates at least 200 items across all 15 locations (PLAN.md acceptance check)", () => {
    expect(items.length).toBeGreaterThanOrEqual(200);
    expect(new Set(items.map((i) => i.location)).size).toBe(15);
  });

  it('every item name starts with "Test "', () => {
    for (const i of items) expect(i.name).toMatch(/^Test /);
  });

  it("each label is used once, and some printed labels are left free", () => {
    const labels = items.map((i) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.length).toBeLessThan(SEED_LABEL_COUNT);
    for (const l of labels) expect(l).toMatch(/^ICCI-\d{6}$/);
  });

  it("consumables are only in store rooms or on shelves, with a unit and minimum", () => {
    for (const i of items.filter((x) => x.kind === "consumable")) {
      expect(["store_room", "shelf"]).toContain(places.get(i.location));
      expect(i.unit).toBeTruthy();
      expect(i.minimumLevel).toBeGreaterThanOrEqual(0);
    }
  });

  it("no two consumables with the same name share a place", () => {
    const keys = items.filter((x) => x.kind === "consumable").map((i) => `${i.location}|${i.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  // P1.17: every seed item and vehicle names a sub-category that migration
  // 0041 creates (the seed looks categories up by name).
  it("every item and vehicle is in a sub-category from the starting list", () => {
    const sql = readFileSync("supabase/migrations/0041_two_level_categories.sql", "utf8");
    for (const name of new Set([...items.map((i) => i.category), ...SEED_VEHICLES.map((v) => v.category)])) {
      expect(sql, name).toContain(`'${name}'`);
    }
  });

  it("gives the new sub-categories something to count: air conditioners, lawnmowers, a gate", () => {
    const inCat = (c: string) => items.filter((i) => i.category === c);
    expect(inCat("Air conditioners").length).toBeGreaterThanOrEqual(8);
    expect(inCat("Air conditioners").some((i) => i.condition === "damaged")).toBe(true);
    expect(inCat("Lawnmowers").length).toBeGreaterThanOrEqual(2);
    expect(inCat("Automatic gates and barriers").length).toBeGreaterThanOrEqual(1);
  });

  it("labelSerial pads to six digits", () => {
    expect(labelSerial(7)).toBe("ICCI-000007");
  });
});

describe("seed stock (slice 5)", () => {
  const consumables = seedItems().filter((i) => i.kind === "consumable");
  const plans = consumables.map((c, i) => ({ c, plan: seedStock(i, c.minimumLevel!) }));

  it("leaves some consumables not counted yet, and counts the rest twice with a restock between", () => {
    const counted = plans.filter((p) => p.plan);
    expect(counted.length).toBeGreaterThan(consumables.length / 2);
    expect(counted.length).toBeLessThan(consumables.length);
    for (const { plan } of counted) {
      expect(plan!.restock).toBeGreaterThan(0);
      expect(plan!.firstCount).toBeGreaterThanOrEqual(0);
      expect(plan!.secondCount).toBeGreaterThanOrEqual(0);
    }
  });

  it("gives the low-stock list something to show: some low, some out, most in stock", () => {
    const finals = plans.filter((p) => p.plan).map((p) => ({ q: p.plan!.secondCount, min: p.c.minimumLevel! }));
    expect(finals.some((f) => f.q === 0)).toBe(true);
    expect(finals.some((f) => f.q > 0 && f.q <= f.min)).toBe(true);
    expect(finals.filter((f) => f.q > f.min).length).toBeGreaterThan(finals.length / 2);
  });
});

describe("seed asset events (slice 6)", () => {
  const items = seedItems();
  const events = seedAssetEvents(items);
  const itemOf = new Map(items.map((i) => [i.label, i]));

  it("are all for fixed assets, with fictional notes and reporters", () => {
    expect(events.length).toBeGreaterThan(10);
    for (const e of events) {
      expect(itemOf.get(e.label)?.kind).toBe("fixed_asset");
      expect(e.note).toMatch(/^Test /);
      expect(e.reportedBy).toMatch(/^Test /);
    }
  });

  it("give every damaged and missing seed asset its report", () => {
    for (const i of items.filter((x) => x.condition === "damaged" || x.condition === "missing")) {
      expect(events.some((e) => e.label === i.label && e.kind === (i.condition === "damaged" ? "damage" : "missing"))).toBe(true);
    }
  });

  it("move only to a different location, and include exactly two disposals waiting", () => {
    for (const e of events.filter((x) => x.kind === "move")) expect(e.toLocation).not.toBe(itemOf.get(e.label)!.location);
    expect(events.filter((e) => e.kind === "disposal")).toHaveLength(2);
    expect(events.some((e) => e.kind === "back_in_use")).toBe(true);
  });
});

describe("seed Garda vetting (P2.3)", () => {
  const plan = seedVetting();
  const person = new Map(SEED_PEOPLE.map((p) => [p.full_name, p]));

  it("goes only to switched-on seed people, never into the future, with expiry after the vetting", () => {
    expect(plan.length).toBeGreaterThan(20);
    for (const v of plan) {
      const p = person.get(v.full_name)!;
      expect(p.full_name).toMatch(/^Test /);
      expect(p.active).toBe(true);
      expect(v.ago).toBeGreaterThanOrEqual(0);
      if (v.kind === "vetted") expect(v.expiresIn! + v.ago).toBeGreaterThan(0);
      else expect(v.expiresIn).toBeUndefined();
    }
  });

  it("gives every status: valid, due soon, expired, applied, nothing, not required", () => {
    const vetted = plan.filter((v) => v.kind === "vetted");
    expect(vetted.some((v) => v.expiresIn! > 60)).toBe(true);
    expect(vetted.some((v) => v.expiresIn! >= 0 && v.expiresIn! <= 60)).toBe(true);
    expect(vetted.some((v) => v.expiresIn! < 0)).toBe(true);
    const names = new Set(plan.map((v) => v.full_name));
    expect(plan.some((v) => v.kind === "applied" && !vetted.some((x) => x.full_name === v.full_name))).toBe(true);
    expect(plan.some((v) => v.kind === "not_required")).toBe(true);
    expect(SEED_PEOPLE.some((p) => p.active && !["Board member", "Contractor"].includes(p.role) && !names.has(p.full_name))).toBe(true);
  });
});

describe("seed training (P2.4)", () => {
  const plan = seedTraining();
  const person = new Map(SEED_PEOPLE.map((p) => [p.full_name, p]));

  it("goes only to switched-on seed people, never into the future, with expiry after the date done", () => {
    expect(plan.length).toBeGreaterThan(30);
    for (const t of plan) {
      const p = person.get(t.full_name)!;
      expect(p.full_name).toMatch(/^Test /);
      expect(p.active).toBe(true);
      expect(SEED_TRAINING_TYPES).toContain(t.type);
      expect(t.ago).toBeGreaterThanOrEqual(0);
      if (t.expiresIn !== null) {
        expect(t.expiresIn + t.ago).toBeGreaterThan(0);
        expect(t.expiresIn + t.ago).toBeLessThanOrEqual(10 * 365);
      }
    }
  });

  it("gives every status (valid, due soon, expired, no expiry) and leaves some people with nothing", () => {
    // The newest course of each person and type is what counts.
    const newest = new Map<string, (typeof plan)[number]>();
    for (const t of plan) {
      const key = `${t.full_name}|${t.type}`;
      if (!newest.has(key) || newest.get(key)!.ago > t.ago) newest.set(key, t);
    }
    const left = [...newest.values()].map((t) => t.expiresIn);
    expect(left.some((d) => d !== null && d > 60)).toBe(true);
    expect(left.some((d) => d !== null && d >= 0 && d <= 60)).toBe(true);
    expect(left.some((d) => d !== null && d < 0)).toBe(true);
    expect(left.some((d) => d === null)).toBe(true);
    const names = new Set(plan.map((t) => t.full_name));
    expect(SEED_PEOPLE.some((p) => p.active && !names.has(p.full_name))).toBe(true);
  });
});

describe("seed renewals (P2.8)", () => {
  it('are titled "Test ..." and made up, with owners who are switched-on seed people', () => {
    const on = new Set(SEED_PEOPLE.filter((p) => p.active).map((p) => p.full_name));
    for (const r of SEED_TYPED_RENEWALS) {
      expect(r.title).toMatch(/^Test .*\(made up\)$/);
      if (r.owner) expect(on.has(r.owner), r.owner).toBe(true);
    }
    expect(new Set(SEED_TYPED_RENEWALS.map((r) => r.title)).size).toBe(SEED_TYPED_RENEWALS.length);
  });
  it("show overdue, due soon and up to date; a renewal is never in the future", () => {
    const due = SEED_TYPED_RENEWALS.map((r) => r.renewed?.nextDueIn ?? r.dueIn);
    expect(due.some((d) => d < 0)).toBe(true);
    expect(due.some((d) => d >= 0 && d <= 60)).toBe(true);
    expect(due.some((d) => d > 60)).toBe(true);
    for (const r of SEED_TYPED_RENEWALS) if (r.renewed) expect(r.renewed.ago).toBeGreaterThanOrEqual(0);
  });
});

describe("seed prayer times (P3.1)", () => {
  it("covers every day of this month and next month, across a new year too", () => {
    const nov = seedPrayerMonths("2026-11-18");
    expect(nov[0]).toBe("2026-11-01");
    expect(nov.at(-1)).toBe("2026-12-31");
    expect(nov).toHaveLength(61);
    const dec = seedPrayerMonths("2026-12-05");
    expect(dec[0]).toBe("2026-12-01");
    expect(dec.at(-1)).toBe("2027-01-31");
  });

  it("every day of a whole year passes the same checks as the database, with Jumu'ah on Fridays only", () => {
    for (let i = 0; i < 366; i++) {
      const iso = new Date(Date.UTC(2028, 0, 1 + i)).toISOString().slice(0, 10);
      const day = seedPrayerDay(iso);
      expect(checkDayTimes(iso, day), iso).toBeNull();
      expect(day.jumuah_1 !== null, iso).toBe(isFriday(iso));
      expect(day.jumuah_2 !== null, iso).toBe(isFriday(iso));
    }
  });
});

describe("seed rota weeks (P3.2)", () => {
  const plan = seedRotaPlan();
  it("uses only the starting slot types, days of one week, and shifts that end after they start", () => {
    const names = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha", "Jumu'ah 1", "Jumu'ah 2", "Security", "Cleaning", "Reception", "Volunteers", "Funeral on call"];
    for (const s of plan) {
      expect(names).toContain(s.slot);
      expect(s.day).toBeGreaterThanOrEqual(0);
      expect(s.day).toBeLessThanOrEqual(6);
      if (s.slot.startsWith("Jumu'ah")) expect(s.day).toBe(4);
      if (s.start || s.end) expect(s.end! > s.start!).toBe(true);
      if (["Security", "Cleaning", "Reception"].includes(s.slot)) expect(s.start).toBeDefined();
    }
  });
  it("leaves some slots empty and plans one vetting warning and one double-booking", () => {
    expect(plan.some((s) => s.who === null)).toBe(true);
    expect(plan.filter((s) => s.who === "unvetted")).toHaveLength(1);
    const wednesday = plan.filter((s) => s.day === 2 && s.who === "vetted");
    const reception = wednesday.find((s) => s.slot === "Reception")!;
    expect(wednesday.some((s) => s.slot === "Dhuhr" && s.pick === reception.pick)).toBe(true);
  });
});

describe("seed library (slice P4.2)", () => {
  const books = seedLibrary();

  it("has 60 books in English, Arabic and other languages", () => {
    expect(books).toHaveLength(60);
    expect(books.filter((b) => b.language === "en")).toHaveLength(40);
    expect(books.filter((b) => b.language === "ar")).toHaveLength(15);
    expect(books.filter((b) => b.language === "other")).toHaveLength(5);
  });

  it("every title and author is obviously made up", () => {
    for (const b of books) {
      expect(b.title, b.title).toMatch(/\(made up\)$|\(تجريبي\)$/);
      if (b.author) expect(b.author, b.author).toMatch(/^Test |^تجريبي /);
    }
  });

  it("titles are all different, and every ISBN has a correct check digit", () => {
    expect(new Set(books.map((b) => b.title)).size).toBe(books.length);
    const isbns = books.flatMap((b) => (b.isbn ? [b.isbn] : []));
    expect(new Set(isbns).size).toBe(isbns.length);
    for (const i of isbns) expect(normaliseIsbn(i)).toEqual({ ok: true, isbn: i });
  });

  it("90 copies, each on its own label in the library's range, none on an item's label", () => {
    const labels = books.flatMap((b) => b.copies.map((c) => c.label));
    expect(labels).toHaveLength(SEED_LIBRARY_LABEL_COUNT);
    expect(new Set(labels).size).toBe(labels.length);
    const numbers = labels.map((l) => Number(l.slice(5)));
    expect(Math.min(...numbers)).toBe(SEED_LIBRARY_FIRST_LABEL);
    expect(Math.max(...numbers)).toBe(SEED_LIBRARY_FIRST_LABEL + SEED_LIBRARY_LABEL_COUNT - 1);
    expect(SEED_LIBRARY_FIRST_LABEL).toBeGreaterThan(SEED_LABEL_COUNT);
  });
});

describe("seed borrowers and loans (slice P4.4)", () => {
  it("are obviously fictional: Test names, phones with area code 00, .test emails", () => {
    expect(SEED_BORROWERS).toHaveLength(25);
    for (const b of SEED_BORROWERS) {
      expect(b.full_name.startsWith("Test ")).toBe(true);
      if (b.contact_kind === "phone") expect(b.contact).toMatch(/^\+353 00 /);
      else expect(b.contact).toMatch(/@icci-prototype\.test$/);
    }
    expect(new Set(SEED_BORROWERS.map((b) => b.full_name)).size).toBe(25);
  });

  it("use each copy once, only seed library labels, and never more than 3 books out", () => {
    const loans = seedLoans();
    expect(new Set(loans.map((l) => l.label)).size).toBe(loans.length);
    const last = SEED_LIBRARY_FIRST_LABEL + SEED_LIBRARY_LABEL_COUNT - 1;
    for (const l of loans) expect(Number(l.label.slice(5))).toBeLessThanOrEqual(last);
    const out = new Map<string, number>();
    for (const l of loans) {
      const open = l.then.filter((e) => e.kind === "returned").length === l.then.filter((e) => e.kind === "return_undone").length;
      if (open) out.set(l.borrower, (out.get(l.borrower) ?? 0) + 1);
    }
    expect(Math.max(...out.values())).toBe(3);
    const off = SEED_BORROWERS.filter((b) => !b.active).map((b) => b.full_name);
    for (const name of off) expect(out.get(name) ?? 0).toBe(0);
  });

  it("cover every state: on loan, overdue, returned on time and late, moved, returned by mistake", () => {
    const loans = seedLoans();
    expect(loans.some((l) => l.then.length === 0 && l.due >= 0)).toBe(true);
    expect(loans.some((l) => l.then.length === 0 && l.due < 0)).toBe(true);
    expect(loans.some((l) => l.then.some((e) => e.kind === "returned" && e.on <= l.due))).toBe(true);
    expect(loans.some((l) => l.then.some((e) => e.kind === "returned" && e.on > l.due))).toBe(true);
    expect(loans.some((l) => l.then.some((e) => e.kind === "due_moved"))).toBe(true);
    expect(loans.some((l) => l.then.some((e) => e.kind === "return_undone"))).toBe(true);
    for (const l of loans) {
      expect(l.due).toBeGreaterThanOrEqual(l.lent);
      for (const e of l.then) expect(e.on).toBeGreaterThanOrEqual(l.lent);
      for (const e of l.then) expect(e.on).toBeLessThanOrEqual(0);
    }
  });
});
