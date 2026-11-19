// After a test run: switch off the made-up places, people, training types
// (P2.4), policies (P2.5), vehicles (P2.7), renewals (P2.8), rota slot types (P3.1), rota templates (P3.4), library books (P4.2) and library borrowers (P4.4) that the tests created (names starting "Test run "), so the
// development screens are not crowded with thousands of them. Nothing is
// deleted; each switch-off is an ordinary change, recorded in the audit log
// like any other.
//
// The database refuses to switch off a place that still holds items, has a
// stocktake under way, or has places switched on inside it. So test places
// are emptied first, with the same ordinary entries an admin would make:
// made-up chairs are moved to one "Test storage room", made-up bin bags are
// counted down to zero. Then places are switched off from the innermost
// outwards. A place with a disposal waiting for approval, or a stocktake
// under way, is left on.
import type { SupabaseClient } from "@supabase/supabase-js";

const INNERMOST_FIRST = ["shelf", "store_room", "room", "building"];
const AT_ONCE = 20;
const PAGE = 1000;

/** The one made-up room that test items end up in (inside the seed's Test Building A). */
export const STORAGE_ROOM = "Test storage room";
const SEED_BUILDING = "Test Building A";
const WHO = "Test run tidy-up";
const NOTE = "Test run tidy-up: moved out of a test place so the place can be switched off.";

export type TidyResult = { books: number; borrowers: number; people: number; trainingTypes: number; slotTypes: number; rotaTemplates: number; policies: number; vehicles: number; renewals: number; warrantiesCleared: number; places: number; placesLeftOn: number; chairsMoved: number; stockCounted: number };

function inGroups<T>(all: T[], size: number): T[][] {
  const groups: T[][] = [];
  for (let i = 0; i < all.length; i += size) groups.push(all.slice(i, i + size));
  return groups;
}

async function storageRoom(db: SupabaseClient): Promise<string> {
  const found = await db.from("locations").select("id").eq("name", STORAGE_ROOM).eq("active", true).maybeSingle();
  if (found.error) throw new Error(found.error.message);
  if (found.data) return found.data.id;
  const building = await db.from("locations").select("id").eq("name", SEED_BUILDING).single();
  if (building.error) throw new Error(`No "${SEED_BUILDING}". Has "npm run db:seed" been run?`);
  const made = await db.from("locations").insert({ name: STORAGE_ROOM, kind: "room", parent_id: building.data.id }).select("id").single();
  if (made.error) throw new Error(made.error.message);
  return made.data.id;
}

/** Moves made-up chairs out, and counts made-up bin bags down to zero. */
async function emptyPlaces(db: SupabaseClient, placeIds: string[]) {
  let chairsMoved = 0;
  let stockCounted = 0;
  if (!placeIds.length) return { chairsMoved, stockCounted };
  const storage = await storageRoom(db);
  for (const ids of inGroups(placeIds, 150)) {
    const { data: items, error } = await db
      .from("items")
      .select("id, kind, condition")
      .in("location_id", ids)
      .or("condition.is.null,condition.neq.disposed");
    if (error) throw new Error(error.message);
    const assets = (items ?? []).filter((i) => i.kind === "fixed_asset").map((i) => i.id as string);
    const stock = (items ?? []).filter((i) => i.kind === "consumable").map((i) => i.id as string);

    // Not a chair with a disposal waiting: a different admin must decide first.
    const waiting = new Set<string>();
    for (const g of inGroups(assets, 150)) {
      const { data } = await db.from("asset_events").select("item_id").in("item_id", g).eq("status", "pending");
      for (const e of data ?? []) waiting.add(e.item_id);
    }
    for (const g of inGroups(assets.filter((id) => !waiting.has(id)), AT_ONCE)) {
      const results = await Promise.all(
        g.map((item_id) => db.from("asset_events").insert({ item_id, kind: "move", to_location_id: storage, note: NOTE, reported_by: WHO })),
      );
      chairsMoved += results.filter((r) => !r.error).length;
    }

    // Bin bags never counted, or counted above zero, get a count of zero.
    const level = new Map<string, number | null>();
    for (const g of inGroups(stock, 150)) {
      const { data } = await db.from("stock_levels").select("item_id, quantity").in("item_id", g);
      for (const l of data ?? []) level.set(l.item_id, l.quantity);
    }
    const toCount = stock.filter((id) => (level.get(id) ?? null) === null || (level.get(id) ?? 0) > 0);
    for (const g of inGroups(toCount, AT_ONCE)) {
      const results = await Promise.all(g.map((item_id) => db.from("stock_movements").insert({ item_id, kind: "count", quantity: 0 })));
      stockCounted += results.filter((r) => !r.error).length;
    }
  }
  return { chairsMoved, stockCounted };
}

