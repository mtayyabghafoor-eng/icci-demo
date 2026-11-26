// Fills the DEVELOPMENT database, or the STAGING demo, with made-up data (never production). Safe to run repeatedly.
// Run with: npm run db:seed
//
// Slice 1: the fictional admin sign-in accounts.
// Slice 2: their roles (app_users) and 15 fictional locations.
// Slice 3: an authenticator for each account (keys kept in the git-ignored
//          .test-authenticators.json, never printed).
// Slice 4: 300 fictional labels and 220 fictional items (P1.17: 256, in
//          the two-level categories of migration 0041).
// Slice 5: made-up stock counts and restocks for the consumables, and two
//          corrections waiting for approval.
// Slice 6: made-up moves, damage and missing reports, repairs and two
//          disposals waiting for approval.
// Slice 7: the 300 labels recorded as two printed sheets (1-210, 211-300).
// Slice 8: two stocktakes run by Test Centre Admin: Test Room A2 (every
//          difference decided by Test Second Admin) and Test Room B1 (its
//          differences waiting for approval).
// P2.1:    40 fictional people in the people directory (3 switched off).
// P2.2:    2 more, linked to the two Centre Admin accounts.
// P2.3:    made-up Garda vetting entries showing every status.
// P2.4:    made-up training entries showing every status.
// P2.5:    four made-up policies with placeholder PDFs, uploaded by Test
//          Centre Admin (one draft by Test Second Admin) and published by
//          the other admin, exactly as on screen.
// P2.6:    made-up sign-offs for about two in three of the people who must
//          sign each sample policy, one with a placeholder scan.
// P2.7:    three made-up vehicles (labels 297 to 299) with tax, insurance
//          and NCT dates showing every status.
// P2.8:    eight made-up renewals typed into the register (overdue, due
//          soon, up to date; one renewed once already).
// P3.5:    eight made-up maintenance tickets showing every status and
//          priority, some about an asset and some about a place.
// P4.2:    60 made-up library books and 90 copies on labels 301 to 390
// P4.4:    25 made-up borrowers and 31 loans in every state
//          (one more printed run of labels).

import { existsSync, readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  labelSerial,
  SEED_LIBRARY_FIRST_LABEL,
  SEED_LIBRARY_LABEL_COUNT,
  seedLibrary,
  SEED_BORROWERS,
  seedLoans,
  SEED_ADMINS,
  SEED_LABEL_COUNT,
  SEED_LOCATIONS,
  SEED_PEOPLE,
  SEED_POLICIES,
  SEED_VEHICLES,
  SEED_TICKETS,
  SEED_TYPED_RENEWALS,
  SEED_TRAINING_TYPES,
  samplePolicyPdf,
  seedSignsOff,
  seedAssetEvents,
  seedItems,
  SEED_CATEGORY_CONTACTS,
  SEED_COMPANIES,
  SEED_ITEM_LINKS,
  SEED_MODELS,
  SEED_REFERRAL,
  sampleManualPdf,
  seedPrayerDay,
  seedPrayerMonths,
  seedRotaPlan,
  seedStock,
  seedTraining,
  seedVetting,
  sampleReceiptPng,
  seedClaims,
  SEED_APPROVERS,
  SEED_ACCOUNT_PERSON,
} from "./seed-data.mts";
import type { SeedModel } from "./seed-data.mts";
import { DEMO_CATEGORY_CONTACTS, DEMO_COMPANIES, DEMO_FILES_DIR, DEMO_ITEM_LINKS, DEMO_MODELS, DEMO_REFERRAL } from "./demo-data.mts";
import { dressForDemo, dressListInPlace } from "./demo-names.mts";
import { storeReminderKey } from "./reminder-key.mts";
import { readTestAuthenticators, writeTestAuthenticators } from "./test-authenticators.mts";
import { totp } from "./totp.mts";
import { assertSeedable } from "../src/lib/env.ts";

