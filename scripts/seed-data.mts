// Made-up seed data only (CLAUDE.md: never real names, phones or documents).
// Every email uses the reserved ".test" domain, which can never receive mail.

export type SeedAdmin = { email: string; displayName: string; role: string; active: boolean };

export const SEED_ADMINS: SeedAdmin[] = [
  { email: "super.admin@icci-prototype.test", displayName: "Test Super Admin", role: "super_admin", active: true },
  { email: "centre.admin@icci-prototype.test", displayName: "Test Centre Admin", role: "centre_admin", active: true },
  { email: "second.admin@icci-prototype.test", displayName: "Test Second Admin", role: "centre_admin", active: true },
  { email: "finance@icci-prototype.test", displayName: "Test Finance Officer", role: "finance", active: true },
  // Slice P5.2: a second Super Admin and a second Finance account, both
  // linked to their People records, so expense claims can be approved in
  // tests by every role (an approver must be linked, question 2A). The
  // first Super Admin and Finance accounts stay unlinked, so the "not
  // linked yet" note and linking on screen can still be tried.
  { email: "super.two@icci-prototype.test", displayName: "Test Second Super Admin", role: "super_admin", active: true },
  { email: "finance.two@icci-prototype.test", displayName: "Test Second Finance Officer", role: "finance", active: true },
  // Used only by the permission tests: proves the library role sees nothing
  // outside the library (Phase 4), and a switched-off account sees nothing.
  { email: "library@icci-prototype.test", displayName: "Test Library Operator", role: "library_operator", active: true },
  { email: "deactivated@icci-prototype.test", displayName: "Test Deactivated Admin", role: "centre_admin", active: false },
  // Slice P4.1: proves a switched-off Library Operator gets nothing, even
  // with a genuine emailed code.
  { email: "library.off@icci-prototype.test", displayName: "Test Former Library Operator", role: "library_operator", active: false },
];

export function seedAdmin(role: string, active = true): SeedAdmin {
  const found = SEED_ADMINS.find((a) => a.role === role && a.active === active);
  if (!found) throw new Error(`No seed account with role ${role} (active: ${active})`);
  return found;
}

// 15 fictional locations: building > room > store room > shelf.
// "parent" is the name of the parent location (names are unique in this list).
export type SeedLocation = { name: string; kind: "building" | "room" | "store_room" | "shelf"; parent: string | null };

export const SEED_LOCATIONS: SeedLocation[] = [
  { name: "Test Building A", kind: "building", parent: null },
  { name: "Test Building B", kind: "building", parent: null },
  { name: "Test Room A1", kind: "room", parent: "Test Building A" },
  { name: "Test Room A2", kind: "room", parent: "Test Building A" },
  { name: "Test Room B1", kind: "room", parent: "Test Building B" },
  { name: "Test Store Room A1-1", kind: "store_room", parent: "Test Room A1" },
  { name: "Test Store Room A2-1", kind: "store_room", parent: "Test Room A2" },
  { name: "Test Store Room B1-1", kind: "store_room", parent: "Test Room B1" },
  { name: "Test Shelf A1-1-1", kind: "shelf", parent: "Test Store Room A1-1" },
  { name: "Test Shelf A1-1-2", kind: "shelf", parent: "Test Store Room A1-1" },
  { name: "Test Shelf A1-1-3", kind: "shelf", parent: "Test Store Room A1-1" },
  { name: "Test Shelf A2-1-1", kind: "shelf", parent: "Test Store Room A2-1" },
  { name: "Test Shelf A2-1-2", kind: "shelf", parent: "Test Store Room A2-1" },
  { name: "Test Shelf B1-1-1", kind: "shelf", parent: "Test Store Room B1-1" },
  { name: "Test Shelf B1-1-2", kind: "shelf", parent: "Test Store Room B1-1" },
];

// ---------------------------------------------------------------------------
// Slice 4: 300 fictional labels and 220 fictional items.
// Labels ICCI-000001 to ICCI-000220 are on items; P1.17 adds 36 more
// (221 to 256: air conditioners, lawnmowers, gates, CCTV and so on, so the
// new sub-categories have something in them); 257 to 296 are left free
// (297 to 299 hold the made-up vehicles, P2.7)
// so "scan an unassigned label" can be tried by hand.
// Categories are sub-category names from migration 0041 (P1.17): every
// item sits in a sub-category, and names are unique across the list.
export const SEED_LABEL_COUNT = 300;

export function labelSerial(n: number): string {
  return `ICCI-${String(n).padStart(6, "0")}`;
}

export type SeedItem = {
  label: string;
  kind: "fixed_asset" | "consumable";
  name: string;
  category: string;
  location: string;
  condition?: "good" | "fair" | "damaged" | "missing";
  valueCents?: number;
  purchaseDate?: string;
  warrantyEnd?: string;
  unit?: string;
  minimumLevel?: number;
};

const FIXED: [name: string, category: string, valueCents: number][] = [
  ["Test folding chair", "Chairs", 2500],
  ["Test table", "Tables", 8000],
  ["Test bookcase", "Shelving and cupboards", 12000],
  ["Test prayer carpet section", "Carpets and rugs", 40000],
  ["Test speaker", "Sound system", 15000],
  ["Test microphone", "Sound system", 9000],
  ["Test projector", "Projectors", 45000],
  ["Test laptop", "Computers and laptops", 70000],
  ["Test kettle", "Urns and water boilers", 3500],
  ["Test ladder", "Ladders", 9000],
  ["Test vacuum cleaner", "Vacuum cleaners", 20000],
  ["Test Quran stand", "Quran stands", 1500],
];

// P1.17: equipment for the new sub-categories, on labels 221 onwards (after
// the consumables, so no earlier label changes). [name, sub-category,
// value, how many, condition of each in turn].
type Condition = "good" | "fair" | "damaged" | "missing";
const EQUIPMENT: [name: string, category: string, valueCents: number, count: number, conditions: Condition[]][] = [
  ["Test wall air conditioner", "Air conditioners", 90000, 8, ["good", "good", "fair", "damaged", "good", "good", "fair", "good"]],
  ["Test ceiling air conditioner", "Air conditioners", 150000, 2, ["good", "damaged"]],
  ["Test lawnmower", "Lawnmowers", 45000, 3, ["good", "damaged", "fair"]],
  ["Test strimmer", "Strimmers and hedge cutters", 18000, 2, ["good", "good"]],
  ["Test leaf blower", "Leaf blowers", 15000, 1, ["fair"]],
  ["Test main entrance gate", "Automatic gates and barriers", 800000, 1, ["good"]],
  ["Test car park barrier", "Automatic gates and barriers", 350000, 1, ["damaged"]],
  ["Test CCTV camera", "CCTV", 25000, 4, ["good", "good", "missing", "good"]],
  ["Test CCTV recorder", "CCTV", 60000, 1, ["good"]],
  ["Test fire extinguisher", "Fire alarms and extinguishers", 6000, 3, ["good", "good", "good"]],
  ["Test defibrillator", "Defibrillators and first aid", 150000, 1, ["good"]],
  ["Test fridge", "Fridges and freezers", 70000, 2, ["good", "fair"]],
  ["Test water heater", "Water heaters", 40000, 2, ["good", "damaged"]],
  ["Test printer", "Printers and copiers", 30000, 1, ["good"]],
  ["Test Wi-Fi access point", "Network and Wi-Fi", 12000, 2, ["good", "good"]],
  ["Test prayer-time display", "Prayer-time displays", 50000, 1, ["good"]],
  ["Test janazah bier", "Funeral (janazah and ghusl) equipment", 60000, 1, ["good"]],
];

const CONSUMABLE: [name: string, category: string, unit: string, minimumLevel: number][] = [
  ["Test bin bags", "Cleaning supplies", "roll", 10],
  ["Test hand soap", "Cleaning supplies", "bottle", 6],
  ["Test paper towels", "Cleaning supplies", "pack", 8],
  ["Test printer paper", "Stationery", "ream", 5],
  ["Test pens", "Stationery", "box", 3],
  ["Test tea bags", "Kitchen supplies", "box", 4],
  ["Test paper cups", "Kitchen supplies", "pack", 10],
];

