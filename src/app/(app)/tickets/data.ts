// Loading tickets for the list and its CSV file, with the names that go
// with them (place, asset, reported by, assigned to). Runs on the web server
// as the signed-in admin; the database decides what they may read.
import type { SupabaseClient } from "@supabase/supabase-js";
import { locationAndInside, locationOptions } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { pageRows } from "@/lib/supabase/page-rows";
import { TICKET_COLUMNS, type TicketCsvRow, type TicketFilters, type TicketRow } from "@/lib/tickets/rules";
import { loadLookups } from "../items/data";

export const TICKET_PHOTO_BUCKET = "ticket-photos";

/** Names of these people, switched-off ones included. */
export async function personNames(supabase: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await supabase.from("people").select("id, full_name").in("id", unique.slice(i, i + 200));
    for (const p of (data ?? []) as { id: string; full_name: string }[]) names.set(p.id, p.full_name);
  }
  return names;
}

/** "ICCI-000123 Chair (oak)" for each asset. */
export async function assetNames(supabase: SupabaseClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  for (let i = 0; i < unique.length; i += 200) {
    const { data } = await supabase.from("items").select("id, name, label_serial").in("id", unique.slice(i, i + 200));
    for (const it of (data ?? []) as { id: string; name: string; label_serial: string }[]) names.set(it.id, `${it.label_serial} ${it.name}`);
  }
  return names;
}

type Lookups = Awaited<ReturnType<typeof loadLookups>>;

/**
 * The filtered list, in the list's order (worked out by the database, the
 * same order as listOrder: not closed first, urgent at the top; then the
 * most recently closed). Round C2: the page asks for one page at a time.
 */
async function ticketQuery(supabase: SupabaseClient, f: TicketFilters, lookups: Lookups, count: boolean) {
  const places = f.place ? locationAndInside(f.place, lookups.locations) : null;
  // P1.21: tickets passed to one company (a "referred" entry naming it).
  const referred = f.company
    ? [
        ...new Set(
          (
            await allRows<{ ticket_id: number }>((from, to) =>
              supabase.from("maintenance_ticket_events").select("ticket_id").eq("kind", "referred").eq("company_id", f.company).order("id").range(from, to),
            )
          ).map((e) => e.ticket_id),
        ),
      ]
    : null;
  const filtered = (onlyUrgentOpen = false) => {
    let q = supabase
      .from("maintenance_ticket_list")
      .select(TICKET_COLUMNS, count ? { count: "exact", head: onlyUrgentOpen } : undefined)
      .order("closed_rank")
      .order("priority_rank")
      .order("status_rank")
      .order("order_time")
      .order("order_id");
    if (f.status === "not_closed") q = q.neq("status", "closed");
    else if (f.status !== "all") q = q.eq("status", f.status);
    if (f.priority) q = q.eq("priority", f.priority);
    if (places) q = q.in("location_id", places);
    if (referred) q = q.in("id", referred.length ? referred : [0]);
    if (f.assigned === "nobody") q = q.is("assigned_person_id", null);
    else if (f.assigned) q = q.eq("assigned_person_id", f.assigned);
    if (onlyUrgentOpen) q = q.eq("priority", "urgent").neq("status", "closed");
    return q;
  };
  return filtered;
}

/** The names that go with each ticket (place, asset, reported by, assigned to). */
async function withNames(supabase: SupabaseClient, rows: TicketRow[], lookups: Lookups): Promise<TicketCsvRow[]> {
  const [people, assets] = await Promise.all([
    personNames(supabase, rows.flatMap((r) => [r.reported_by_person_id, r.assigned_person_id])),
    assetNames(supabase, rows.map((r) => r.item_id)),
  ]);
  return rows.map((r) => ({
    ...r,
    place: lookups.locationName.get(r.location_id) ?? "Unknown location",
    asset: r.item_id ? (assets.get(r.item_id) ?? "") : "",
    reporter: r.reported_by_person_id ? (people.get(r.reported_by_person_id) ?? "A person in the directory") : (r.reported_by ?? ""),
    assignee: r.assigned_person_id ? (people.get(r.assigned_person_id) ?? "A person in the directory") : "",
  }));
}

/** Every ticket that matches (the CSV file). */
export async function loadTickets(supabase: SupabaseClient, f: TicketFilters) {
  const lookups = await loadLookups(supabase);
  const q = await ticketQuery(supabase, f, lookups, false);
  const rows = await allRows<TicketRow>((from, to) => q().range(from, to));
  return { rows: await withNames(supabase, rows, lookups), lookups };
}

/** One page of the list, how many match in all, and how many of those are urgent and open. */
export async function loadTicketPage(supabase: SupabaseClient, f: TicketFilters, page: number, size: number) {
  const lookups = await loadLookups(supabase);
  const q = await ticketQuery(supabase, f, lookups, true);
  const [shown, urgent] = await Promise.all([
    pageRows<TicketRow>(page, size, (from, to) => q().range(from, to)),
    q(true),
  ]);
  if (urgent.error) throw new Error(`A list could not be loaded: ${urgent.error.message}`);
  return { ...shown, rows: await withNames(supabase, shown.rows, lookups), urgent: urgent.count ?? 0, lookups };
}

/** The choices for the list's filters: every place (switched-off ones too, old tickets may be there) and everyone who has a ticket. */
export async function filterChoices(supabase: SupabaseClient, lookups: Awaited<ReturnType<typeof loadLookups>>) {
  const places = [...lookups.locationName].map(([id, path]) => ({ id, path })).sort((a, b) => a.path.localeCompare(b.path));
  const assigned = await allRows<{ id: number; assigned_person_id: string }>((from, to) =>
    supabase.from("maintenance_tickets").select("id, assigned_person_id").not("assigned_person_id", "is", null).order("id").range(from, to),
  );
  const names = await personNames(supabase, assigned.map((a) => a.assigned_person_id));
  const people = [...names].map(([id, full_name]) => ({ id, full_name })).sort((a, b) => a.full_name.localeCompare(b.full_name));
  // P1.21: every company a ticket has been passed to.
  const refs = await allRows<{ id: number; company_id: string }>((from, to) =>
    supabase.from("maintenance_ticket_events").select("id, company_id").eq("kind", "referred").order("id").range(from, to),
  );
  const ids = [...new Set(refs.map((r) => r.company_id))];
  const { data: named } = ids.length ? await supabase.from("companies").select("id, name").in("id", ids) : { data: [] };
  const companies = ((named ?? []) as { id: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name));
  return { places, people, companies };
}

/** Places a problem can be reported at: switched-on buildings, rooms and store rooms. */
export function reportPlaces(lookups: Awaited<ReturnType<typeof loadLookups>>) {
  return locationOptions(lookups.locations, ["building", "room", "store_room"]);
}
