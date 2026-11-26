// Round C2: fill the LOCAL test database with thousands of obviously made-up
// records, to check the long lists and Home stay quick with real amounts of
// data. Run: npm run db:load-many, then npm run test:speed. Afterwards
// "npm run db:reset" puts the ordinary test data back.
//
// Adds: 3,000 assets (with labels counted as printed), 1,500 people,
// 2,500 maintenance tickets, 300 typed-in renewals, and 1,200 changes to
// one asset (a history longer than one database page). Everything is named
// "Test bulk ..." and is made up. Refuses anything but the local database.
import { createClient } from "@supabase/supabase-js";

const need = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing setting ${name}.`);
  return v;
};
if (process.env.ICCI_ENVIRONMENT !== "development") throw new Error('Refusing: ICCI_ENVIRONMENT must be "development".');
const url = need("NEXT_PUBLIC_SUPABASE_URL");
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) throw new Error("Refusing: this only ever fills the local test database in Docker.");

const db = createClient(url, need("SUPABASE_SECRET_KEY"), { auth: { autoRefreshToken: false, persistSession: false } });
const ok = <T,>(r: { data: T; error: { message: string } | null }, what: string): NonNullable<T> => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  if (r.data === null || r.data === undefined) throw new Error(`${what}: nothing came back`);
  return r.data;
};
async function inChunks<T>(rows: T[], size: number, write: (chunk: T[]) => PromiseLike<{ error: { message: string } | null }>, what: string) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await write(rows.slice(i, i + size));
    if (error) throw new Error(`${what}: ${error.message}`);
  }
}
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const one = async (table: string, column: string, value: string) =>
  ok(await db.from(table).select("id").eq(column, value).single(), `${table} ${value}`).id as string;

const ASSETS = 3000, PEOPLE = 1500, TICKETS = 2500, RENEWALS = 300, HISTORY = 1200;

// Places and categories from the ordinary seed.
const room = await one("locations", "name", "Test Room A1");
const building = await one("locations", "name", "Test Building A");
const chairs = await one("item_categories", "name", "Other furniture");

// 1. Labels, counted as printed, then assets on them.
const { data: top } = await db.from("labels").select("serial").order("serial", { ascending: false }).limit(1);
const first = Math.max(800001, Number((top?.[0]?.serial ?? "ICCI-000000").slice(5)) + 1);
const serials = Array.from({ length: ASSETS }, (_, i) => `ICCI-${pad(first + i, 6)}`);
await inChunks(serials.map((serial) => ({ serial })), 1000, (c) => db.from("labels").insert(c), "labels");
const runs = [];
for (let n = first; n < first + ASSETS; n += 210) runs.push({ first_number: n, last_number: Math.min(n + 209, first + ASSETS - 1) });
await inChunks(runs, 100, (c) => db.from("label_print_runs").insert(c), "label runs");
const conditions = ["good", "good", "good", "fair", "damaged", "missing"];
await inChunks(
  serials.map((label_serial, i) => ({
    label_serial,
    kind: "fixed_asset",
    name: `Test bulk chair ${pad(i + 1)}`,
    category_id: chairs,
    location_id: i % 2 ? room : building,
    condition: conditions[i % conditions.length],
    value_cents: 1000 + (i % 50) * 100,
    purchase_date: "2025-01-15",
  })),
  500,
  (c) => db.from("items").insert(c),
  "assets",
);
console.log(`Assets: ${ASSETS} added (labels ${serials[0]} to ${serials.at(-1)}).`);

// 2. People.
const role = await one("person_roles", "name", "Volunteer");
const section = await one("sections", "name", "Volunteers");
await inChunks(
  Array.from({ length: PEOPLE }, (_, i) => ({ full_name: `Test bulk person ${pad(i + 1)}`, person_role_id: role, section_id: section })),
  500,
  (c) => db.from("people").insert(c),
  "people",
);
console.log(`People: ${PEOPLE} added.`);

// 3. Tickets on the bulk chairs.
const { data: someItems } = await db.from("items").select("id").in("label_serial", serials.slice(0, 500));
const priorities = ["urgent", "normal", "normal", "low"];
await inChunks(
  Array.from({ length: TICKETS }, (_, i) => {
    const it = someItems![i % someItems!.length];
    return { description: `Test bulk problem ${pad(i + 1)}: made up for the speed check`, priority: priorities[i % 4], reported_by: "Test bulk reporter", item_id: it.id };
  }),
  500,
  (c) => db.from("maintenance_tickets").insert(c),
  "tickets",
);
console.log(`Tickets: ${TICKETS} added.`);

// 4. Typed-in renewals, with due dates spread over two years.
const made = ok(
  await db.from("renewals").insert(Array.from({ length: RENEWALS }, (_, i) => ({ title: `Test bulk renewal ${pad(i + 1)}`, category: "Insurance" }))).select("id"),
  "renewals",
) as { id: string }[];
const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString().slice(0, 10);
await inChunks(made.map((r, i) => ({ renewal_id: r.id, due_on: day(i * 2) })), 300, (c) => db.from("renewal_dates").insert(c), "renewal dates");
console.log(`Renewals: ${RENEWALS} added.`);

// 5. One asset with a long history (each change is an ordinary, logged change).
const long = ok(await db.from("items").select("id").eq("label_serial", serials[0]).single(), "long-history asset").id as string;
for (let i = 1; i <= HISTORY; i++) {
  const r = await db.from("items").update({ notes: `Test bulk note, change ${pad(i)}` }).eq("id", long);
  if (r.error) throw new Error(`history: ${r.error.message}`);
}
console.log(`History: ${HISTORY} changes to ${serials[0]} (Test bulk chair 0001).`);
console.log('Done. Now run "npm run test:speed". Afterwards, "npm run db:reset" puts the ordinary test data back.');