async function activeTestPlaces(db: SupabaseClient, prefix: string) {
  const rows: { id: string; kind: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("locations")
      .select("id, kind")
      .eq("active", true)
      .like("name", `${prefix}%`)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Uses the master key (the development database only). */
export async function switchOffTestLeftovers(db: SupabaseClient, prefix = "Test run "): Promise<TidyResult> {
  if (!prefix.startsWith("Test run ")) throw new Error('Only records named "Test run ..." are switched off.');

  const people = await db
    .from("people")
    .update({ active: false })
    .eq("active", true)
    .like("full_name", `${prefix}%`)
    .select("id");
  if (people.error) throw new Error(people.error.message);

  const trainingTypes = await db
    .from("training_types")
    .update({ active: false })
    .eq("active", true)
    .like("name", `${prefix}%`)
    .select("id");
  if (trainingTypes.error) throw new Error(trainingTypes.error.message);

  // P3.1: test rota slot types.
  const slotTypes = await db.from("rota_slot_types").update({ active: false }).eq("active", true).like("name", `${prefix}%`).select("id");
  if (slotTypes.error) throw new Error(slotTypes.error.message);

  // P3.4: test rota templates (made with the master key; their slots and uses stay, as always).
  const rotaTemplates = await db.from("rota_templates").update({ active: false }).eq("active", true).like("name", `${prefix}%`).select("id");
  if (rotaTemplates.error) throw new Error(rotaTemplates.error.message);

  // P2.5: test policies (their versions and PDFs stay, as always).
  const policies = await db.from("policies").update({ active: false }).eq("active", true).like("title", `${prefix}%`).select("id");
  if (policies.error) throw new Error(policies.error.message);

  // P2.7: vehicles on test assets (their entries stay, as always).
  const testVehicles = await db.from("vehicles").select("id, items!inner(name)").eq("active", true).like("items.name", `${prefix}%`);
  if (testVehicles.error) throw new Error(testVehicles.error.message);
  let vehicles = 0;
  for (const ids of inGroups((testVehicles.data ?? []).map((v) => v.id as string), 150)) {
    const off = await db.from("vehicles").update({ active: false }).in("id", ids).select("id");
    if (off.error) throw new Error(off.error.message);
    vehicles += off.data?.length ?? 0;
  }

  // P2.8: typed-in test renewals (their due dates stay, as always).
  const renewals = await db.from("renewals").update({ active: false }).eq("active", true).like("title", `${prefix}%`).select("id");
  if (renewals.error) throw new Error(renewals.error.message);
  // P2.8: test assets with a warranty would otherwise sit in the register
  // for ever; their warranty date is cleared (an ordinary, logged change).
  const warranties = await db.from("items").update({ warranty_end: null }).not("warranty_end", "is", null).neq("condition", "disposed").like("name", `${prefix}%`).select("id");
  if (warranties.error) throw new Error(warranties.error.message);

  // P4.2: test library books (their copies stay, as always).
  const books = await db.from("library_books").update({ active: false }).eq("active", true).like("title", `${prefix}%`).select("id");
  if (books.error) throw new Error(books.error.message);

  // P4.4: test borrowers. Their books still out are returned first (an
  // ordinary return entry), then they are switched off.
  const testBorrowers = await db.from("library_borrowers").select("id").eq("active", true).like("full_name", `${prefix}%`);
  if (testBorrowers.error) throw new Error(testBorrowers.error.message);
  const borrowerIds = (testBorrowers.data ?? []).map((b) => b.id as string);
  for (let i = 0; i < borrowerIds.length; i += 100) {
    const open = await db.from("library_loan_status").select("id").eq("is_open", true).in("borrower_id", borrowerIds.slice(i, i + 100));
    if (open.error) throw new Error(open.error.message);
    if (open.data?.length) {
      const r = await db.from("library_loan_entries").insert(open.data.map((l) => ({ loan_id: l.id, kind: "returned" })));
      if (r.error) throw new Error(r.error.message);
    }
  }
  const borrowers = borrowerIds.length
    ? await db.from("library_borrowers").update({ active: false }).eq("active", true).like("full_name", `${prefix}%`).select("id")
    : { data: [], error: null };
  if (borrowers.error) throw new Error(borrowers.error.message);

  let left = await activeTestPlaces(db, prefix);
  const emptied = await emptyPlaces(db, left.map((l) => l.id));

  let places = 0;
  // A room can be switched off only after its shelves, so try again while
  // each round still switches something off.
  for (let round = 0; round < INNERMOST_FIRST.length + 1 && left.length; round++) {
    let done = 0;
    for (const kind of INNERMOST_FIRST) {
      const ofKind = left.filter((l) => l.kind === kind);
      for (let i = 0; i < ofKind.length; i += AT_ONCE) {
        const results = await Promise.all(
          ofKind.slice(i, i + AT_ONCE).map((l) => db.from("locations").update({ active: false }).eq("id", l.id).select("id")),
        );
        // A refusal (the place still holds items, for example) is expected.
        done += results.filter((r) => !r.error && r.data?.length).length;
      }
    }
    places += done;
    left = await activeTestPlaces(db, prefix);
    if (done === 0) break;
  }
  return { books: books.data?.length ?? 0, borrowers: borrowers.data?.length ?? 0, people: people.data?.length ?? 0, trainingTypes: trainingTypes.data?.length ?? 0, slotTypes: slotTypes.data?.length ?? 0, rotaTemplates: rotaTemplates.data?.length ?? 0, policies: policies.data?.length ?? 0, vehicles, renewals: renewals.data?.length ?? 0, warrantiesCleared: warranties.data?.length ?? 0, places, placesLeftOn: left.length, ...emptied };
}