/**
 * The made-up items. `small` (the online demo, owner's choice 22 Nov 2026):
 * about 70 instead of 256, so lists look like a real Centre, not a test run.
 * Label numbers still run on from 1, so tickets on labels 10, 20 and 30
 * still find their item.
 */
export function seedItems(options: { small?: boolean } = {}): SeedItem[] {
  const small = options.small === true;
  const items: SeedItem[] = [];
  let label = 1;
  const fixedPlaces = SEED_LOCATIONS.filter((l) => l.kind !== "shelf").map((l) => l.name);
  const stockPlaces = SEED_LOCATIONS.filter((l) => l.kind === "store_room" || l.kind === "shelf").map((l) => l.name);
  const counters = new Map<string, number>();

  for (let i = 0; i < (small ? 36 : 150); i++) {
    const [base, category, valueCents] = FIXED[i % FIXED.length];
    const count = (counters.get(base) ?? 0) + 1;
    counters.set(base, count);
    const year = 2018 + (i % 9);
    const month = String((i % 12) + 1).padStart(2, "0");
    const condition = i % 23 === 5 ? "missing" : i % 17 === 3 ? "damaged" : i % 7 === 1 ? "fair" : "good";
    items.push({
      label: labelSerial(label++),
      kind: "fixed_asset",
      name: `${base} ${String(count).padStart(2, "0")}`,
      category,
      location: fixedPlaces[i % fixedPlaces.length],
      condition,
      valueCents,
      purchaseDate: `${year}-${month}-15`,
      warrantyEnd: i % 3 === 0 ? `${year + 2}-${month}-15` : undefined,
    });
  }

  for (const place of small ? stockPlaces.filter((_, k) => k % 2 === 0) : stockPlaces) {
    for (const [name, category, unit, minimumLevel] of small ? CONSUMABLE.slice(0, 4) : CONSUMABLE) {
      items.push({ label: labelSerial(label++), kind: "consumable", name, category, location: place, unit, minimumLevel });
    }
  }

  // P1.17: the equipment, spread over the rooms and buildings.
  let spot = 0;
  for (const [base, category, valueCents, count, conditions] of EQUIPMENT) {
    for (let n = 1; n <= (small ? Math.ceil(count / 2) : count); n++) {
      const year = 2019 + (spot % 7);
      const month = String((spot % 12) + 1).padStart(2, "0");
      items.push({
        label: labelSerial(label++),
        kind: "fixed_asset",
        name: `${base} ${String(n).padStart(2, "0")}`,
        category,
        location: fixedPlaces[(spot * 5) % fixedPlaces.length],
        condition: conditions[(n - 1) % conditions.length],
        valueCents,
        purchaseDate: `${year}-${month}-10`,
        // Most are still under a made-up warranty; some have ended.
        warrantyEnd: spot % 3 === 2 ? undefined : `${year + (spot % 2 === 0 ? 8 : 3)}-${month}-10`,
      });
      spot++;
    }
  }
  return items;
}

// ---------------------------------------------------------------------------
// Slice 5: made-up stock for the consumables. Every 8th one is left
// "not counted yet". The rest get: a first count, a restock, a second count.
// About one in six ends low, one in eleven ends out, the rest in stock.
export type SeedStockPlan = { firstCount: number; restock: number; secondCount: number };

export function seedStock(index: number, minimumLevel: number): SeedStockPlan | null {
  if (index % 8 === 7) return null;
  const firstCount = minimumLevel + 2 + (index % 5);
  const restock = 5 + (index % 4) * 5;
  let secondCount: number;
  if (index % 11 === 3) secondCount = 0;
  else if (index % 6 === 2) secondCount = Math.max(1, minimumLevel - (index % 3));
  else secondCount = minimumLevel + 3 + (index % 7);
  return { firstCount, restock, secondCount: Math.min(secondCount, firstCount + restock) };
}

// ---------------------------------------------------------------------------
// Slice 6: made-up moves, damage and missing reports, repairs and two
// disposals waiting for approval. Every reporter and note starts "Test ".
// Damaged and missing seed assets get a matching report (they are inserted
// as "good" and the report changes them, as in real use).
export type SeedAssetEvent = {
  label: string;
  kind: "move" | "damage" | "missing" | "back_in_use" | "disposal";
  /** Slice P1.14: how a disposal leaves (and, for a sale, its made-up details). */
  disposal?: { route: string; recipient?: string; sale?: { cents: number; buyer: string; daysAgo: number; takenBy: string } };
  note: string;
  reportedBy: string;
  toLocation?: string;
  toCondition?: "good" | "fair";
};

const SEED_REPORTERS = ["Test caretaker", "Test volunteer", "Test receptionist", "Test security guard"];

export function seedAssetEvents(items: SeedItem[] = seedItems()): SeedAssetEvent[] {
  const events: SeedAssetEvent[] = [];
  const fixedPlaces = SEED_LOCATIONS.filter((l) => l.kind !== "shelf").map((l) => l.name);
  let disposals = 0;
  items
    .filter((i) => i.kind === "fixed_asset")
    .forEach((item, i) => {
      const reportedBy = SEED_REPORTERS[i % SEED_REPORTERS.length];
      const healthy = item.condition === "good" || item.condition === "fair";
      if (healthy && i % 13 === 6) {
        const to = fixedPlaces[(fixedPlaces.indexOf(item.location) + 1) % fixedPlaces.length];
        events.push({ label: item.label, kind: "move", note: "Test move: needed for a made-up event", reportedBy, toLocation: to });
      }
      if (item.condition === "damaged") {
        events.push({ label: item.label, kind: "damage", note: "Test report: made-up damage found at the weekly check", reportedBy });
      }
      if (item.condition === "missing") {
        events.push({ label: item.label, kind: "missing", note: "Test report: not in its room at the weekly check", reportedBy });
      }
      if (healthy && i % 19 === 10) {
        events.push({ label: item.label, kind: "damage", note: "Test report: made-up scratch on the top", reportedBy });
        events.push({
          label: item.label,
          kind: "back_in_use",
          note: "Test repair: polished and checked",
          reportedBy,
          toCondition: item.condition as "good" | "fair",
        });
      }
      if (item.condition === "good" && i % 31 === 8 && disposals < 2) {
        disposals++;
        events.push({
          label: item.label,
          kind: "disposal",
          note: "Test disposal: made-up, beyond repair",
          reportedBy,
          disposal:
            disposals === 1
              ? { route: "sold", sale: { cents: 1500, buyer: "Test Buyer (made up)", daysAgo: 2, takenBy: "Test Treasurer (made up)" } }
              : { route: "charity", recipient: "Test Charity Shop (made up)" },
        });
      }
    });
  return events;
}

// ---------------------------------------------------------------------------
// Phase 2, slice P2.1: the people directory. The starting lists are the ones
// in migration 0017 (owner's choice, 15 Nov 2026). 40 made-up people: every
// name starts with "Test" and ends with an obviously invented surname; emails
// use the reserved ".test" domain; phones use area code 00, which does not
// exist in Ireland, so no number can reach a real phone.
export const SEED_PERSON_ROLES: { name: string; needs_vetting: boolean }[] = [
  { name: "Imam", needs_vetting: true },
  { name: "Staff", needs_vetting: true },
  { name: "Security", needs_vetting: true },
  { name: "Cleaner", needs_vetting: true },
  { name: "Caretaker", needs_vetting: true },
  { name: "Gardener", needs_vetting: true },
  { name: "Reception", needs_vetting: true },
  { name: "Volunteer", needs_vetting: true },
  { name: "Board member", needs_vetting: false },
  { name: "Contractor", needs_vetting: false },
];

export const SEED_SECTIONS = [
  "Administration",
  "Prayer halls",
  "Women's section",
  "Security",
  "Cleaning",
  "Reception",
  "Shop",
  "Restaurant",
  "Maintenance",
  "Volunteers",
];