// Dates for the vetting seed (the same sums as src/lib/vetting/rules.ts,
// repeated here because this script runs outside the website's build).
const todayInDublin = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Dublin" });
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function need(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing setting ${name}. Add it to .env.local (see .env.example).`);
  return v;
}

// Development or the staging demo only; never production (src/lib/env.ts).
let environment: "development" | "staging";
try {
  environment = assertSeedable(process.env.ICCI_ENVIRONMENT);
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

// On the staging demo only, the made-up names become realistic but still
// clearly fictional ones (scripts/demo-names.mts). Development and the tests
// keep the "Test ..." names. D() does the same for lists built further down.
const D = <T,>(value: T): T => (environment === "staging" ? dressForDemo(value) : value);
if (environment === "staging") {
  for (const list of [SEED_ADMINS, SEED_LOCATIONS, SEED_PEOPLE, SEED_POLICIES, SEED_VEHICLES, SEED_TYPED_RENEWALS, SEED_TICKETS, SEED_BORROWERS] as unknown[][]) {
    dressListInPlace(list);
  }
  // The demo shows no made-up email addresses: borrowers who had one get a
  // phone number in the unused Dublin 01 000 range instead.
  SEED_BORROWERS.forEach((b, i) => {
    if (b.contact_kind === "email") {
      b.contact_kind = "phone";
      b.contact = `01 000 03${String(i + 1).padStart(2, "0")}`;
    }
  });
}

const admin = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("SUPABASE_SECRET_KEY"), {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = need("TEST_USER_PASSWORD");

// 1. Sign-in accounts and their roles.
const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const person of SEED_ADMINS) {
  const existing = list.users.find((u) => u.email === person.email);
  const attributes = {
    password,
    email_confirm: true,
    user_metadata: { display_name: person.displayName, seed: true },
  };
  const result = existing
    ? await admin.auth.admin.updateUserById(existing.id, attributes)
    : await admin.auth.admin.createUser({ email: person.email, ...attributes });
  if (result.error) throw result.error;

  const { error } = await admin.from("app_users").upsert({
    id: result.data.user!.id,
    display_name: person.displayName,
    role: person.role,
    active: person.active,
  });
  if (error) throw error;
  console.log(`${existing ? "Updated" : "Created"} test account: ${person.email} (${person.role}${person.active ? "" : ", deactivated"})`);
}

// 2. An authenticator for each test account, so tests can sign in fully.
// If the key file was lost, the old (fictional) authenticator is removed and
// a new one set up. This only ever runs on the development database.
const authenticators = readTestAuthenticators();
const { data: freshList, error: freshError } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (freshError) throw freshError;
for (const person of SEED_ADMINS) {
  const user = freshList.users.find((u) => u.email === person.email)!;
  const { data: factorData, error: factorError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  if (factorError) throw factorError;
  const known = authenticators[person.email];
  if (known && factorData.factors.some((f) => f.id === known.factorId && f.status === "verified")) continue;

  for (const f of factorData.factors) {
    const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
    if (error) throw error;
  }
  const client = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await client.auth.signInWithPassword({ email: person.email, password });
  if (signIn.error) throw signIn.error;
  const enrol = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "Test authenticator" });
  if (enrol.error) throw enrol.error;
  const verify = await client.auth.mfa.challengeAndVerify({
    factorId: enrol.data.id,
    code: totp(enrol.data.totp.secret),
  });
  if (verify.error) throw verify.error;
  authenticators[person.email] = { factorId: enrol.data.id, secret: enrol.data.totp.secret };
  writeTestAuthenticators(authenticators);
  console.log(`Set up test authenticator for ${person.email}`);
}

// 3. Locations (parents are listed before their children).
const ids = new Map<string, string>();
let created = 0;
for (const loc of SEED_LOCATIONS) {
  const parentId = loc.parent ? ids.get(loc.parent)! : null;
  let query = admin.from("locations").select("id").eq("name", loc.name);
  query = parentId ? query.eq("parent_id", parentId) : query.is("parent_id", null);
  const { data: found, error: findError } = await query.maybeSingle();
  if (findError) throw findError;
  if (found) {
    ids.set(loc.name, found.id);
    continue;
  }
  const { data, error } = await admin
    .from("locations")
    .insert({ name: loc.name, kind: loc.kind, parent_id: parentId })
    .select("id")
    .single();
  if (error) throw error;
  ids.set(loc.name, data.id);
  created++;
}
console.log(`Locations: ${created} created, ${SEED_LOCATIONS.length - created} already there.`);

// 4. Labels (pre-printed numbers) and items.
const labels = Array.from({ length: SEED_LABEL_COUNT }, (_, i) => ({ serial: labelSerial(i + 1) }));
const { error: labelError } = await admin.from("labels").upsert(labels, { onConflict: "serial", ignoreDuplicates: true });
if (labelError) throw labelError;

// The seed's labels count as already printed, in runs of at most 210 (ten sheets).
const { count: runCount, error: runCountError } = await admin
  .from("label_print_runs")
  .select("id", { count: "exact", head: true });
if (runCountError) throw runCountError;
if (!runCount) {
  const runs = [];
  for (let first = 1; first <= SEED_LABEL_COUNT; first += 210) {
    runs.push({ first_number: first, last_number: Math.min(first + 209, SEED_LABEL_COUNT) });
  }
  const { error: runError } = await admin.from("label_print_runs").insert(runs);
  if (runError) throw runError;
}

const { data: cats, error: catError } = await admin.from("item_categories").select("id, name");
if (catError) throw catError;
const catIds = new Map(cats.map((c) => [c.name, c.id]));
// P1.17: every seed item names a sub-category from migration 0041.
// The online demo has fewer items (owner's choice, 22 Nov 2026).
const SMALL = environment === "staging";
for (const name of new Set(seedItems({ small: SMALL }).map((i) => i.category))) {
  if (!catIds.has(name)) throw new Error(`No "${name}" category. Has migration 0041 been applied?`);
}

const items = D(seedItems({ small: SMALL }));
const { data: existingItems, error: existingError } = await admin
  .from("items")
  .select("label_serial")
  .in("label_serial", items.map((i) => i.label));
if (existingError) throw existingError;
const already = new Set(existingItems.map((i) => i.label_serial));
const toAdd = items
  .filter((i) => !already.has(i.label))
  .map((i) => ({
    label_serial: i.label,
    kind: i.kind,
    name: i.name,
    category_id: catIds.get(i.category)!,
    location_id: ids.get(i.location)!,
    // Damaged and missing assets start good; their seed report changes them (step 6).
    condition: i.condition === "damaged" || i.condition === "missing" ? "good" : (i.condition ?? null),
    value_cents: i.valueCents ?? null,
    purchase_date: i.purchaseDate ?? null,
    warranty_end: i.warrantyEnd ?? null,
    unit: i.unit ?? null,
    minimum_level: i.minimumLevel ?? null,
  }));
if (toAdd.length) {
  const { error } = await admin.from("items").insert(toAdd);
  if (error) throw error;
}
console.log(`Labels: ${SEED_LABEL_COUNT} printed. Items: ${toAdd.length} created, ${already.size} already there.`);

// 5. Stock: only for consumables that have no stock entries yet.
const consumables = items.filter((i) => i.kind === "consumable");
const { data: stockItems, error: stockItemsError } = await admin
  .from("items")
  .select("id, label_serial")
  .in("label_serial", consumables.map((c) => c.label));
if (stockItemsError) throw stockItemsError;
const idOfLabel = new Map(stockItems.map((i) => [i.label_serial, i.id]));
const { data: existingMoves, error: movesError } = await admin
  .from("stock_movements")
  .select("item_id")
  .in("item_id", [...idOfLabel.values()]);
if (movesError) throw movesError;
const hasStock = new Set(existingMoves.map((m) => m.item_id));
const plans = consumables
  .map((c, i) => ({ itemId: idOfLabel.get(c.label)!, plan: seedStock(i, c.minimumLevel!) }))
  .filter((p) => p.plan && !hasStock.has(p.itemId));
// Three rounds, so every item's entries are in the right order.
const rounds = [
  ["count", "firstCount"],
  ["restock", "restock"],
  ["count", "secondCount"],
] as const;
for (const [kind, field] of rounds) {
  if (!plans.length) break;
  const { error } = await admin
    .from("stock_movements")
    .insert(plans.map((p) => ({ item_id: p.itemId, kind, quantity: p.plan![field] })));
  if (error) throw error;
}
// Two corrections waiting for approval (made by the seed, so any admin may decide).
for (const p of plans.slice(0, 2)) {
  const { data: restock, error } = await admin
    .from("stock_movements")
    .select("id, quantity")
    .eq("item_id", p.itemId)
    .eq("kind", "restock")
    .single();
  if (error) throw error;
  const fix = await admin.from("stock_movements").insert({
    item_id: p.itemId,
    kind: "adjustment",
    corrects_id: restock.id,
    quantity: restock.quantity + 2,
    reason: D("Test correction: the delivery note said two more"),
  });
  if (fix.error) throw fix.error;
}
console.log(`Stock: ${plans.length} consumables given made-up counts, ${consumables.length - plans.length} left as they were.`);

// 6. Asset events: only if no seeded fixed asset has any yet.
const fixedLabels = items.filter((i) => i.kind === "fixed_asset").map((i) => i.label);
const { data: fixedRows, error: fixedError } = await admin.from("items").select("id, label_serial").in("label_serial", fixedLabels);
if (fixedError) throw fixedError;
const assetIdOf = new Map(fixedRows.map((r) => [r.label_serial, r.id]));
const { count: eventCount, error: eventCountError } = await admin
  .from("asset_events")
  .select("id", { count: "exact", head: true })
  .in("item_id", [...assetIdOf.values()]);
if (eventCountError) throw eventCountError;
let eventsAdded = 0;
if (!eventCount) {
  for (const e of D(seedAssetEvents(items))) {
    const { error } = await admin.from("asset_events").insert({
      item_id: assetIdOf.get(e.label)!,
      kind: e.kind,
      note: e.note,
      reported_by: e.reportedBy,
      to_location_id: e.toLocation ? ids.get(e.toLocation)! : null,
      to_condition: e.toCondition ?? null,
      disposal_route: e.disposal?.route ?? null,
      disposal_recipient: e.disposal?.recipient ?? null,
      sale_price_cents: e.disposal?.sale?.cents ?? null,
      sale_buyer: e.disposal?.sale?.buyer ?? null,
      sale_date: e.disposal?.sale ? addDays(todayInDublin(), -e.disposal.sale.daysAgo) : null,
      sale_money_taken_by: e.disposal?.sale?.takenBy ?? null,
    });
    // An older seed set the condition directly: its report is then "already" true.
    if (error && !/already/i.test(error.message)) throw error;
    if (!error) eventsAdded++;
  }
}
console.log(`Asset events: ${eventsAdded} created${eventCount ? ` (${eventCount} already there)` : ""}.`);

// 7. Stocktakes: only if neither seeded room has one yet. They are run by a
// signed-in admin (with the test authenticator), exactly as on screen.
async function signedInAs(email: string) {
  const c = createClient(need("NEXT_PUBLIC_SUPABASE_URL"), need("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const signIn = await c.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  const key = readTestAuthenticators()[email];
  const v = await c.auth.mfa.challengeAndVerify({ factorId: key.factorId, code: totp(key.secret) });
  if (v.error) throw v.error;
  return c;
}
const stocktakeRooms = [D("Test Room A2"), D("Test Room B1")];
const { count: stocktakeCount, error: stCountError } = await admin
  .from("stocktakes")
  .select("id", { count: "exact", head: true })
  .in("location_id", stocktakeRooms.map((r) => ids.get(r)!));
if (stCountError) throw stCountError;
if (!stocktakeCount) {
  const runner = await signedInAs("centre.admin@icci-prototype.test");
  for (const roomName of stocktakeRooms) {
    // The room and every location inside it.
    const inside = new Set([roomName]);
    for (const loc of SEED_LOCATIONS) if (loc.parent && inside.has(loc.parent)) inside.add(loc.name);
    const { data: roomItems, error: roomError } = await admin
      .from("items")
      .select("id, label_serial, kind, condition")
      .in("location_id", [...inside].map((n) => ids.get(n)!))
      .order("label_serial");
    if (roomError) throw roomError;
    const { data: levels } = await admin.from("stock_levels").select("item_id, quantity").in("item_id", roomItems.map((i) => i.id));
    const levelOf = new Map((levels ?? []).map((l) => [l.item_id, l.quantity as number | null]));

    const { data: st, error: stError } = await runner.from("stocktakes").insert({ location_id: ids.get(roomName)! }).select("id").single();
    if (stError) throw stError;
    const assets = roomItems.filter((i) => i.kind === "fixed_asset" && ["good", "fair", "damaged"].includes(i.condition));
    const shelves = roomItems.filter((i) => i.kind === "consumable");
    // Every asset seen but the first; every shelf matches but the first (two fewer).
    const scans = [
      ...assets.slice(1).map((i) => ({ stocktake_id: st.id, label_serial: i.label_serial })),
      ...shelves.map((i, n) => {
        const now = levelOf.get(i.id) ?? 0;
        return { stocktake_id: st.id, label_serial: i.label_serial, found_quantity: n === 0 ? Math.max(0, now - 2) : now };
      }),
    ];
    for (const scan of scans) {
      const { error } = await runner.from("stocktake_scans").insert(scan);
      if (error) throw error;
    }
    const sent = await runner.rpc("submit_stocktake", { p_stocktake_id: st.id });
    if (sent.error) throw sent.error;
    if (roomName === D("Test Room A2")) {
      const decider = await signedInAs("second.admin@icci-prototype.test");
      const { data: diffs } = await decider.from("stocktake_differences").select("id, kind").eq("stocktake_id", st.id);
      for (const d of diffs ?? []) {
        const decision =
          d.kind === "quantity"
            ? { status: "approved" }
            : { status: "rejected", decision_note: D("Test: it was lent to the youth club (made-up)") };
        const { error } = await decider.from("stocktake_differences").update(decision).eq("id", d.id);
        if (error) throw error;
      }
    }
    console.log(`Stocktake of ${roomName}: ${scans.length} labels scanned and sent for approval.`);
  }
} else {
  console.log(`Stocktakes: already there (${stocktakeCount}).`);
}

// 8. People (P2.1): only those not already there (matched by name).
{
  const [roles, sections, existing] = await Promise.all([
    admin.from("person_roles").select("id, name"),
    admin.from("sections").select("id, name"),
    admin.from("people").select("full_name").in("full_name", SEED_PEOPLE.map((p) => p.full_name)),
  ]);
  if (roles.error || sections.error || existing.error) throw roles.error ?? sections.error ?? existing.error;
  const roleId = new Map(roles.data.map((r) => [r.name, r.id]));
  const sectionId = new Map(sections.data.map((r) => [r.name, r.id]));
  const already = new Set(existing.data.map((p) => p.full_name));
  const toAdd = SEED_PEOPLE.filter((p) => !already.has(p.full_name)).map((p) => ({
    full_name: p.full_name,
    person_role_id: roleId.get(p.role),
    section_id: sectionId.get(p.section),
    phone: p.phone,
    // The demo shows no email addresses for people: a realistic one could belong to someone real.
    email: environment === "staging" ? null : p.email,
    start_date: p.start_date,
    active: p.active,
  }));
  if (toAdd.length) {
    const { error } = await admin.from("people").insert(toAdd);
    if (error) throw error;
  }
  console.log(`People: ${toAdd.length} created, ${SEED_PEOPLE.length - toAdd.length} already there.`);

  // P2.2: link the two Centre Admins' accounts to their person records.
  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (usersError) throw usersError;
  let linked = 0;
  for (const p of SEED_PEOPLE.filter((x) => x.account)) {
    const userId = users.users.find((u) => u.email === p.account)?.id;
    if (!userId) throw new Error(`No seed account ${p.account}`);
    const { data, error } = await admin
      .from("people")
      .update({ app_user_id: userId })
      .eq("full_name", p.full_name)
      .is("app_user_id", null)
      .select("id");
    if (error) throw error;
    linked += data.length;
  }
  console.log(`People linked to admin accounts: ${linked} new.`);
}

// 9. Garda vetting (P2.3): only if no seed person has any vetting yet. Dates
// are counted back from today, so every status shows. Entered with the
// master key (no signed-in admin), so the "not your own" rule does not apply.
{
  const { data: people, error } = await admin.from("people").select("id, full_name").in("full_name", SEED_PEOPLE.map((p) => p.full_name));
  if (error) throw error;
  const idOf = new Map(people.map((p) => [p.full_name, p.id]));
  const { count, error: countError } = await admin
    .from("vetting_records")
    .select("id", { count: "exact", head: true })
    .in("person_id", [...idOf.values()]);
  if (countError) throw countError;
  if (!count) {
    const today = todayInDublin();
    const rows = D(seedVetting()).map((v) => ({
      person_id: idOf.get(v.full_name),
      kind: v.kind,
      happened_on: addDays(today, -v.ago),
      expires_on: v.expiresIn === undefined ? null : addDays(today, v.expiresIn),
    }));
    const { error: insertError } = await admin.from("vetting_records").insert(rows);
    if (insertError) throw insertError;
    console.log(`Garda vetting: ${rows.length} made-up entries created.`);
  } else {
    console.log(`Garda vetting: already there (${count}).`);
  }
}

// 10. Training (P2.4): only if no seed person has any training of the starting types yet. Dates are
// counted back from today, so every status shows. Entered with the master key.
{
  const { data: people, error } = await admin.from("people").select("id, full_name").in("full_name", SEED_PEOPLE.map((p) => p.full_name));
  if (error) throw error;
  const idOf = new Map(people.map((p) => [p.full_name, p.id]));
  const { data: types, error: typesError } = await admin.from("training_types").select("id, name");
  if (typesError) throw typesError;
  const typeOf = new Map(types.map((t) => [t.name, t.id]));
  const { count, error: countError } = await admin
    .from("training_records")
    .select("id", { count: "exact", head: true })
    .in("person_id", [...idOf.values()])
    // Only the starting types: tests add entries of their own "Test run" types.
    .in("training_type_id", SEED_TRAINING_TYPES.map((name) => typeOf.get(name) ?? "00000000-0000-4000-8000-000000000000"));
  if (countError) throw countError;
  if (!count) {
    const today = todayInDublin();
    const rows = D(seedTraining()).map((t) => {
      const training_type_id = typeOf.get(t.type);
      if (!training_type_id) throw new Error(`No training type "${t.type}". Has migration 0021 been applied?`);
      return {
        person_id: idOf.get(t.full_name),
        training_type_id,
        completed_on: addDays(today, -t.ago),
        expires_on: t.expiresIn === null ? null : addDays(today, t.expiresIn),
      };
    });
    const { error: insertError } = await admin.from("training_records").insert(rows);
    if (insertError) throw insertError;
    console.log(`Training: ${rows.length} made-up entries created.`);
  } else {
    console.log(`Training: already there (${count}).`);
  }
}

// 11. Policies (P2.5): only those not already there (matched by title). Each
// PDF is a made-up placeholder. Uploaded and published by signed-in admins,
// so the "a different admin publishes" rule applies exactly as on screen.
{
  const { data: existing, error } = await admin.from("policies").select("title").in("title", SEED_POLICIES.map((p) => p.title));
  if (error) throw error;
  const already = new Set(existing.map((p) => p.title));
  const toAdd = SEED_POLICIES.filter((p) => !already.has(p.title));
  if (toAdd.length) {
    const centre = await signedInAs("centre.admin@icci-prototype.test");
    const second = await signedInAs("second.admin@icci-prototype.test");
    const [{ data: people, error: pe }, { data: roles, error: re }] = await Promise.all([
      admin.from("people").select("id, full_name").in("full_name", SEED_PEOPLE.map((p) => p.full_name)),
      admin.from("person_roles").select("id, name"),
    ]);
    if (pe || re) throw pe ?? re;
    const personId = new Map(people.map((p) => [p.full_name, p.id]));
    const roleId = new Map(roles.map((r) => [r.name, r.id]));
    const today = todayInDublin();
    for (const p of toAdd) {
      const { data: policy, error: addError } = await centre
        .from("policies")
        .insert({ title: p.title, owner_person_id: personId.get(p.owner) })
        .select("id")
        .single();
      if (addError) throw addError;
      const req = await centre.from("policy_required_roles").insert(p.roles.map((r) => ({ policy_id: policy.id, person_role_id: roleId.get(r) })));
      if (req.error) throw req.error;
      for (const v of p.versions) {
        const uploader = v.uploader === "centre" ? centre : second;
        const path = `policies/${policy.id}/${crypto.randomUUID()}.pdf`;
        const up = await uploader.storage.from("policy-files").upload(path, samplePolicyPdf(p.title, v.label), { contentType: "application/pdf" });
        if (up.error) throw up.error;
        const { data: version, error: vError } = await uploader
          .from("policy_versions")
          .insert({
            policy_id: policy.id,
            version_label: v.label,
            file_path: path,
            approved_on: addDays(today, -v.ago),
            next_review_on: addDays(today, v.reviewIn),
          })
          .select("id")
          .single();
        if (vError) throw vError;
        if (v.publish) {
          const publisher = v.uploader === "centre" ? second : centre;
          const pub = await publisher.from("policy_versions").update({ status: "published" }).eq("id", version.id);
          if (pub.error) throw pub.error;
        }
      }
    }
  }
  console.log(`Policies: ${toAdd.length} created, ${SEED_POLICIES.length - toAdd.length} already there.`);
}

// 12. Sign-offs (P2.6): only if no sample policy has any yet. Entered by a
// signed-in admin (never for their own person: the other admin does that).
{
  const { data: pols, error } = await admin.from("policies").select("id, title").in("title", SEED_POLICIES.map((p) => p.title));
  if (error) throw error;
  const policyIds = pols.map((p) => p.id);
  const { data: squares, error: gridError } = await admin
    .from("policy_grid")
    .select("person_id, full_name, policy_id, policy_version_id")
    .in("policy_id", policyIds)
    .order("full_name");
  if (gridError) throw gridError;
  const versionIds = [...new Set(squares.map((q) => q.policy_version_id))];
  const { count, error: countError } = await admin
    .from("policy_signoffs")
    .select("id", { count: "exact", head: true })
    .in("policy_version_id", versionIds.length ? versionIds : ["00000000-0000-4000-8000-000000000000"]);
  if (countError) throw countError;
  if (!count && squares.length) {
    const centre = await signedInAs("centre.admin@icci-prototype.test");
    const second = await signedInAs("second.admin@icci-prototype.test");
    const { data: users, error: usersError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (usersError) throw usersError;
    const centreId = users.users.find((u) => u.email === "centre.admin@icci-prototype.test")!.id;
    const { data: centrePerson } = await admin.from("people").select("id").eq("app_user_id", centreId).maybeSingle();
    const { data: versions, error: vError } = await admin.from("policy_versions").select("id, approved_on").in("id", versionIds);
    if (vError) throw vError;
    const approved = new Map(versions.map((v) => [v.id, v.approved_on as string]));
    const today = todayInDublin();
    let added = 0;
    let scanned = false;
    for (const versionId of versionIds) {
      const mine = squares.filter((q) => q.policy_version_id === versionId).filter((_, i) => seedSignsOff(i));
      // Signed a few days after approval, never in the future.
      const signedOn = [addDays(approved.get(versionId)!, 3), today].sort()[0];
      let scan_path: string | null = null;
      if (!scanned && mine.length) {
        scan_path = `signoffs/${versionId}/${crypto.randomUUID()}.pdf`;
        const up = await centre.storage.from("signoff-scans").upload(scan_path, samplePolicyPdf(D("Test signed sheet"), "sample scan"), { contentType: "application/pdf" });
        if (up.error) throw up.error;
        scanned = true;
      }
      const rows = (who: typeof mine) => who.map((q) => ({ person_id: q.person_id, policy_version_id: versionId, signed_on: signedOn, scan_path }));
      const byCentre = mine.filter((q) => q.person_id !== centrePerson?.id);
      const bySecond = mine.filter((q) => q.person_id === centrePerson?.id);
      if (byCentre.length) {
        const r = await centre.from("policy_signoffs").insert(rows(byCentre));
        if (r.error) throw r.error;
      }
      if (bySecond.length) {
        const r = await second.from("policy_signoffs").insert(rows(bySecond));
        if (r.error) throw r.error;
      }
      added += mine.length;
    }
    console.log(`Sign-offs: ${added} made-up entries created.`);
  } else {
    console.log(`Sign-offs: already there (${count ?? 0}).`);
  }
}

// 13. Vehicles (P2.7): only those not already there (matched by registration).
// Each is first an ordinary asset on its label, in its sub-category under
// "Vehicles" (P1.17).
{
  const { data: existing, error } = await admin.from("vehicles").select("registration").in("registration", SEED_VEHICLES.map((v) => v.registration));
  if (error) throw error;
  const already = new Set(existing.map((v) => v.registration));
  const toAdd = SEED_VEHICLES.filter((v) => !already.has(v.registration));
  if (toAdd.length) {
    const { data: vehicleCats, error: catErr } = await admin
      .from("item_categories")
      .select("id, name")
      .in("name", [...new Set(SEED_VEHICLES.map((v) => v.category))]);
    if (catErr) throw catErr;
    const vehicleCat = new Map(vehicleCats.map((c) => [c.name, c.id]));
    for (const v of toAdd) if (!vehicleCat.has(v.category)) throw new Error(`No "${v.category}" category. Has migration 0041 been applied?`);
    const { data: keepers, error: kErr } = await admin.from("people").select("id, full_name").in("full_name", SEED_PEOPLE.map((p) => p.full_name));
    if (kErr) throw kErr;
    const keeperId = new Map(keepers.map((p) => [p.full_name, p.id]));
    const today = todayInDublin();
    for (const v of toAdd) {
      let { data: item } = await admin.from("items").select("id").eq("label_serial", v.label).maybeSingle();
      if (!item) {
        const made = await admin
          .from("items")
          .insert({ label_serial: v.label, kind: "fixed_asset", name: v.name, category_id: vehicleCat.get(v.category)!, location_id: ids.get(D("Test Building B"))!, condition: "good" })
          .select("id")
          .single();
        if (made.error) throw made.error;
        item = made.data;
      }
      const { data: vehicle, error: vErr } = await admin
        .from("vehicles")
        .insert({ item_id: item!.id, registration: v.registration, make_model: v.makeModel, keeper_person_id: v.keeper ? keeperId.get(v.keeper) : null, nct_needed: v.nctNeeded })
        .select("id")
        .single();
      if (vErr) throw vErr;
      const r = await admin.from("vehicle_renewals").insert(
        v.renewals.map((x) => ({ vehicle_id: vehicle.id, kind: x.kind, renewed_on: addDays(today, -x.ago), valid_until: addDays(today, -x.ago + x.validFor) })),
      );
      if (r.error) throw r.error;
    }
  }
  console.log(`Vehicles: ${toAdd.length} created, ${SEED_VEHICLES.length - toAdd.length} already there.`);
}

// 14. Typed-in renewals (P2.8): only those not already there (matched by title).
{
  const { data: existing, error } = await admin.from("renewals").select("title").in("title", SEED_TYPED_RENEWALS.map((r) => r.title));
  if (error) throw new Error(`Could not read renewals. Has migration 0026 been applied? ${error.message}`);
  const already = new Set(existing.map((r) => r.title));
  const toAdd = SEED_TYPED_RENEWALS.filter((r) => !already.has(r.title));
  if (toAdd.length) {
    const { data: owners, error: oErr } = await admin.from("people").select("id, full_name").in("full_name", SEED_PEOPLE.map((p) => p.full_name));
    if (oErr) throw oErr;
    const ownerId = new Map(owners.map((p) => [p.full_name, p.id]));
    const today = todayInDublin();
    for (const r of toAdd) {
      const { data: row, error: rErr } = await admin
        .from("renewals")
        .insert({ title: r.title, category: r.category, owner_person_id: r.owner ? ownerId.get(r.owner) : null, documents_needed: r.documentsNeeded, notes: r.notes })
        .select("id")
        .single();
      if (rErr) throw rErr;
      const dates: { renewal_id: string; renewed_on: string | null; due_on: string }[] = [{ renewal_id: row.id, renewed_on: null, due_on: addDays(today, r.dueIn) }];
      if (r.renewed) dates.push({ renewal_id: row.id, renewed_on: addDays(today, -r.renewed.ago), due_on: addDays(today, r.renewed.nextDueIn) });
      for (const d of dates) {
        const ins = await admin.from("renewal_dates").insert(d);
        if (ins.error) throw ins.error;
      }
    }
  }
  console.log(`Renewals: ${toAdd.length} created, ${SEED_TYPED_RENEWALS.length - toAdd.length} already there.`);
}

// 15. The daily reminder timer's key (slice P2.9): only its fingerprint is
// stored. The key stays in .env.local; it is never printed.
if (process.env.CRON_SECRET?.trim()) {
  await storeReminderKey(admin, process.env.CRON_SECRET.trim());
  console.log("Reminder timer key: fingerprint stored.");
} else {
  console.log("Reminder timer key: none in .env.local yet (npm run setup:reminder-key).");
}

// 16. Prayer times (P3.1): made-up sample times for every day of this month
// and next month that has none yet. Days already there are left alone.
{
  const dates = seedPrayerMonths(todayInDublin());
  const { data: there, error } = await admin.from("prayer_times").select("prayer_date").gte("prayer_date", dates[0]).lte("prayer_date", dates.at(-1)!);
  if (error) throw error;
  const have = new Set((there ?? []).map((r) => r.prayer_date));
  const rows = dates.filter((d) => !have.has(d)).map(seedPrayerDay);
  if (rows.length) {
    const ins = await admin.from("prayer_times").insert(rows);
    if (ins.error) throw ins.error;
  }
  console.log(`Prayer times: ${rows.length} made-up days added, ${have.size} already there.`);
}

// 17. Rota weeks (P3.2): this week and next, made up and about half filled,
// only if that week has no rota yet. Entered with the master key: a new
// week fills itself with empty prayer slots; people are put on them with
// replacing entries, exactly as the screen does.
{
  const monday = (iso: string) => addDays(iso, -((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7));
  const { data: vet, error: vetError } = await admin
    .from("people_vetting")
    .select("person_id, full_name, status, needs_vetting")
    .eq("active", true)
    .in("full_name", SEED_PEOPLE.map((p) => p.full_name))
    .order("full_name");
  if (vetError) throw vetError;
  const vetted = (vet ?? []).filter((p) => p.status === "valid");
  const unvetted = (vet ?? []).filter((p) => p.needs_vetting && (p.status === "expired" || p.status === "none"));
  if (!vetted.length || !unvetted.length) throw new Error("Rota seed needs vetted and unvetted seed people (run the vetting seed first).");
  // P3.4: funeral on call goes to vetted people with a (made-up) phone number,
  // so Today's rota can show who to ring.
  const { data: phoned, error: phonedError } = await admin.from("people").select("id").not("phone", "is", null).in("id", vetted.map((p) => p.person_id));
  if (phonedError) throw phonedError;
  const reachable = vetted.filter((p) => (phoned ?? []).some((x) => x.id === p.person_id));
  if (!reachable.length) throw new Error("Rota seed needs a vetted seed person with a phone number.");
  const { data: types, error: typesError } = await admin.from("rota_slot_types").select("id, name").eq("active", true);
  if (typesError) throw typesError;
  const typeId = new Map((types ?? []).map((t) => [t.name, t.id]));

  for (const start of [monday(todayInDublin()), addDays(monday(todayInDublin()), 7)]) {
    const there = await admin.from("rota_weeks").select("id").eq("week_start", start).maybeSingle();
    if (there.error) throw there.error;
    if (there.data) {
      console.log(`Rota week ${start}: already there.`);
      continue;
    }
    const week = await admin.from("rota_weeks").insert({ week_start: start }).select("id").single();
    if (week.error) throw week.error;
    let filled = 0;
    for (const s of D(seedRotaPlan())) {
      const slot_type_id = typeId.get(s.slot);
      if (!slot_type_id) throw new Error(`No rota slot type "${s.slot}". Has migration 0028 been applied?`);
      const date = addDays(start, s.day);
      const pool = s.slot === "Funeral on call" ? reachable : vetted;
      const person = s.who === "vetted" ? pool[s.pick % pool.length] : s.who === "unvetted" ? unvetted[s.pick % unvetted.length] : null;
      const empty = await admin
        .from("rota_entries")
        .select("id")
        .eq("week_id", week.data.id)
        .eq("assignment_date", date)
        .eq("slot_type_id", slot_type_id)
        .is("person_id", null)
        .limit(1)
        .maybeSingle();
      if (empty.error) throw empty.error;
      const row = {
        week_id: week.data.id,
        assignment_date: date,
        slot_type_id,
        person_id: person?.person_id ?? null,
        start_time: s.start ?? null,
        end_time: s.end ?? null,
        replaces_id: empty.data && !s.start ? empty.data.id : null,
      };
      if (row.replaces_id && !row.person_id) continue; // a prayer slot left empty
      const ins = await admin.from("rota_assignments").insert(row);
      if (ins.error) throw ins.error;
      if (row.person_id) filled++;
    }
    console.log(`Rota week ${start}: made-up week started, ${filled} slots filled.`);
  }

  // 18. Publishing (P3.3): this week is published once by the Centre Admin,
  // exactly as the screen does it, then one name is changed so the amber
  // "Changed" mark can be seen. Only if this week was never published.
  const thisWeek = await admin.from("rota_weeks").select("id").eq("week_start", monday(todayInDublin())).single();
  if (thisWeek.error) throw thisWeek.error;
  const { count: pubCount, error: pubCountError } = await admin
    .from("rota_publications")
    .select("id", { count: "exact", head: true })
    .eq("week_id", thisWeek.data.id);
  if (pubCountError) throw pubCountError;
  if (pubCount) {
    console.log("Rota publishing: this week was already published.");
  } else {
    const centre = await signedInAs("centre.admin@icci-prototype.test");
    const published = await centre.rpc("publish_rota_week", { p_week_id: thisWeek.data.id, p_seen_warnings: true });
    if (published.error) throw published.error;
    const fajr = typeId.get("Fajr")!;
    const slot = await admin
      .from("rota_entries")
      .select("id, person_id")
      .eq("week_id", thisWeek.data.id)
      .eq("slot_type_id", fajr)
      .not("person_id", "is", null)
      .order("assignment_date", { ascending: false })
      .limit(1)
      .single();
    if (slot.error) throw slot.error;
    const other = vetted.find((p) => p.person_id !== slot.data.person_id)!;
    const swapped = await centre.rpc("assign_rota_person", { p_assignment_id: slot.data.id, p_person_id: other.person_id });
    if (swapped.error) throw swapped.error;
    console.log("Rota publishing: this week published once, then one Fajr name changed.");
  }

  // 19. Templates (P3.4): the week after next is started and filled from the
  // Normal week template by the Centre Admin, exactly as the screen does it,
  // with nobody on it yet, so it can be tried. Only if that week has no rota.
  const later = addDays(monday(todayInDublin()), 14);
  const laterThere = await admin.from("rota_weeks").select("id").eq("week_start", later).maybeSingle();
  if (laterThere.error) throw laterThere.error;
  if (laterThere.data) {
    console.log(`Rota week ${later}: already there.`);
  } else {
    const centre = await signedInAs("centre.admin@icci-prototype.test");
    const week = await centre.from("rota_weeks").insert({ week_start: later }).select("id").single();
    if (week.error) throw week.error;
    const normal = await centre.from("rota_templates").select("id").eq("name", "Normal week").single();
    if (normal.error) throw new Error(`No "Normal week" template. Has migration 0031 been applied? ${normal.error.message}`);
    const used = await centre.rpc("use_rota_template", { p_week_id: week.data.id, p_template_id: normal.data.id });
    if (used.error) throw used.error;
    console.log(`Rota week ${later}: started from the Normal week template (${used.data} empty slots added, nobody on yet).`);
  }
}

// 20. Maintenance tickets (P3.5): only those not already there (matched by
// description). Each is reported, then taken through its made-up steps as
// history entries, exactly as the screens add them. Entered with the master
// key, so they show "entered by Seed script".
{
  const { data: have, error } = await admin
    .from("maintenance_tickets")
    .select("description")
    .in("description", SEED_TICKETS.map((t) => t.description));
  if (error) throw error;
  const there = new Set((have ?? []).map((t) => t.description));
  const toAdd = SEED_TICKETS.filter((t) => !there.has(t.description));
  if (toAdd.length) {
    const contractorNames = SEED_PEOPLE.filter((p) => p.role === "Contractor" && p.active).map((p) => p.full_name);
    const { data: contractors, error: cError } = await admin.from("people").select("id, full_name").in("full_name", contractorNames);
    if (cError) throw cError;
    const contractorId = new Map(contractors.map((p) => [p.full_name, p.id]));
    for (const t of toAdd) {
      const where = t.label
        ? { item_id: (await admin.from("items").select("id").eq("label_serial", t.label).single()).data!.id }
        : { location_id: ids.get(t.place!)! };
      const made = await admin
        .from("maintenance_tickets")
        .insert({ description: t.description, priority: t.priority, reported_by: t.reportedBy, ...where })
        .select("id")
        .single();
      if (made.error) throw made.error;
      for (const s of t.steps) {
        const row =
          s.kind === "assigned"
            ? { kind: s.kind, new_assignee_person_id: contractorId.get(contractorNames[s.contractor])!, note: s.note ?? null }
            : s.kind === "status"
              ? { kind: s.kind, new_status: s.status, note: s.note ?? null }
              : s.kind === "priority"
                ? { kind: s.kind, new_priority: s.priority, note: s.note ?? null }
              : s.kind === "closed"
                ? { kind: s.kind, note: s.note, cost_cents: s.costCents ?? null }
                : { kind: s.kind, note: s.note };
        const step = await admin.from("maintenance_ticket_events").insert({ ticket_id: made.data.id, ...row });
        if (step.error) throw step.error;
      }
    }
  }
  console.log(`Maintenance tickets: ${toAdd.length} created, ${SEED_TICKETS.length - toAdd.length} already there.`);
}

// P4.2: the lending library.
{
  const last = SEED_LIBRARY_FIRST_LABEL + SEED_LIBRARY_LABEL_COUNT - 1;
  const libraryLabels = Array.from({ length: SEED_LIBRARY_LABEL_COUNT }, (_, i) => ({ serial: labelSerial(SEED_LIBRARY_FIRST_LABEL + i) }));
  const { error: lError } = await admin.from("labels").upsert(libraryLabels, { onConflict: "serial", ignoreDuplicates: true });
  if (lError) throw lError;
  const { data: run, error: runFindError } = await admin.from("label_print_runs").select("id").eq("first_number", SEED_LIBRARY_FIRST_LABEL).maybeSingle();
  if (runFindError) throw runFindError;
  if (!run) {
    const { error: runAddError } = await admin.from("label_print_runs").insert({ first_number: SEED_LIBRARY_FIRST_LABEL, last_number: last });
    if (runAddError) throw runAddError;
  }

  const books = D(seedLibrary());
  const { data: haveBooks, error: hbError } = await admin.from("library_books").select("id, title").in("title", books.map((b) => b.title));
  if (hbError) throw hbError;
  const bookId = new Map(haveBooks.map((b) => [b.title, b.id]));
  let addedBooks = 0;
  for (const b of books.filter((x) => !bookId.has(x.title))) {
    const { data, error } = await admin
      .from("library_books")
      .insert({ title: b.title, author: b.author, isbn: b.isbn, publisher: b.publisher, published_year: b.year, language: b.language })
      .select("id")
      .single();
    if (error) throw error;
    bookId.set(b.title, data.id);
    addedBooks++;
  }

  // A copy goes only on a label that is still free (if test runs put an
  // item on one of these numbers before this seed ran, that copy is skipped).
  const wanted = books.flatMap((b) => b.copies.map((c) => ({ ...c, book: b.title })));
  const [{ data: onCopies, error: ocError }, { data: onItems, error: oiError }] = await Promise.all([
    admin.from("library_copies").select("label_serial").in("label_serial", wanted.map((c) => c.label)),
    admin.from("items").select("label_serial").in("label_serial", wanted.map((c) => c.label)),
  ]);
  if (ocError) throw ocError;
  if (oiError) throw oiError;
  const taken = new Set([...onCopies, ...onItems].map((r) => r.label_serial));
  const newCopies = wanted
    .filter((c) => !taken.has(c.label))
    .map((c) => ({ book_id: bookId.get(c.book)!, label_serial: c.label, copy_note: c.note }));
  if (newCopies.length) {
    const { error } = await admin.from("library_copies").insert(newCopies);
    if (error) throw error;
  }
  const skipped = wanted.filter((c) => taken.has(c.label)).length - (onCopies?.length ?? 0);
  console.log(
    `Library: ${addedBooks} books and ${newCopies.length} copies created, ${books.length - addedBooks} books already there` +
      (skipped > 0 ? `; ${skipped} copies skipped (their label is on an item)` : "") +
      ".",
  );
}

// P4.4: borrowers and loans. Loans are added only for a borrower who has
// none yet, so running the seed twice adds nothing. Made with the master
// key, the only way to record a loan in the past.
{
  const today = todayInDublin();
  const { data: have, error: hError } = await admin.from("library_borrowers").select("id, full_name").in("full_name", SEED_BORROWERS.map((b) => b.full_name));
  if (hError) throw hError;
  const borrowerId = new Map(have.map((b) => [b.full_name, b.id as string]));
  const toAdd = SEED_BORROWERS.filter((b) => !borrowerId.has(b.full_name)).map((b) => ({ ...b, active: true }));
  if (toAdd.length) {
    const { data, error } = await admin.from("library_borrowers").insert(toAdd).select("id, full_name");
    if (error) throw error;
    for (const b of data) borrowerId.set(b.full_name, b.id);
  }
  const { data: lentAlready, error: laError } = await admin.from("library_loans").select("borrower_id").in("borrower_id", [...borrowerId.values()]);
  if (laError) throw laError;
  const hasLoans = new Set(lentAlready.map((l) => l.borrower_id));
  const loans = D(seedLoans()).filter((l) => !hasLoans.has(borrowerId.get(l.borrower)!));
  const { data: copies, error: cError } = await admin.from("library_copies").select("id, label_serial").in("label_serial", loans.map((l) => l.label));
  if (cError) throw cError;
  const copyId = new Map(copies.map((c) => [c.label_serial, c.id as string]));
  let made = 0;
  for (const l of loans) {
    const copy = copyId.get(l.label);
    if (!copy) continue; // its label went on an item in a test run
    const { data: loan, error } = await admin
      .from("library_loans")
      .insert({ copy_id: copy, borrower_id: borrowerId.get(l.borrower)!, lent_on: addDays(today, l.lent), first_due_on: addDays(today, l.due) })
      .select("id")
      .single();
    if (error) throw error;
    let lastReturn: number | null = null;
    for (const e of l.then) {
      const row: Record<string, unknown> = { loan_id: loan.id, kind: e.kind, happened_on: addDays(today, e.on) };
      if (e.kind === "due_moved") row.new_due_on = addDays(today, e.to);
      if (e.kind === "return_undone") row.undoes_entry_id = lastReturn;
      const { data: entry, error: eError } = await admin.from("library_loan_entries").insert(row).select("id").single();
      if (eError) throw eError;
      if (e.kind === "returned") lastReturn = entry.id;
    }
    made++;
  }
  // Switched off last, once their books are back.
  for (const b of SEED_BORROWERS.filter((x) => !x.active)) {
    const { error } = await admin.from("library_borrowers").update({ active: false }).eq("id", borrowerId.get(b.full_name)!);
    if (error) throw error;
  }
  console.log(`Library borrowers: ${toAdd.length} created, ${SEED_BORROWERS.length - toAdd.length} already there; ${made} loans created.`);
}

// P4.5: lost and withdrawn copies (on labels near the end of the library
// run, which no seeded loan uses). Added only to a copy with no entries yet,
// so running the seed twice adds nothing. Made with the master key, the
// only way to record an entry in the past.
{
  const today = todayInDublin();
  const plan: { label: number; steps: { kind: "lost" | "withdrawn" | "found"; on: number }[] }[] = [
    { label: 385, steps: [{ kind: "lost", on: -12 }] },
    { label: 386, steps: [{ kind: "lost", on: -40 }] },
    { label: 387, steps: [{ kind: "lost", on: -30 }, { kind: "found", on: -5 }] },
    { label: 388, steps: [{ kind: "withdrawn", on: -60 }] },
    { label: 389, steps: [{ kind: "lost", on: -90 }, { kind: "withdrawn", on: -20 }] },
  ];
  const serials = [...plan.map((p) => labelSerial(p.label)), labelSerial(384)];
  const { data: copies, error: cError } = await admin.from("library_copies").select("id, label_serial").in("label_serial", serials);
  if (cError) throw cError;
  const copyId = new Map(copies.map((c) => [c.label_serial, c.id as string]));
  const { data: haveEntries, error: eError } = await admin.from("library_copy_entries").select("copy_id").in("copy_id", [...copyId.values()]);
  if (eError) throw eError;
  const done = new Set(haveEntries.map((e) => e.copy_id));
  let made = 0;
  for (const p of plan) {
    const copy = copyId.get(labelSerial(p.label));
    if (!copy || done.has(copy)) continue;
    for (const st of p.steps) {
      const { error } = await admin.from("library_copy_entries").insert({ copy_id: copy, kind: st.kind, happened_on: addDays(today, st.on) });
      if (error) throw error;
      made++;
    }
  }
  // One copy lent and then lost: its loan ends with the book.
  const lentCopy = copyId.get(labelSerial(384));
  if (lentCopy && !done.has(lentCopy)) {
    const { data: loans, error: lError } = await admin.from("library_loans").select("id").eq("copy_id", lentCopy).limit(1);
    if (lError) throw lError;
    const { data: person, error: pError } = await admin.from("library_borrowers").select("id").eq("full_name", SEED_BORROWERS[14].full_name).maybeSingle();
    if (pError) throw pError;
    if (!loans.length && person) {
      const { error: iError } = await admin.from("library_loans").insert({ copy_id: lentCopy, borrower_id: person.id, lent_on: addDays(today, -40), first_due_on: addDays(today, -19) });
      if (iError) throw iError;
      const { error } = await admin.from("library_copy_entries").insert({ copy_id: lentCopy, kind: "lost" });
      if (error) throw error;
      made++;
    }
  }
  console.log(`Library lost and withdrawn: ${made} entries created.`);
}

// 22. Companies, makes and models (P1.19), who services what and the staff
// contact person per category, placeholder manuals (P1.20), and one ticket
// passed to a company (P1.21). Only what is not already there.
{
  // The online demo uses real Irish firms, real makers and their published
  // manuals (owner's decision, 22 Nov 2026; scripts/demo-data.mts). Everywhere
  // else the obviously fictional "Example ..." companies.
  const demo = environment === "staging";
  const companiesData = demo ? DEMO_COMPANIES : SEED_COMPANIES;
  const modelsData: (SeedModel & { manualFile?: string; manualTitle?: string })[] = demo ? DEMO_MODELS : SEED_MODELS;
  const linksData = demo ? DEMO_ITEM_LINKS : SEED_ITEM_LINKS;
  const contactsData = demo ? DEMO_CATEGORY_CONTACTS : SEED_CATEGORY_CONTACTS;
  const referral = demo ? DEMO_REFERRAL : D(SEED_REFERRAL);
  const { data: have, error } = await admin.from("companies").select("id, name");
  if (error) throw error;
  const companyId = new Map(have.map((c) => [c.name, c.id]));
  const newCompanies = companiesData
    .filter((c) => !companyId.has(c.name))
    .map((c) => ({ ...c, phone: c.phone || null, email: c.email || null, website: c.website || null }));
  if (newCompanies.length) {
    const { data, error: e } = await admin.from("companies").insert(newCompanies).select("id, name");
    if (e) throw e;
    for (const c of data) companyId.set(c.name, c.id);
  }
  const { data: cats, error: ce } = await admin.from("item_categories").select("id, name");
  if (ce) throw ce;
  const catId = new Map(cats.map((c) => [c.name, c.id]));

  const { data: haveModels, error: me } = await admin.from("product_models").select("id, model_name");
  if (me) throw me;
  const modelId = new Map(haveModels.map((m) => [m.model_name, m.id]));
  let manuals = 0;
  for (const m of modelsData.filter((x) => !modelId.has(x.model))) {
    const { data, error: e } = await admin
      .from("product_models")
      .insert({
        maker_company_id: companyId.get(m.maker),
        model_name: m.model,
        category_id: catId.get(m.category),
        service_company_id: m.service ? companyId.get(m.service) : null,
        warranty_months: m.warrantyMonths,
        notes: m.notes ?? null,
      })
      .select("id")
      .single();
    if (e) throw e;
    modelId.set(m.model, data.id);
    // A real manual from demo-files/ on the demo (skipped if the file is not there); a placeholder elsewhere.
    const realFile = demo && m.manualFile ? `${DEMO_FILES_DIR}/${m.manualFile}` : null;
    if (m.manual && (!realFile || existsSync(realFile))) {
      const path = `models/${data.id}/${crypto.randomUUID()}.pdf`;
      const bytes = realFile ? readFileSync(realFile) : sampleManualPdf(m.model);
      const up = await admin.storage.from("asset-documents").upload(path, bytes, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const title = m.manualTitle ?? `${m.model} user manual (sample)`;
      const doc = await admin.from("asset_documents").insert({ model_id: data.id, kind: "manual", title, file_path: path });
      if (doc.error) throw doc.error;
      manuals++;
    }
  }

  // Items: only those with nothing recorded yet.
  let linked = 0;
  for (const link of linksData) {
    const changes = {
      ...(link.model ? { model_id: modelId.get(link.model) } : {}),
      ...(link.supplier ? { supplier_company_id: companyId.get(link.supplier) } : {}),
      ...(link.service ? { service_company_id: companyId.get(link.service) } : {}),
    };
    const { data, error: e } = await admin
      .from("items")
      .update(changes)
      .like("name", `${D(link.namePrefix)}%`)
      .is("model_id", null)
      .is("supplier_company_id", null)
      .is("service_company_id", null)
      .select("id, label_serial");
    if (e) throw e;
    for (const it of data) {
      if (link.model) {
        const serial = demo ? `SN${(48213 + Number(it.label_serial.slice(-4)) * 37).toString().padStart(7, "0")}` : `DEMO-SN-${it.label_serial.slice(-4)}`;
        const s = await admin.from("items").update({ maker_serial: serial }).eq("id", it.id);
        if (s.error) throw s.error;
      }
    }
    linked += data.length;
  }

  // Category defaults: only where nothing is set yet.
  const roleOf = (role: string) => D(SEED_PEOPLE.find((p) => p.role === role && p.active)!.full_name);
  const { data: contacts, error: pe } = await admin.from("people").select("id, full_name").in("full_name", [roleOf("Caretaker"), roleOf("Gardener")]);
  if (pe) throw pe;
  const personId = new Map(contacts.map((p) => [p.full_name, p.id]));
  for (const c of contactsData) {
    const { error: e } = await admin
      .from("item_categories")
      .update({
        service_company_id: c.service ? companyId.get(c.service) : null,
        contact_person_id: c.contactRole ? personId.get(roleOf(c.contactRole)) : null,
      })
      .eq("name", c.category)
      .is("service_company_id", null)
      .is("contact_person_id", null);
    if (e) throw e;
  }

  // The ticket passed to a company.
  const ref = referral;
  const { data: there } = await admin.from("maintenance_tickets").select("id").eq("description", ref.description).maybeSingle();
  if (!there) {
    const { data: mower } = await admin.from("items").select("id").eq("name", ref.assetName).single();
    const t = await admin.from("maintenance_tickets").insert({ description: ref.description, priority: "normal", reported_by: ref.reportedBy, item_id: mower!.id }).select("id").single();
    if (t.error) throw t.error;
    const step = await admin
      .from("maintenance_ticket_events")
      .insert({ ticket_id: t.data.id, kind: "referred", company_id: companyId.get(ref.company), company_job_ref: ref.jobRef, note: ref.note });
    if (step.error) throw step.error;
  }
  console.log(`Companies: ${newCompanies.length} added; makes and models with ${manuals} sample manuals; ${linked} items linked; category contacts set.`);
}

// 23. Expense claims (P5.2): only if there are none yet. About 60 made-up
// claims entered and decided by the signed-in test accounts, as on screen,
// so every rule applies (nobody approves their own entry or money they paid;
// approvers are linked; big ones get a second approval). Each receipt is a
// plainly fake "SAMPLE RECEIPT" picture. Every decision is dated today: the
// database stamps the time itself, so the seed cannot backdate them.
{
  const { count: claimCount, error: claimCountError } = await admin.from("expense_claims").select("id", { count: "exact", head: true });
  if (claimCountError) throw claimCountError;
  if (!claimCount) {
    const clients = new Map<string, Awaited<ReturnType<typeof signedInAs>>>();
    const as = async (email: string) => {
      if (!clients.has(email)) clients.set(email, await signedInAs(email));
      return clients.get(email)!;
    };
    const [{ data: cats }, { data: funds }, { data: people }] = await Promise.all([
      admin.from("expense_categories").select("id, name"),
      admin.from("expense_funds").select("id, name"),
      admin.from("people").select("id, full_name"),
    ]);
    const catId = new Map((cats ?? []).map((c) => [c.name, c.id]));
    const fundId = new Map((funds ?? []).map((f) => [f.name, f.id]));
    const personId = new Map((people ?? []).map((p) => [p.full_name, p.id]));
    const accountOf = new Map(Object.entries(SEED_ACCOUNT_PERSON).map(([email, name]) => [D(name), email]));
    const ok = async (r: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await r;
      if (error) throw new Error(error.message);
    };
    const owed = new Map<string, number[]>();
    let made = 0;
    for (const [i, c] of seedClaims().entries()) {
      const enterer = await as(c.enteredBy);
      const paidBy = c.paidBy ? D(c.paidBy) : null;
      const files: string[] = [];
      if (!c.lost) {
        const png = await sampleReceiptPng([D(c.shop), `Date: ${addDays(todayInDublin(), -c.daysAgo)}`, `Total EUR ${(c.amountCents / 100).toFixed(2)}`]);
        // The name the website gives a receipt; the store takes no other (0054).
        const path = `claims/${todayInDublin().slice(0, 7)}/${crypto.randomUUID()}-receipt-1.png`;
        const up = await enterer.storage.from("expense-receipts").upload(path, png, { contentType: "image/png", upsert: false });
        if (up.error && !/exists/i.test(up.error.message)) throw up.error;
        files.push(path);
      }
      const { data: id, error } = await enterer.rpc("enter_expense_claim", {
        p_amount_cents: c.amountCents,
        p_receipt_date: addDays(todayInDublin(), -c.daysAgo),
        p_category_id: catId.get(c.category),
        p_description: D(c.description),
        p_payment: c.payment,
        p_paid_by_person_id: paidBy ? personId.get(paidBy) : null,
        p_vat_cents: c.vatCents,
        p_paid_to_text: D(c.shop),
        p_suggested_fund_id: fundId.get(c.fund),
        p_receipt_lost_reason: c.lost ? D(c.lost) : null,
        p_files: files,
      });
      if (error) throw new Error(`Claim ${i + 1}: ${error.message}`);
      made++;
      // The approvers who may decide: not whoever entered it or paid.
      const payerAccount = paidBy ? accountOf.get(paidBy) : undefined;
      const allowed = SEED_APPROVERS.filter((a) => a !== c.enteredBy && a !== payerAccount);
      const [first, second] = allowed;
      const decide = async (who: string, kind: string, extra: Record<string, unknown> = {}) =>
        ok((await as(who)).from("expense_decisions").insert({ claim_id: id, kind, ...extra }));
      if (c.outcome === "withdrawn") await decide(c.enteredBy, "withdrawn", { note: D("Test: typed the wrong amount (made-up)") });
      if (c.outcome === "rejected") await decide(first, "rejected", { note: D("Test: not a Centre expense (made-up)") });
      if (c.outcome === "second" || c.outcome === "approved") await decide(first, "approved", { fund_id: fundId.get(c.fund) });
      const needsSecond = c.amountCents > 50000 || (c.lost !== null && c.amountCents > 5000);
      if (c.outcome === "approved" && needsSecond) await decide(second, "second_approved");
      if (c.outcome === "approved" && c.correctTo) {
        const { data: fix, error: fixError } = await enterer.rpc("enter_expense_claim", {
          p_amount_cents: c.correctTo,
          p_receipt_date: addDays(todayInDublin(), -c.daysAgo),
          p_category_id: catId.get(c.category),
          p_description: null,
          p_payment: c.payment,
          p_paid_by_person_id: paidBy ? personId.get(paidBy) : null,
          p_vat_cents: c.vatCents,
          p_suggested_fund_id: fundId.get(c.fund),
          p_corrects_id: id,
          p_correction_reason: D("Test: the receipt said a little more (made-up)"),
        });
        if (fixError) throw new Error(`Correction of claim ${i + 1}: ${fixError.message}`);
        await ok((await as(first)).from("expense_decisions").insert({ claim_id: fix, kind: "approved", fund_id: fundId.get(c.fund) }));
      }
      if (c.repaid && paidBy) owed.set(paidBy, [...(owed.get(paidBy) ?? []), id as number]);
    }
    // One repayment per person for their repaid claims, recorded by someone else.
    let repayments = 0;
    for (const [person, claims] of owed) {
      const recorder = SEED_APPROVERS.find((a) => a !== accountOf.get(person))!;
      await ok(
        (await as(recorder)).rpc("record_expense_repayment", {
          p_claim_ids: claims,
          p_paid_on: todayInDublin(),
          p_method: repayments % 2 ? "cash" : "bank_transfer",
          p_reference: `TEST-${String(repayments + 1).padStart(3, "0")}`,
        }),
      );
      repayments++;
    }
    console.log(`Expense claims: ${made} made-up claims with sample receipts, ${repayments} repayments.`);
  } else {
    console.log(`Expense claims: ${claimCount} already there.`);
  }
}

// 21. On the staging demo, nobody keeps the seed's authenticator keys: they are
// removed, so each account sets up its own phone at its first sign-in (the
// normal set-up screen), and no key is left on this computer.
if (environment === "staging") {
  for (const person of SEED_ADMINS) {
    const user = freshList.users.find((u) => u.email === person.email)!;
    const { data: factorData, error: factorError } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
    if (factorError) throw factorError;
    for (const f of factorData.factors) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
      if (error) throw error;
    }
  }
  writeTestAuthenticators({});
  console.log("Staging: authenticators removed; each account sets up its phone at first sign-in.");
}

console.log(
  `Seed complete: ${SEED_ADMINS.length} fictional accounts, ${SEED_LOCATIONS.length} fictional locations, ${items.length} fictional items, ${SEED_PEOPLE.length} fictional people, ${SEED_POLICIES.length} fictional policies, ${SEED_VEHICLES.length} fictional vehicles, ${SEED_TYPED_RENEWALS.length} fictional renewals.`,
);