export type SeedPerson = {
  full_name: string;
  role: string;
  section: string;
  phone: string | null;
  email: string | null;
  start_date: string | null;
  active: boolean;
  /** P2.2: the seed admin account (email) this person is linked to, if any. */
  account?: string;
};

const FIRST_NAMES = ["Amina", "Yusuf", "Mariam", "Omar", "Fatima", "Bilal", "Khadija", "Hamza", "Zainab", "Idris"];
const SURNAMES = ["Sample", "Example", "Placeholder", "Madeup"];
// Role and section for each of the 40, in order (every role used at least once).
const PEOPLE_PLAN: [role: string, section: string][] = [
  ["Imam", "Prayer halls"], ["Imam", "Prayer halls"], ["Imam", "Women's section"],
  ["Staff", "Administration"], ["Staff", "Administration"], ["Staff", "Shop"], ["Staff", "Restaurant"], ["Staff", "Restaurant"],
  ["Security", "Security"], ["Security", "Security"], ["Security", "Security"], ["Security", "Security"],
  ["Cleaner", "Cleaning"], ["Cleaner", "Cleaning"], ["Cleaner", "Cleaning"], ["Cleaner", "Women's section"],
  ["Caretaker", "Maintenance"], ["Caretaker", "Maintenance"],
  ["Gardener", "Maintenance"], ["Gardener", "Maintenance"],
  ["Reception", "Reception"], ["Reception", "Reception"], ["Reception", "Women's section"],
  ["Volunteer", "Volunteers"], ["Volunteer", "Volunteers"], ["Volunteer", "Volunteers"], ["Volunteer", "Volunteers"],
  ["Volunteer", "Volunteers"], ["Volunteer", "Women's section"], ["Volunteer", "Prayer halls"], ["Volunteer", "Restaurant"],
  ["Volunteer", "Shop"], ["Volunteer", "Volunteers"],
  ["Board member", "Administration"], ["Board member", "Administration"], ["Board member", "Administration"],
  ["Contractor", "Maintenance"], ["Contractor", "Maintenance"], ["Contractor", "Security"], ["Contractor", "Cleaning"],
];

export const SEED_PEOPLE: SeedPerson[] = PEOPLE_PLAN.map(([role, section], i) => {
  const first = FIRST_NAMES[i % FIRST_NAMES.length];
  const surname = SURNAMES[Math.floor(i / FIRST_NAMES.length) % SURNAMES.length];
  const n = String(i + 1).padStart(2, "0");
  const handle = `${first}.${surname}`.toLowerCase();
  return {
    full_name: `Test ${first} ${surname}`,
    role,
    section,
    // Most have a phone, most an email, and every seventh has neither.
    phone: i % 7 === 6 || i % 5 === 4 ? null : `+353 00 000 01${n}`,
    email: i % 7 === 6 || i % 3 === 2 ? null : `${handle}@icci-prototype.test`,
    start_date: i % 4 === 3 ? null : `20${18 + (i % 8)}-${String((i % 12) + 1).padStart(2, "0")}-01`,
    // Three have left (switched off, never deleted).
    active: ![9, 22, 37].includes(i),
  };
});

// P2.2: the two Centre Admins also have person records, linked to their
// accounts, so "reported by" can start with "you". The Super Admin is left
// unlinked, so a Super Admin is free to link the others on screen.
for (const [email, n] of [
  ["centre.admin@icci-prototype.test", 41],
  ["second.admin@icci-prototype.test", 42],
  ["super.two@icci-prototype.test", 43],
  ["finance.two@icci-prototype.test", 44],
] as const) {
  const admin = SEED_ADMINS.find((a) => a.email === email)!;
  SEED_PEOPLE.push({
    full_name: admin.displayName,
    role: "Staff",
    section: "Administration",
    phone: `+353 00 000 01${n}`,
    email,
    start_date: "2024-01-01",
    active: true,
    account: email,
  });
}

// ---------------------------------------------------------------------------
// Phase 2, slice P2.3: made-up Garda vetting entries, with dates counted back
// from the day the seed runs, so the list always shows every status: some
// valid, some due soon (one with re-vetting applied), some expired, some
// applied, some with nothing, and one marked not required. Only switched-on
// people whose role needs vetting get entries (the database refuses
// switched-off people). Status and dates only: nothing else exists to store.
export type SeedVetting = { full_name: string; kind: "applied" | "vetted" | "not_required"; ago: number; expiresIn?: number };

export function seedVetting(): SeedVetting[] {
  const needs = new Set(SEED_PERSON_ROLES.filter((r) => r.needs_vetting).map((r) => r.name));
  const out: SeedVetting[] = [];
  SEED_PEOPLE.forEach((p, i) => {
    if (!p.active || !needs.has(p.role)) return;
    if (p.account) {
      // The Centre Admins' own records: valid, entered by the seed (not by them).
      out.push({ full_name: p.full_name, kind: "vetted", ago: 400, expiresIn: 3 * 365 - 400 });
      return;
    }
    if (i === 32) {
      out.push({ full_name: p.full_name, kind: "not_required", ago: 60 });
      return;
    }
    switch (i % 8) {
      case 0: // nothing on record
        break;
      case 1: // expired 40 days ago
        out.push({ full_name: p.full_name, kind: "vetted", ago: 3 * 365 + 40, expiresIn: -40 });
        break;
      case 2: // due in 20 days; every other one has applied for re-vetting
        out.push({ full_name: p.full_name, kind: "vetted", ago: 3 * 365 - 20, expiresIn: 20 });
        if (i % 16 === 2) out.push({ full_name: p.full_name, kind: "applied", ago: 5 });
        break;
      case 3: // applied 12 days ago, not vetted yet
        out.push({ full_name: p.full_name, kind: "applied", ago: 12 });
        break;
      default: {
        // valid: vetted some time in the last 2.5 years, for 3 years
        const ago = 30 + ((i * 37) % 900);
        out.push({ full_name: p.full_name, kind: "applied", ago: ago + 25 });
        out.push({ full_name: p.full_name, kind: "vetted", ago, expiresIn: 3 * 365 - ago });
      }
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Phase 2, slice P2.4: made-up training entries, with dates counted back from
// the day the seed runs, so the training list shows every status: valid, due
// soon, expired and no expiry, plus an older course replaced by a refresher.
// Switched-on seed people only (the database refuses switched-off people).
// The four types are the starting list from migration 0021. Dates only.
export const SEED_TRAINING_TYPES = ["Fire safety", "First aid", "Safeguarding awareness", "Manual handling"] as const;
export type SeedTraining = { full_name: string; type: (typeof SEED_TRAINING_TYPES)[number]; ago: number; expiresIn: number | null };

export function seedTraining(): SeedTraining[] {
  const out: SeedTraining[] = [];
  SEED_PEOPLE.forEach((p, i) => {
    if (!p.active || i % 5 === 4) return; // every fifth person has nothing recorded
    // Everyone else: safeguarding awareness, mostly valid; one in six has no expiry.
    if (i % 6 === 5) out.push({ full_name: p.full_name, type: "Safeguarding awareness", ago: 200 + i * 3, expiresIn: null });
    else out.push({ full_name: p.full_name, type: "Safeguarding awareness", ago: 100 + i * 7, expiresIn: 3 * 365 - 100 - i * 7 });
    switch (i % 4) {
      case 0: // first aid due soon
        out.push({ full_name: p.full_name, type: "First aid", ago: 2 * 365 - 15 - i, expiresIn: 15 + i });
        break;
      case 1: // fire safety expired; an older course before it too
        out.push({ full_name: p.full_name, type: "Fire safety", ago: 2 * 365 + 30, expiresIn: -365 + 30 });
        out.push({ full_name: p.full_name, type: "Fire safety", ago: 365 + 20 + i, expiresIn: -20 - i });
        break;
      case 2: // manual handling valid
        out.push({ full_name: p.full_name, type: "Manual handling", ago: 300 + i, expiresIn: 3 * 365 - 300 - i });
        break;
      default: // fire safety refreshed this year: the old one expired, the new one valid
        out.push({ full_name: p.full_name, type: "Fire safety", ago: 400, expiresIn: -35 });
        out.push({ full_name: p.full_name, type: "Fire safety", ago: 30, expiresIn: 365 - 30 });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------
// Phase 2, slice P2.5: four made-up policies, each with a placeholder PDF
// that says plainly it is a fictional sample. Dates are counted from the day
// the seed runs (approved `ago` days ago, next review in `reviewIn` days).
// Together they show every state the screens have: a policy with an older
// version replaced by a newer one, one due for review soon, one with a draft
// waiting for a different admin, and one with only a draft.
export type SeedPolicyVersion = { label: string; ago: number; reviewIn: number; publish: boolean; uploader: "centre" | "second" };
export type SeedPolicy = { title: string; owner: string; roles: string[]; versions: SeedPolicyVersion[] };

export const SEED_POLICIES: SeedPolicy[] = [
  {
    title: "Test policy: Health and safety",
    owner: SEED_PEOPLE[3].full_name,
    roles: ["Staff", "Security", "Cleaner", "Caretaker", "Volunteer"],
    versions: [
      { label: "v1", ago: 400, reviewIn: 100, publish: true, uploader: "centre" },
      { label: "v2", ago: 20, reviewIn: 345, publish: true, uploader: "centre" },
    ],
  },
  {
    title: "Test policy: Safeguarding children",
    owner: SEED_PEOPLE[0].full_name,
    roles: ["Imam", "Staff", "Reception", "Volunteer"],
    versions: [{ label: "v1", ago: 340, reviewIn: 25, publish: true, uploader: "centre" }],
  },
  {
    title: "Test policy: Data protection",
    owner: SEED_PEOPLE[4].full_name,
    roles: ["Staff", "Reception", "Board member"],
    versions: [
      { label: "v1", ago: 100, reviewIn: 265, publish: true, uploader: "centre" },
      { label: "v2", ago: 3, reviewIn: 362, publish: false, uploader: "second" },
    ],
  },
  {
    title: "Test policy: Volunteer code of conduct",
    owner: SEED_PEOPLE[23].full_name,
    roles: ["Volunteer"],
    versions: [{ label: "v1", ago: 5, reviewIn: 360, publish: false, uploader: "centre" }],
  },
];

/** A one-page PDF that says it is a made-up sample (plain text, no real content). */
export function samplePolicyPdf(title: string, version: string, arabic = false): Uint8Array {
  // D7: six made-up pages, so the flip book has pages to turn. The "Arabic
  // edition" is placeholder text in English letters (no Arabic font is
  // bundled for made-up files); its pages are read right to left.
  const edition = arabic ? "Arabic edition (placeholder text)" : "English edition";
  const topics = ["Purpose", "Who this applies to", "What we expect", "Reporting a concern", "Records we keep", "Review and sign-off"];
  return samplePdfPages(
    topics.map((topic, i) => [
      `${title} (${version})`,
      `${edition} - page ${i + 1} of ${topics.length}`,
      `${i + 1}. ${topic}`,
      "SAMPLE - fictional document for testing only.",
      "Not a real ICCI policy. Every line here is made up.",
    ]),
  );
}

/** D7: a PDF with one page per list of lines (plain text, made up). */
export function samplePdfPages(pages: string[][]): Uint8Array {
  const safe = (t: string) => t.replace(/[^A-Za-z0-9 :.,()-]/g, "");
  const n = pages.length;
  const pageIds = pages.map((_, i) => 4 + i * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  pages.forEach((lines, i) => {
    const text = lines
      .map(safe)
      .map((l, k) => `BT /F1 ${k === 0 ? 20 : k === 2 ? 16 : 12} Tf 72 ${740 - k * 34} Td (${l}) Tj ET`)
      .concat([`BT /F1 10 Tf 280 40 Td (${i + 1}) Tj ET`, "0.72 0.6 0.35 RG 2 w 72 600 m 523 600 l S"])
      .join("\n");
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
    objects.push(`<< /Length ${text.length} >>\nstream\n${text}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

/** A one-page PDF with these lines of plain text (P1.20 shares it for placeholder manuals). */
export function samplePdf(raw: string[]): Uint8Array {
  const safe = (s: string) => s.replace(/[^A-Za-z0-9 :.,-]/g, "");
  const lines = raw.map(safe);
  const text = lines.map((l, i) => `BT /F1 ${i === 0 ? 18 : 12} Tf 72 ${720 - i * 28} Td (${l}) Tj ET`).join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${String(off).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}

// ---------------------------------------------------------------------------
// Phase 2, slice P2.6: made-up sign-offs. For each sample policy's current
// version, about two in three of the people who must sign have signed (the
// people listed by name; every third one has not), so the grid shows both
// green and amber. Red ("overdue") appears only 30 days after publishing.
export function seedSignsOff(indexInList: number): boolean {
  return indexInList % 3 !== 2;
}

// ---------------------------------------------------------------------------
// Phase 2, slice P2.7: three made-up vehicles on labels ICCI-000297 to 299
// (from the free labels; 257 to 296 stay free). P1.17: each names its
// sub-category under the main category "Vehicles". Registrations are obviously
// fictional. Dates are counted from the day the seed runs so the list shows
// every status: valid, due soon, expired, not recorded, and NCT not needed.
export type SeedRenewal = { kind: "tax" | "insurance" | "nct"; ago: number; validFor: number };
export type SeedVehicle = {
  label: string;
  name: string;
  /** A sub-category under "Vehicles" (migration 0041). */
  category: "Cars and vans" | "Minibuses and buses";
  registration: string;
  makeModel: string;
  keeper: string | null;
  nctNeeded: boolean;
  renewals: SeedRenewal[];
};

export const SEED_VEHICLES: SeedVehicle[] = [
  {
    label: labelSerial(297),
    name: "Test minibus (made up)",
    category: "Minibuses and buses",
    registration: "TEST-BUS-1",
    makeModel: "Sample Minibus 16-seat",
    keeper: SEED_PEOPLE[16].full_name,
    nctNeeded: true,
    renewals: [
      { kind: "tax", ago: 330, validFor: 365 }, // due in 35 days
      { kind: "insurance", ago: 100, validFor: 365 },
      { kind: "nct", ago: 400, validFor: 365 }, // older NCT, now expired...
      { kind: "nct", ago: 20, validFor: 365 }, // ...and renewed this month
    ],
  },
  {
    label: labelSerial(298),
    name: "Test van (made up)",
    category: "Cars and vans",
    registration: "TEST-VAN-1",
    makeModel: "Example Van",
    keeper: SEED_PEOPLE[17].full_name,
    nctNeeded: true,
    renewals: [
      { kind: "tax", ago: 380, validFor: 365 }, // expired 15 days ago
      { kind: "insurance", ago: 200, validFor: 365 },
    ], // no NCT recorded
  },
  {
    label: labelSerial(299),
    name: "Test car (made up)",
    category: "Cars and vans",
    registration: "TEST-CAR-1",
    makeModel: "Placeholder Hatchback",
    keeper: null,
    nctNeeded: false, // a newer car
    renewals: [
      { kind: "tax", ago: 40, validFor: 365 },
      { kind: "insurance", ago: 340, validFor: 365 }, // due in 25 days
    ],
  },
];

// ---------------------------------------------------------------------------
// Phase 2, slice P2.8: eight made-up renewals typed into the register, all
// titled "Test ..." so they are obviously fictional. Due dates are counted
// from the day the seed runs so the register shows overdue, due soon and up
// to date. One was renewed once already, so its history has two entries.
export type SeedTypedRenewal = {
  title: string;
  category: "Insurance" | "Licence or permit" | "Safety inspection" | "Service contract" | "Certificate" | "Subscription" | "Other";
  owner: string | null;
  documentsNeeded: string | null;
  notes: string | null;
  /** The first due date, in days from today (negative: already passed). */
  dueIn: number;
  /** If set: renewed this many days ago, next due this many days from today. */
  renewed?: { ago: number; nextDueIn: number };
};

export const SEED_TYPED_RENEWALS: SeedTypedRenewal[] = [
  {
    title: "Test building insurance (made up)",
    category: "Insurance",
    owner: SEED_PEOPLE[0].full_name,
    documentsNeeded: "Test: last year's schedule, list of building works (made up)",
    notes: null,
    dueIn: 45,
  },
  { title: "Test public liability insurance (made up)", category: "Insurance", owner: SEED_PEOPLE[0].full_name, documentsNeeded: null, notes: null, dueIn: 200 },
  {
    title: "Test fire alarm service contract (made up)",
    category: "Service contract",
    owner: SEED_PEOPLE[5].full_name,
    documentsNeeded: "Test: last service report",
    notes: "Test note: fictional contractor",
    dueIn: -10,
  },
  { title: "Test lift safety inspection (made up)", category: "Safety inspection", owner: SEED_PEOPLE[5].full_name, documentsNeeded: null, notes: null, dueIn: 20 },
  { title: "Test restaurant food business registration (made up)", category: "Licence or permit", owner: null, documentsNeeded: null, notes: null, dueIn: 300 },
  {
    title: "Test boiler gas safety certificate (made up)",
    category: "Certificate",
    owner: SEED_PEOPLE[6].full_name,
    documentsNeeded: null,
    notes: null,
    dueIn: -380,
    renewed: { ago: 15, nextDueIn: 350 },
  },
  { title: "Test music licence for events (made up)", category: "Licence or permit", owner: null, documentsNeeded: null, notes: null, dueIn: -3 },
  { title: "Test website domain name (made up)", category: "Subscription", owner: null, documentsNeeded: null, notes: "Test note: made-up address", dueIn: 90 },
];

// ---------------------------------------------------------------------------
// Phase 3, slice P3.1: made-up prayer times for the Prayer times screen and
// the rota. NOT the Centre's timetable: a smooth made-up curve through the
// year (late Fajr and early Maghrib in winter, the reverse in summer, Isha
// near midnight at midsummer), rounded to 5 minutes. Fridays also get two
// made-up Jumu'ah times. The screen says these are sample times.
export type SeedPrayerDay = {
  prayer_date: string;
  fajr: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
  jumuah_1: string | null;
  jumuah_2: string | null;
};

const at = (minutes: number) => {
  const m = Math.round(minutes / 5) * 5;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

export function seedPrayerDay(iso: string): SeedPrayerDay {
  const d = new Date(`${iso}T12:00:00Z`);
  const dayOfYear = Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000);
  const summer = Math.cos((2 * Math.PI * (dayOfYear - 172)) / 365); // 1 at midsummer, -1 at midwinter
  const friday = d.getUTCDay() === 5;
  const first = summer > 0 ? 13 * 60 + 45 : 13 * 60;
  return {
    prayer_date: iso,
    fajr: at(4 * 60 + 50 - 120 * summer),
    dhuhr: at(13 * 60 + 20 * summer),
    asr: at(15 * 60 + 50 + 115 * summer),
    maghrib: at(19 * 60 + 5 + 175 * summer),
    isha: at(20 * 60 + 50 + 170 * summer),
    jumuah_1: friday ? at(first) : null,
    jumuah_2: friday ? at(first + 60) : null,
  };
}

/** Every day of this month and next month ("2026-11" style months). */
export function seedPrayerMonths(today: string): string[] {
  const [y, m] = today.split("-").map(Number);
  const out: string[] = [];
  for (const k of [0, 1]) {
    const year = y + Math.floor((m - 1 + k) / 12);
    const month = ((m - 1 + k) % 12) + 1;
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let day = 1; day <= days; day++) out.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Phase 3, slice P3.2: two made-up rota weeks (this week and next), about
// half filled, so the week screen shows filled and empty slots and one of
// each warning: a double-booking (the same person on Dhuhr and on a
// Reception shift that day) and a vetting warning (someone not vetted on
// Security). "who" picks from made-up seed people: "vetted" means Garda
// vetting valid today, "unvetted" a person whose role needs it but who has
// none valid. A missing prayer time shows wherever no prayer times are
// entered (the browser tests use such weeks).
export type SeedRotaSlot = { day: number; slot: string; start?: string; end?: string; who: "vetted" | "unvetted" | null; pick: number };

export function seedRotaPlan(): SeedRotaSlot[] {
  const out: SeedRotaSlot[] = [];
  const prayers = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
  for (let day = 0; day < 7; day++) {
    // Prayers: about half filled.
    prayers.forEach((slot, i) => {
      if ((day + i) % 2 === 0) out.push({ day, slot, who: "vetted", pick: (day * 5 + i) % 6 });
    });
    out.push({ day, slot: "Security", start: "09:00", end: "13:00", who: day === 3 ? "unvetted" : "vetted", pick: day % 4 });
    if (day < 5) out.push({ day, slot: "Reception", start: "10:00", end: "16:00", who: day % 2 === 0 ? "vetted" : null, pick: 6 + (day % 3) });
    if (day % 2 === 0) out.push({ day, slot: "Cleaning", start: "07:00", end: "09:00", who: null, pick: 0 });
    out.push({ day, slot: "Funeral on call", who: day % 3 === 0 ? null : "vetted", pick: 9 + (day % 2) });
  }
  out.push({ day: 4, slot: "Jumu'ah 1", who: "vetted", pick: 1 });
  out.push({ day: 4, slot: "Jumu'ah 2", who: null, pick: 0 });
  // The double-booking: Wednesday's Reception person also on Wednesday's Dhuhr.
  out.push({ day: 2, slot: "Dhuhr", who: "vetted", pick: 6 + (2 % 3) });
  return out;
}

// ---------------------------------------------------------------------------
// Phase 3, slice P3.5: made-up maintenance tickets showing every status and
// priority: some about one asset (by label), some about a place. Each is
// reported, then taken through its made-up steps exactly as the history
// entries would be added on screen. Assignees are switched-on made-up
// contractors (by their place in that list).
export type SeedTicketStep =
  | { kind: "assigned"; contractor: number; note?: string }
  | { kind: "status"; status: "open" | "in_progress" | "waiting"; note?: string }
  | { kind: "priority"; priority: "low" | "normal" | "urgent"; note?: string }
  | { kind: "note"; note: string }
  | { kind: "closed"; note: string; costCents?: number }
  | { kind: "reopened"; note: string };

export type SeedTicket = {
  description: string;
  priority: "low" | "normal" | "urgent";
  /** A fixed asset's label, or else a place's name. */
  label?: string;
  place?: string;
  reportedBy: string;
  steps: SeedTicketStep[];
  finalStatus: "open" | "in_progress" | "waiting" | "closed";
};

export const SEED_TICKETS: SeedTicket[] = [
  {
    description: "Tap in the wudu area drips all the time (made up)",
    priority: "urgent",
    place: "Test Room A1",
    reportedBy: "Test volunteer at reception",
    steps: [],
    finalStatus: "open",
  },
  {
    description: "Fire exit sign light is out (made up)",
    priority: "urgent",
    place: "Test Building B",
    reportedBy: "Test security guard",
    steps: [
      { kind: "assigned", contractor: 0, note: "Test: electrician booked for tomorrow" },
      { kind: "status", status: "in_progress" },
    ],
    finalStatus: "in_progress",
  },
  {
    description: "Chair wobbles, one leg loose (made up)",
    priority: "normal",
    label: "ICCI-000010",
    reportedBy: "Test cleaner",
    steps: [],
    finalStatus: "open",
  },
  {
    description: "Projector shows a pink tint (made up)",
    priority: "normal",
    label: "ICCI-000020",
    reportedBy: "Test imam",
    steps: [
      { kind: "assigned", contractor: 1 },
      { kind: "status", status: "waiting", note: "Test: waiting for a replacement cable" },
    ],
    finalStatus: "waiting",
  },
  {
    description: "Window in the store room will not close fully (made up)",
    priority: "low",
    place: "Test Store Room A2-1",
    reportedBy: "Test caretaker",
    steps: [{ kind: "priority", priority: "normal", note: "Test: rain is getting in (P3.6)" }],
    finalStatus: "open",
  },
  {
    description: "Heater makes a loud clicking noise (made up)",
    priority: "normal",
    place: "Test Room B1",
    reportedBy: "Test volunteer at reception",
    steps: [
      { kind: "assigned", contractor: 2 },
      { kind: "status", status: "in_progress" },
      { kind: "note", note: "Test: part ordered, about a week" },
      { kind: "closed", note: "Test: fan bearing replaced and tested", costCents: 12500 },
    ],
    finalStatus: "closed",
  },
  {
    description: "Table top scratched (made up)",
    priority: "low",
    label: "ICCI-000030",
    reportedBy: "Test cleaner",
    steps: [{ kind: "closed", note: "Test: polished out by the caretaker" }],
    finalStatus: "closed",
  },
  {
    description: "Door to the hall sticks in wet weather (made up)",
    priority: "normal",
    place: "Test Room A2",
    reportedBy: "Test security guard",
    steps: [
      { kind: "assigned", contractor: 0 },
      { kind: "closed", note: "Test: hinges oiled", costCents: 0 },
      { kind: "reopened", note: "Test: sticking again after the rain" },
    ],
    finalStatus: "open",
  },
];

// ---------------------------------------------------------------------------
// Slice P4.2: the lending library. 60 made-up books (English, Arabic and
// other languages) and 90 copies on their own labels, ICCI-000301 to
// ICCI-000390 (printed as one more run of labels). Every title says
// "(made up)" or, in Arabic, "تجريبي" ("test"); every author starts with
// "Test" or "تجريبي". About half have an ISBN: made-up numbers with a
// correct check digit only.
export const SEED_LIBRARY_FIRST_LABEL = 301;
export const SEED_LIBRARY_LABEL_COUNT = 90;

export type SeedBook = {
  title: string;
  author: string | null;
  isbn: string | null;
  publisher: string | null;
  year: number | null;
  language: "en" | "ar" | "other";
  copies: { label: string; note: string | null }[];
};

function isbnWithCheck(first12: string): string {
  const sum = [...first12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
  return first12 + ((10 - (sum % 10)) % 10);
}

const EN_START = ["The Patient", "The Little", "A Quiet", "The Golden", "The Lantern", "A Garden", "The Kind", "The Long", "A Thousand", "The Open"];
const EN_END = ["Gardener", "Lantern", "Journey", "Market", "Courtyard", "River", "Teacher", "Library", "Harvest", "Doorway"];
const AR_TITLES = [
  "حديقة القصص",
  "رحلة الفانوس",
  "بيت الحكمة الصغير",
  "نهر الصباح",
  "سوق المدينة القديمة",
  "معلم القرية",
  "مفتاح الباب الأزرق",
  "أيام الحصاد",
  "النجمة الهادئة",
  "دفتر المسافر",
  "شجرة الزيتون",
  "حكايات المساء",
  "الطريق الطويل",
  "ضوء القمر",
  "بستان الجدة",
];
const OTHER_TITLES = ["Le jardin d'essai", "Das Testbuch", "Il libro di prova", "El libro de prueba", "Kitabu cha Majaribio"];

export function seedLibrary(): SeedBook[] {
  const books: SeedBook[] = [];
  for (let i = 0; i < 40; i++) {
    books.push({
      title: `${EN_START[i % 10]} ${EN_END[(i * 3 + Math.floor(i / 10)) % 10]} (made up)`,
      author: `Test Author ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? "2" : ""} Example`,
      isbn: i % 2 === 0 ? isbnWithCheck(`97999${String(100000 + i * 37).padStart(7, "0")}`) : null,
      publisher: i % 3 === 0 ? "Test Press (made up)" : null,
      year: i % 4 === 0 ? 1990 + (i % 30) : null,
      language: "en",
      copies: [],
    });
  }
  AR_TITLES.forEach((t, i) => {
    books.push({
      title: `${t} (تجريبي)`,
      author: i % 5 === 4 ? null : `تجريبي ${["أحمد", "فاطمة", "يوسف", "مريم", "عمر"][i % 5]} المثال`,
      isbn: i % 3 === 0 ? isbnWithCheck(`97999${String(200000 + i * 41).padStart(7, "0")}`) : null,
      publisher: i % 4 === 0 ? "دار تجريبية للنشر" : null,
      year: i % 2 === 0 ? 2000 + i : null,
      language: "ar",
      copies: [],
    });
  });
  OTHER_TITLES.forEach((t, i) => {
    books.push({ title: `${t} (made up)`, author: `Test Author Other ${i + 1}`, isbn: null, publisher: null, year: null, language: "other", copies: [] });
  });
  // One copy each (60), then a second copy of every other book (30 more).
  let n = SEED_LIBRARY_FIRST_LABEL;
  for (const b of books) b.copies.push({ label: labelSerial(n++), note: null });
  books.forEach((b, i) => {
    if (i % 2 === 0) b.copies.push({ label: labelSerial(n++), note: i % 6 === 0 ? "Test: donated, spine worn (made up)" : null });
  });
  return books;
}

// ---------------------------------------------------------------------------
// Slice P4.4: 25 made-up borrowers and their loans, in every state. Every
// name starts with "Test"; phones use area code 00 (does not exist in
// Ireland), emails the reserved ".test" domain. Dates are days counted from
// the day the seed runs, so the states stay right whenever it is run.
export type SeedBorrower = { full_name: string; contact_kind: "phone" | "email"; contact: string; active: boolean };

/** One loan: the copy's label, when it was lent and first due, and what happened since. */
export type SeedLoan = {
  borrower: string;
  label: string;
  lent: number;
  due: number;
  /** Entries after the loan, in order: returned, due moved, returned by mistake (undone). */
  then: ({ kind: "returned"; on: number } | { kind: "due_moved"; on: number; to: number } | { kind: "return_undone"; on: number })[];
};

const BORROWER_FIRST = ["Aisha", "Hassan", "Noor", "Tariq", "Layla", "Sami", "Huda", "Karim", "Rania", "Adam", "Salma", "Ibrahim", "Dina"];
const BORROWER_SURNAMES = ["Pageturner", "Bookend"];

export const SEED_BORROWERS: SeedBorrower[] = Array.from({ length: 25 }, (_, i) => {
  const first = BORROWER_FIRST[i % BORROWER_FIRST.length];
  const surname = BORROWER_SURNAMES[Math.floor(i / BORROWER_FIRST.length)];
  const n = String(i + 1).padStart(2, "0");
  return {
    full_name: `Test ${first} ${surname}`,
    contact_kind: i % 2 === 0 ? "phone" : "email",
    contact: i % 2 === 0 ? `+353 00 000 02${n}` : `${first}.${surname}@icci-prototype.test`.toLowerCase(),
    // One has moved away: switched off, with only past loans.
    active: i !== 24,
  };
});

export function seedLoans(): SeedLoan[] {
  const b = (i: number) => SEED_BORROWERS[i].full_name;
  let label = SEED_LIBRARY_FIRST_LABEL;
  const next = () => labelSerial(label++);
  const loans: SeedLoan[] = [];
  // On loan, not due yet (8).
  for (let i = 0; i < 8; i++) loans.push({ borrower: b(i), label: next(), lent: -(3 + i * 2), due: -(3 + i * 2) + 21, then: [] });
  // Overdue, by 1 to 25 days (5).
  [1, 3, 8, 15, 25].forEach((late, k) => loans.push({ borrower: b(8 + k), label: next(), lent: -(21 + late), due: -late, then: [] }));
  // Returned on time (5) and late (3): history only.
  for (let i = 13; i < 18; i++) loans.push({ borrower: b(i), label: next(), lent: -60 - i, due: -39 - i, then: [{ kind: "returned", on: -45 - i }] });
  for (let i = 18; i < 21; i++) loans.push({ borrower: b(i), label: next(), lent: -90, due: -69, then: [{ kind: "returned", on: -69 + (i - 17) * 2 }] });
  // Due date moved once (still out).
  loans.push({ borrower: b(21), label: next(), lent: -15, due: 6, then: [{ kind: "due_moved", on: -1, to: 20 }] });
  // Returned by mistake, then put back on loan.
  loans.push({ borrower: b(22), label: next(), lent: -9, due: 12, then: [{ kind: "returned", on: -2 }, { kind: "return_undone", on: -2 }] });
  // Three books out: the most allowed.
  for (let k = 0; k < 3; k++) loans.push({ borrower: b(23), label: next(), lent: -4, due: 17, then: [] });
  // The switched-off borrower's past loan.
  loans.push({ borrower: b(24), label: next(), lent: -200, due: -179, then: [{ kind: "returned", on: -180 }] });
  // Some borrowers with books out also have an earlier, returned loan.
  for (let i = 0; i < 4; i++) loans.push({ borrower: b(i), label: next(), lent: -120 + i, due: -99 + i, then: [{ kind: "returned", on: -100 }] });
  return loans;
}

// ---------------------------------------------------------------------------
// P1.19 to P1.21: made-up companies, makes and models, who services what, the
// staff contact person per category, a placeholder manual, and one ticket
// passed to a company. Company names say "Example", phone numbers are
// +353 00 000 02.., and every address uses the reserved ".example" domain,
// which can never be a real business.
export type SeedCompany = { name: string; kinds: ("supplier" | "installer" | "service" | "maker" | "other")[]; phone: string; email: string; website: string; notes: string | null };

export const SEED_COMPANIES: SeedCompany[] = [
  { name: "Example Gates and Barriers Ltd", kinds: ["installer", "service"], phone: "+353 00 000 0201", email: "service@gates.example", website: "https://gates.example", notes: "Made up. Ask for the callout desk." },
  { name: "Example Cool Air Services Ltd", kinds: ["supplier", "installer", "service"], phone: "+353 00 000 0202", email: "jobs@coolair.example", website: "https://coolair.example", notes: null },
  { name: "Example Garden Machines Ltd", kinds: ["supplier", "service"], phone: "+353 00 000 0203", email: "repairs@gardenmachines.example", website: "https://gardenmachines.example", notes: null },
  { name: "Example Fire Safety Ltd", kinds: ["service"], phone: "+353 00 000 0204", email: "office@firesafety.example", website: "https://firesafety.example", notes: null },
  { name: "Example Security Systems Ltd", kinds: ["installer", "service"], phone: "+353 00 000 0205", email: "help@security.example", website: "https://security.example", notes: null },
  { name: "Example AirMakers", kinds: ["maker"], phone: "+353 00 000 0206", email: "support@airmakers.example", website: "https://airmakers.example", notes: "Maker's helpline (made up)." },
  { name: "Example Mower Works", kinds: ["maker"], phone: "+353 00 000 0207", email: "help@mowerworks.example", website: "https://mowerworks.example", notes: null },
  { name: "Example Gate Motors", kinds: ["maker"], phone: "+353 00 000 0208", email: "info@gatemotors.example", website: "https://gatemotors.example", notes: null },
];

export type SeedModel = { maker: string; model: string; category: string; service: string | null; warrantyMonths: number | null; manual: boolean; notes?: string };

export const SEED_MODELS: SeedModel[] = [
  { maker: "Example AirMakers", model: "AirMax WX-200", category: "Air conditioners", service: "Example Cool Air Services Ltd", warrantyMonths: 24, manual: true },
  { maker: "Example AirMakers", model: "AirMax CX-500", category: "Air conditioners", service: "Example Cool Air Services Ltd", warrantyMonths: 36, manual: false },
  { maker: "Example Mower Works", model: "Mow 46", category: "Lawnmowers", service: "Example Garden Machines Ltd", warrantyMonths: 24, manual: true },
  { maker: "Example Gate Motors", model: "Swing 300", category: "Automatic gates and barriers", service: null, warrantyMonths: 12, manual: true },
];

/** Which demo items get which model, supplier and own service company (by the start of their name). */
export const SEED_ITEM_LINKS: { namePrefix: string; model?: string; supplier?: string; service?: string }[] = [
  { namePrefix: "Test wall air conditioner", model: "AirMax WX-200", supplier: "Example Cool Air Services Ltd" },
  { namePrefix: "Test ceiling air conditioner", model: "AirMax CX-500", supplier: "Example Cool Air Services Ltd" },
  { namePrefix: "Test lawnmower", model: "Mow 46", supplier: "Example Garden Machines Ltd" },
  { namePrefix: "Test main entrance gate", model: "Swing 300" },
  { namePrefix: "Test car park barrier", service: "Example Gates and Barriers Ltd" },
];

/** Category defaults: the usual service company and the staff contact person (by role). */
export const SEED_CATEGORY_CONTACTS: { category: string; service: string | null; contactRole: "Caretaker" | "Gardener" | null }[] = [
  { category: "Garden, tools and cleaning equipment", service: "Example Garden Machines Ltd", contactRole: "Gardener" },
  { category: "Heating, cooling and water", service: "Example Cool Air Services Ltd", contactRole: "Caretaker" },
  { category: "Building systems and security", service: null, contactRole: "Caretaker" },
  { category: "Automatic gates and barriers", service: "Example Gates and Barriers Ltd", contactRole: null },
  { category: "CCTV", service: "Example Security Systems Ltd", contactRole: null },
  { category: "Fire alarms and extinguishers", service: "Example Fire Safety Ltd", contactRole: null },
  { category: "Kitchen and catering", service: null, contactRole: "Caretaker" },
  { category: "Furniture and furnishings", service: null, contactRole: "Caretaker" },
];

/** A one-page placeholder manual: says plainly that it is made up. */
export function sampleManualPdf(model: string): Uint8Array {
  return samplePdf([`${model} - user manual`, "SAMPLE - fictional manual for testing only.", "Not a real product."]);
}

/** The made-up ticket passed to a company (P1.21), about the broken demo lawnmower. */
export const SEED_REFERRAL = {
  description: "Lawnmower will not start after the winter (made up)",
  assetName: "Test lawnmower 02",
  reportedBy: "Test gardener",
  company: "Example Garden Machines Ltd",
  jobRef: "DEMO-123",
  note: "Test: engineer to call on Thursday (made up)",
};

// ---------------------------------------------------------------------------
// Phase 5, slice P5.2: about 60 made-up expense claims, showing every state:
// waiting, needing a second approval, approved (some corrected), rejected,
// withdrawn; own money awaiting repayment and paid back; lost receipts.
// Every receipt is a plainly fake picture saying "SAMPLE RECEIPT - NOT
// REAL" (question 13), never a real firm's name. Entered and decided by the
// signed-in test accounts, exactly as on screen, so every rule applies.
export const SEED_SHOPS = [
  "Test Hardware Shop",
  "Test Cash and Carry",
  "Test Cleaning Supplies",
  "Test Print Shop",
  "Test Fuel Station",
  "Test Electrical Wholesale",
  "Test Bakery",
  "Test Office Supplies",
  "Test Plumbing Services",
  "Test Post Office",
];

/** Linked test accounts that may approve (an approver must be linked, question 2A). */
export const SEED_APPROVERS = [
  "finance.two@icci-prototype.test",
  "centre.admin@icci-prototype.test",
  "second.admin@icci-prototype.test",
  "super.two@icci-prototype.test",
];
const ENTERERS = [
  "centre.admin@icci-prototype.test",
  "second.admin@icci-prototype.test",
  "finance@icci-prototype.test",
  "finance.two@icci-prototype.test",
  "super.two@icci-prototype.test",
];
/** The person record linked to each linked test account. */
export const SEED_ACCOUNT_PERSON: Record<string, string> = {
  "centre.admin@icci-prototype.test": "Test Centre Admin",
  "second.admin@icci-prototype.test": "Test Second Admin",
  "super.two@icci-prototype.test": "Test Second Super Admin",
  "finance.two@icci-prototype.test": "Test Second Finance Officer",
};

export type SeedClaim = {
  daysAgo: number;
  amountCents: number;
  vatCents: number | null;
  category: string;
  description: string;
  shop: string;
  payment: "centre_direct" | "centre_card" | "personal";
  /** A person's full name, or null for the Centre paying directly. */
  paidBy: string | null;
  lost: string | null;
  enteredBy: string;
  outcome: "waiting" | "second" | "approved" | "rejected" | "withdrawn";
  fund: "Unrestricted" | "Zakat" | "Fitra";
  repaid: boolean;
  correctTo: number | null;
};

const CLAIM_PLAN: [category: string, description: string, cents: number][] = [
  ["Cleaning and hygiene", "Test bin bags and floor cleaner", 3450],
  ["Kitchen and catering", "Test tea, milk and sugar for the office", 1875],
  ["Repairs and maintenance", "Test replacement tap washers", 1240],
  ["Office, printing and post", "Test printer ink cartridges", 6899],
  ["Vehicles and fuel", "Test diesel for the Centre van", 7500],
  ["Events and programmes", "Test dates and water for the open day", 12500],
  ["Utilities", "Test electricity bill (direct debit)", 48230],
  ["Phones, internet and IT", "Test broadband for the office", 5999],
  ["Equipment and furniture", "Test folding tables for the hall", 64000],
  ["Funeral services", "Test ghusl room supplies", 8920],
  ["Books and learning materials", "Test exercise books for the weekend school", 4310],
  ["Insurance, licences and fees", "Test music licence renewal", 21000],
  ["Professional services", "Test locksmith call-out", 15500],
  ["Other", "Test flowers for a visiting school", 2500],
  ["Repairs and maintenance", "Test boiler service", 72000],
];

/** The payers of own-money claims: switched-on made-up people with no admin account. */
const PAYER_INDEXES = [0, 1, 2, 3, 4, 5, 6, 7];

export function seedClaims(): SeedClaim[] {
  const out: SeedClaim[] = [];
  for (let i = 0; i < 60; i++) {
    const [category, description, base] = CLAIM_PLAN[i % CLAIM_PLAN.length];
    const amountCents = base + (i % 7) * 105;
    const payment: SeedClaim["payment"] =
      category === "Utilities" || category === "Insurance, licences and fees" ? "centre_direct" : i % 5 === 3 ? "centre_card" : "personal";
    const enteredBy = ENTERERS[i % ENTERERS.length];
    // Now and then an own-money claim was paid by the admin who entered it (if linked).
    const ownMoney = payment === "personal" && i % 9 === 4 && Boolean(SEED_ACCOUNT_PERSON[enteredBy]);
    const paidBy =
      payment === "centre_direct" ? null : ownMoney ? SEED_ACCOUNT_PERSON[enteredBy] : SEED_PEOPLE[PAYER_INDEXES[i % PAYER_INDEXES.length]].full_name;
    const lost = i % 13 === 6 ? "Test: the till printer was broken (made-up)" : null;
    const bigOrLost = amountCents > 50000 || (lost !== null && amountCents > 5000);
    // The first eight wait, a few big ones need a second approval, a few are rejected or withdrawn, the rest approved.
    const outcome: SeedClaim["outcome"] =
      i < 8 ? "waiting" : i < 16 && bigOrLost ? "second" : i % 17 === 5 ? "rejected" : i % 19 === 7 ? "withdrawn" : "approved";
    out.push({
      daysAgo: 2 + ((i * 3) % 80),
      amountCents,
      vatCents: i % 3 === 0 ? Math.round(amountCents * 0.187) : null,
      category,
      description,
      shop: SEED_SHOPS[i % SEED_SHOPS.length],
      payment,
      paidBy,
      lost,
      enteredBy,
      outcome,
      fund: i % 11 === 2 ? "Zakat" : i % 23 === 9 ? "Fitra" : "Unrestricted",
      // Own money: about half of the approved ones are already paid back.
      repaid: outcome === "approved" && payment === "personal" && i % 2 === 0,
      correctTo: outcome === "approved" && i % 16 === 12 ? amountCents + 450 : null,
    });
  }
  return out;
}

// A plain 5 by 7 dot font for the fake receipt pictures (capital letters,
// digits and a few signs), so the seed needs no extra software.
const FONT: Record<string, string> = {
  A: "01110100011000111111100011000110001", B: "11110100011000111110100011000111110", C: "01110100011000010000100001000101110",
  D: "11110100011000110001100011000111110", E: "11111100001000011110100001000011111", F: "11111100001000011110100001000010000",
  G: "01110100011000010111100011000101111", H: "10001100011000111111100011000110001", I: "01110001000010000100001000010001110",
  J: "00111000100001000010000101001001100", K: "10001100101010011000101001001010001", L: "10000100001000010000100001000011111",
  M: "10001110111010110101100011000110001", N: "10001110011010110011100011000110001", O: "01110100011000110001100011000101110",
  P: "11110100011000111110100001000010000", Q: "01110100011000110001101011001001101", R: "11110100011000111110101001001010001",
  S: "01111100001000001110000010000111110", T: "11111001000010000100001000010000100", U: "10001100011000110001100011000101110",
  V: "10001100011000110001100010101000100", W: "10001100011000110101101011010101010", X: "10001100010101000100010101000110001",
  Y: "10001100010101000100001000010000100", Z: "11111000010001000100010001000011111", "0": "01110100011001110101110011000101110",
  "1": "00100011000010000100001000010001110", "2": "01110100010000100010001000100011111", "3": "11111000100010000010000011000101110",
  "4": "00010001100101010010111110001000010", "5": "11111100001111000001000011000101110", "6": "00110010001000011110100011000101110",
  "7": "11111000010001000100010000100001000", "8": "01110100011000101110100011000101110", "9": "01110100011000101111000010001001100",
  ".": "00000000000000000000000000110001100", ":": "00000011000110000000011000110000000", "-": "00000000000000011111000000000000000",
  " ": "00000000000000000000000000000000000", "/": "00001000010001000100010001000010000",
};

function crc32(bytes: Uint8Array): number {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/** A grey-on-white PNG "receipt" with these lines of text, plainly marked as fake. */
export async function sampleReceiptPng(raw: string[]): Promise<Uint8Array> {
  const { deflateSync } = await import("node:zlib");
  const lines = ["SAMPLE RECEIPT", "NOT REAL - TEST DATA", "", ...raw.map((l) => l.toUpperCase().replace(/[^A-Z0-9 .:/-]/g, ""))];
  const scale = 3;
  const cols = Math.max(...lines.map((l) => l.length), 20);
  const width = (cols * 6 + 8) * scale;
  const height = (lines.length * 10 + 8) * scale;
  const px = new Uint8Array(width * height).fill(255);
  lines.forEach((line, row) => {
    [...line].forEach((ch, col) => {
      const glyph = FONT[ch] ?? FONT[" "];
      for (let y = 0; y < 7; y++)
        for (let x = 0; x < 5; x++)
          if (glyph[y * 5 + x] === "1")
            for (let dy = 0; dy < scale; dy++)
              for (let dx = 0; dx < scale; dx++) {
                const X = (4 + col * 6 + x) * scale + dx;
                const Y = (4 + row * 10 + y) * scale + dy;
                px[Y * width + X] = row < 2 ? 150 : 30;
              }
    });
  });
  // Grey-scale PNG: one filter byte (0) before each row.
  const rows = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y++) rows.set(px.subarray(y * width, (y + 1) * width), y * (width + 1) + 1);
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr.set([8, 0, 0, 0, 0], 8); // 8 bits, grey, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(deflateSync(rows))),
    chunk("IEND", new Uint8Array()),
  ];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}
