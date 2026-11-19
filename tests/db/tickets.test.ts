// Phase 3, slice P3.5: maintenance tickets (PLAN.md 5.3; docs/PHASE-2-AND-3.md
// 5.3). Owner's choices, 15 Nov 2026 (all recommended), and 18 Nov 2026:
//   * A ticket is about one fixed asset (its place is taken from the asset)
//     or about a place. Never a consumable, a disposed asset or a
//     switched-off place.
//   * Status, who it is assigned to, the closing note, cost and closed date
//     are changed only by the database, from history entries that are never
//     changed or deleted. Typing over them is refused, even with the master key.
//   * Closing needs a closing note; a cost is optional and information only.
//     A closed ticket can be reopened with a reason. No second admin needed.
//   * Priority is Low, Normal (the starting choice) or Urgent.
//   * Super Admin and Centre Admin only.
// All of it is enforced by the database itself, so these tests talk to it directly.
import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { seedAdmin } from "../../scripts/seed-data.mts";
import { asRole, masterKeyClient, passwordOnlyClient, signedOutClient, testName, userIdOf } from "./clients";
import { consumableFields, idOf, newFixedAsset, testPhotoPath, TINY_PNG } from "./items-helpers";

const BUCKET = "ticket-photos";
const admins = ["super_admin", "centre_admin"] as const;

const noAccess = [
  { label: "a signed-out visitor", client: async () => signedOutClient() },
  { label: "finance", client: () => asRole("finance") },
  { label: "library_operator", client: () => asRole("library_operator") },
  { label: "a deactivated account", client: () => asRole("centre_admin", false) },
  { label: "a password-only sign-in (no authenticator code)", client: () => passwordOnlyClient(seedAdmin("centre_admin").email) },
];

type Ticket = {
  id: number;
  status: string;
  priority: string;
  item_id: string | null;
  location_id: string;
  assigned_person_id: string | null;
  closing_note: string | null;
  cost_cents: number | null;
  closed_at: string | null;
  created_by: string;
};

const place = () => idOf("locations", "Test Room A1");

async function newPerson(active = true, roleName = "Contractor") {
  const db = masterKeyClient();
  const [role, section] = await Promise.all([
    db.from("person_roles").select("id").eq("name", roleName).single(),
    db.from("sections").select("id").eq("name", "Maintenance").single(),
  ]);
  const { data, error } = await db
    .from("people")
    .insert({ full_name: testName("fixer"), person_role_id: role.data!.id, section_id: section.data!.id, active })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

function open(client: SupabaseClient, extra: Record<string, unknown> = {}) {
  return client
    .from("maintenance_tickets")
    .insert({ description: `${testName("ticket")}: the tap drips`, reported_by: "Test volunteer", ...extra })
    .select()
    .single();
}

async function newTicket(extra: Record<string, unknown> = {}): Promise<Ticket> {
  const { data, error } = await open(await asRole("centre_admin"), { location_id: await place(), ...extra });
  if (error) throw error;
  return data as Ticket;
}

function addEvent(client: SupabaseClient, ticket_id: number, kind: string, extra: Record<string, unknown> = {}) {
  return client.from("maintenance_ticket_events").insert({ ticket_id, kind, ...extra }).select().single();
}

async function mustAdd(ticket_id: number, kind: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await addEvent(await asRole("centre_admin"), ticket_id, kind, extra);
  if (error) throw error;
  return data;
}

async function ticketNow(id: number): Promise<Ticket> {
  const { data, error } = await masterKeyClient().from("maintenance_tickets").select("*").eq("id", id).single();
  if (error) throw error;
  return data as Ticket;
}

async function historyOf(id: number) {
  const { data, error } = await masterKeyClient().from("maintenance_ticket_events").select("*").eq("ticket_id", id).order("id");
  if (error) throw error;
  return data as { kind: string; new_status: string | null; note: string | null }[];
}

// ---------------------------------------------------------------------------
describe("who can see and report tickets", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot read, report or add to tickets`, async () => {
      const t = await newTicket();
      const c = await who.client();
      for (const table of ["maintenance_tickets", "maintenance_ticket_events"]) {
        const { data } = await c.from(table).select("*").limit(5);
        expect(data ?? [], table).toHaveLength(0);
      }
      expect((await open(c, { location_id: await place() })).data).toBeNull();
      expect((await addEvent(c, t.id, "note", { note: "Test: should not save" })).data).toBeNull();
      expect((await c.from("maintenance_tickets").update({ priority: "low" }).eq("id", t.id).select()).data ?? []).toHaveLength(0);
    });
  }

  for (const role of admins) {
    it(`${role} can report a ticket; it starts open, with an "opened" entry, and who is filled in by the database`, async () => {
      const c = await asRole(role);
      const { data, error } = await open(c, { location_id: await place() });
      expect(error).toBeNull();
      expect(data.status).toBe("open");
      expect(data.priority).toBe("normal");
      expect(data.created_by).toBe(userIdOf(seedAdmin(role).email));
      const h = await historyOf(data.id);
      expect(h.map((e) => e.kind)).toEqual(["opened"]);
      expect(h[0].new_status).toBe("open");
    });
  }

  it("nobody can delete a ticket or a history entry, not even with the master key", async () => {
    const t = await newTicket();
    const db = masterKeyClient();
    expect((await db.from("maintenance_ticket_events").delete().eq("ticket_id", t.id)).error).not.toBeNull();
    expect((await db.from("maintenance_tickets").delete().eq("id", t.id)).error).not.toBeNull();
    expect(await ticketNow(t.id)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
describe("what a ticket can be about", () => {
  it("a ticket on an asset takes the asset's place, whatever was sent", async () => {
    const asset = await newFixedAsset();
    const other = await idOf("locations", "Test Room B1");
    const t = await newTicket({ item_id: asset.id, location_id: other });
    expect(t.location_id).toBe(asset.location_id);
  });

  it("a ticket on an asset needs no place to be sent", async () => {
    const asset = await newFixedAsset();
    const { data, error } = await open(await asRole("centre_admin"), { item_id: asset.id });
    expect(error).toBeNull();
    expect(data.location_id).toBe(asset.location_id);
  });

  it("a ticket with no asset needs a place", async () => {
    const r = await open(await asRole("centre_admin"));
    expect(r.error?.message).toMatch(/where/i);
  });

  it("refuses a consumable", async () => {
    const c = await asRole("centre_admin");
    const { data: bags, error } = await c.from("items").insert(await consumableFields()).select().single();
    if (error) throw error;
    const r = await open(c, { item_id: bags.id });
    expect(r.error?.message).toMatch(/consumable/i);
  });

  it("refuses a disposed asset", async () => {
    const asset = await newFixedAsset();
    const first = await asRole("centre_admin");
    const d = await first.from("asset_events").insert({ item_id: asset.id, kind: "disposal", note: "Test: broken", reported_by: "Test volunteer" }).select().single();
    if (d.error) throw d.error;
    const decided = await (await asRole("super_admin")).from("asset_events").update({ status: "approved" }).eq("id", d.data.id);
    if (decided.error) throw decided.error;
    const r = await open(first, { item_id: asset.id });
    expect(r.error?.message).toMatch(/disposed/i);
  });

  it("refuses a switched-off place", async () => {
    const c = await asRole("centre_admin");
    const { data: loc, error } = await c
      .from("locations")
      .insert({ name: testName("closed room"), kind: "room", parent_id: await idOf("locations", "Test Building A") })
      .select("id")
      .single();
    if (error) throw error;
    const off = await c.from("locations").update({ active: false }).eq("id", loc.id);
    if (off.error) throw off.error;
    const r = await open(c, { location_id: loc.id });
    expect(r.error?.message).toMatch(/switched off/i);
  });

  it("needs a description, and a priority of low, normal or urgent", async () => {
    const c = await asRole("centre_admin");
    expect((await open(c, { location_id: await place(), description: "   " })).error?.message).toMatch(/describe/i);
    expect((await open(c, { location_id: await place(), priority: "panic" })).error).not.toBeNull();
    const urgent = await open(c, { location_id: await place(), priority: "urgent" });
    expect(urgent.error).toBeNull();
    expect(urgent.data.priority).toBe("urgent");
  });

  it("reported by is a switched-on person or a typed name, never both, never neither", async () => {
    const c = await asRole("centre_admin");
    const loc = await place();
    const person = await newPerson();
    const off = await newPerson(false);
    expect((await open(c, { location_id: loc, reported_by: null })).error?.message).toMatch(/who reported/i);
    expect((await open(c, { location_id: loc, reported_by_person_id: person })).error?.message).toMatch(/not both/i);
    expect((await open(c, { location_id: loc, reported_by: null, reported_by_person_id: off })).error?.message).toMatch(/switched off/i);
    expect((await open(c, { location_id: loc, reported_by: null, reported_by_person_id: person })).error).toBeNull();
  });

  it("a new ticket cannot start with a status, assignee, closing note or cost", async () => {
    const c = await asRole("centre_admin");
    const loc = await place();
    const person = await newPerson();
    for (const extra of [{ status: "closed" }, { assigned_person_id: person }, { closing_note: "done" }, { cost_cents: 100 }, { closed_at: new Date().toISOString() }]) {
      const r = await open(c, { location_id: loc, ...extra });
      expect(r.error, JSON.stringify(extra)).not.toBeNull();
    }
  });

  it("a photo path must look like a stored file", async () => {
    const r = await open(await asRole("centre_admin"), { location_id: await place(), photo_path: "../../secret file" });
    expect(r.error).not.toBeNull();
  });

  it("can remember the damage report it came from, for the same asset only", async () => {
    const asset = await newFixedAsset();
    const other = await newFixedAsset();
    const c = await asRole("centre_admin");
    const dmg = await c.from("asset_events").insert({ item_id: asset.id, kind: "damage", note: "Test: cracked leg", reported_by: "Test volunteer" }).select().single();
    if (dmg.error) throw dmg.error;
    expect((await open(c, { item_id: other.id, asset_event_id: dmg.data.id })).error?.message).toMatch(/same asset/i);
    expect((await open(c, { location_id: await place(), asset_event_id: dmg.data.id })).error?.message).toMatch(/same asset/i);
    expect((await open(c, { item_id: asset.id, asset_event_id: dmg.data.id })).error).toBeNull();
    // Only one ticket per damage report.
    expect((await open(c, { item_id: asset.id, asset_event_id: dmg.data.id })).error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe("the ticket follows its history, and nothing else", () => {
  it("assigning, progress, waiting, closing and reopening each change the ticket and are all kept", async () => {
    const t = await newTicket();
    const fixer = await newPerson();
    await mustAdd(t.id, "assigned", { new_assignee_person_id: fixer, note: "Test: plumber booked" });
    expect((await ticketNow(t.id)).assigned_person_id).toBe(fixer);

    await mustAdd(t.id, "status", { new_status: "in_progress" });
    expect((await ticketNow(t.id)).status).toBe("in_progress");
    await mustAdd(t.id, "status", { new_status: "waiting", note: "Test: waiting for a part" });
    expect((await ticketNow(t.id)).status).toBe("waiting");
    await mustAdd(t.id, "note", { note: "Test: part ordered" });

    await mustAdd(t.id, "closed", { note: "Test: washer replaced", cost_cents: 4550 });
    let now = await ticketNow(t.id);
    expect(now.status).toBe("closed");
    expect(now.closing_note).toBe("Test: washer replaced");
    expect(now.cost_cents).toBe(4550);
    expect(now.closed_at).not.toBeNull();

    await mustAdd(t.id, "reopened", { note: "Test: dripping again" });
    now = await ticketNow(t.id);
    expect(now.status).toBe("open");
    expect(now.closing_note).toBeNull();
    expect(now.cost_cents).toBeNull();
    expect(now.closed_at).toBeNull();
    expect(now.assigned_person_id).toBe(fixer);

    expect((await historyOf(t.id)).map((e) => e.kind)).toEqual(["opened", "assigned", "status", "status", "note", "closed", "reopened"]);
  });

  it("status, assignee, closing note, cost and closed date cannot be typed over, even with the master key", async () => {
    const t = await newTicket();
    const fixer = await newPerson();
    const db = masterKeyClient();
    for (const change of [
      { status: "closed" },
      { assigned_person_id: fixer },
      { closing_note: "typed over" },
      { cost_cents: 1 },
      { closed_at: new Date().toISOString() },
    ]) {
      const r = await db.from("maintenance_tickets").update(change).eq("id", t.id);
      expect(r.error, JSON.stringify(change)).not.toBeNull();
    }
    const now = await ticketNow(t.id);
    expect(now.status).toBe("open");
    expect(now.assigned_person_id).toBeNull();
  });

  it("an admin's own change to a ticket is silently ignored by the access rules", async () => {
    const t = await newTicket();
    const r = await (await asRole("super_admin")).from("maintenance_tickets").update({ status: "closed" }).eq("id", t.id).select();
    expect(r.data ?? []).toHaveLength(0);
    expect((await ticketNow(t.id)).status).toBe("open");
  });

  it("a ticket's details cannot be changed either, even with the master key", async () => {
    const t = await newTicket();
    const db = masterKeyClient();
    for (const change of [{ description: "changed" }, { location_id: await idOf("locations", "Test Room B1") }, { reported_by: "Someone else" }]) {
      const r = await db.from("maintenance_tickets").update(change).eq("id", t.id);
      expect(r.error, JSON.stringify(change)).not.toBeNull();
    }
  });

  it("history entries can never be changed, even with the master key", async () => {
    const t = await newTicket();
    const e = await mustAdd(t.id, "note", { note: "Test: first look" });
    const r = await masterKeyClient().from("maintenance_ticket_events").update({ note: "rewritten" }).eq("id", e.id);
    expect(r.error).not.toBeNull();
  });

  it('only the database writes the "opened" entry', async () => {
    const t = await newTicket();
    expect((await addEvent(await asRole("centre_admin"), t.id, "opened")).error).not.toBeNull();
    expect((await addEvent(masterKeyClient(), t.id, "opened")).error).not.toBeNull();
    expect((await historyOf(t.id)).filter((e) => e.kind === "opened")).toHaveLength(1);
  });

  it("closing needs a closing note; a cost is optional and never below zero", async () => {
    const t = await newTicket();
    const c = await asRole("centre_admin");
    expect((await addEvent(c, t.id, "closed", { note: " " })).error?.message).toMatch(/closing note/i);
    expect((await addEvent(c, t.id, "closed", { note: "Test: done", cost_cents: -5 })).error).not.toBeNull();
    expect((await addEvent(c, t.id, "closed", { note: "Test: done" })).error).toBeNull();
    expect((await ticketNow(t.id)).cost_cents).toBeNull();
  });

  it("a closed ticket can only be reopened (with a reason) or given a note", async () => {
    const t = await newTicket();
    const c = await asRole("centre_admin");
    await mustAdd(t.id, "closed", { note: "Test: done" });
    expect((await addEvent(c, t.id, "closed", { note: "Test: again" })).error?.message).toMatch(/already closed/i);
    expect((await addEvent(c, t.id, "status", { new_status: "in_progress" })).error?.message).toMatch(/closed/i);
    expect((await addEvent(c, t.id, "assigned", { new_assignee_person_id: await newPerson() })).error?.message).toMatch(/closed/i);
    expect((await addEvent(c, t.id, "note", { note: "Test: invoice filed" })).error).toBeNull();
    expect((await addEvent(c, t.id, "reopened", { note: "" })).error?.message).toMatch(/reason/i);
  });

  it("an open ticket cannot be reopened, and a status change must be a real change", async () => {
    const t = await newTicket();
    const c = await asRole("centre_admin");
    expect((await addEvent(c, t.id, "reopened", { note: "Test: why" })).error?.message).toMatch(/not closed/i);
    expect((await addEvent(c, t.id, "status", { new_status: "open" })).error?.message).toMatch(/already/i);
    expect((await addEvent(c, t.id, "status", { new_status: "closed" })).error?.message).toMatch(/close/i);
  });

  it("assigning needs a switched-on person who is not already assigned", async () => {
    const t = await newTicket();
    const c = await asRole("centre_admin");
    const fixer = await newPerson();
    expect((await addEvent(c, t.id, "assigned")).error?.message).toMatch(/who/i);
    expect((await addEvent(c, t.id, "assigned", { new_assignee_person_id: await newPerson(false) })).error?.message).toMatch(/switched off/i);
    await mustAdd(t.id, "assigned", { new_assignee_person_id: fixer });
    expect((await addEvent(c, t.id, "assigned", { new_assignee_person_id: fixer })).error?.message).toMatch(/already/i);
  });

  it("each kind of entry carries only its own facts", async () => {
    const t = await newTicket();
    const c = await asRole("centre_admin");
    expect((await addEvent(c, t.id, "note", { note: "Test", cost_cents: 100 })).error).not.toBeNull();
    expect((await addEvent(c, t.id, "note", { note: "Test", new_status: "waiting" })).error).not.toBeNull();
    expect((await addEvent(c, t.id, "note", { note: "Test", new_assignee_person_id: await newPerson() })).error).not.toBeNull();
    expect((await addEvent(c, t.id, "note", { note: " " })).error?.message).toMatch(/note/i);
  });
});

// ---------------------------------------------------------------------------
describe("ticket photos (private file storage)", () => {
  for (const role of admins) {
    it(`${role} can add a photo and see it`, async () => {
      const c = await asRole(role);
      const path = testPhotoPath();
      expect((await c.storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png" })).error).toBeNull();
      expect((await c.storage.from(BUCKET).download(path)).error).toBeNull();
    });
  }

  for (const who of noAccess) {
    it(`${who.label} cannot add or see ticket photos`, async () => {
      const path = testPhotoPath();
      await (await asRole("centre_admin")).storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png" });
      const c = await who.client();
      expect((await c.storage.from(BUCKET).upload(testPhotoPath(), TINY_PNG, { contentType: "image/png" })).error).not.toBeNull();
      expect((await c.storage.from(BUCKET).download(path)).error).not.toBeNull();
    });
  }

  it("photos cannot be replaced or deleted, and only pictures are accepted", async () => {
    const c = await asRole("super_admin");
    const path = testPhotoPath();
    await c.storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png" });
    expect((await c.storage.from(BUCKET).upload(path, TINY_PNG, { contentType: "image/png", upsert: true })).error).not.toBeNull();
    await c.storage.from(BUCKET).remove([path]);
    expect((await masterKeyClient().storage.from(BUCKET).download(path)).error).toBeNull();
    const txt = await c.storage
      .from(BUCKET)
      .upload(testPhotoPath().replace(".png", ".txt"), new TextEncoder().encode("not a photo"), { contentType: "text/plain" });
    expect(txt.error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Slice P3.6 (owner's choices, 19 Nov 2026, recommended answers): priority
// can change after reporting, as a history entry; any switched-on person can
// be assigned; closing a ticket on a damaged asset can mark it repaired in
// the same step, the two records linked.
function closeTicket(client: SupabaseClient, id: number, note: string, extra: { cost?: number | null; repaired?: string | null } = {}) {
  return client.rpc("close_maintenance_ticket", {
    p_ticket_id: id,
    p_note: note,
    p_cost_cents: extra.cost ?? null,
    p_repaired_condition: extra.repaired ?? null,
  });
}

async function damagedAsset() {
  const asset = await newFixedAsset();
  const c = await asRole("centre_admin");
  const dmg = await c.from("asset_events").insert({ item_id: asset.id, kind: "damage", note: "Test: cracked", reported_by: "Test volunteer" }).select().single();
  if (dmg.error) throw dmg.error;
  return { asset, damageId: dmg.data.id as number };
}

async function conditionOf(itemId: string) {
  const { data, error } = await masterKeyClient().from("items").select("condition").eq("id", itemId).single();
  if (error) throw error;
  return data.condition as string;
}

describe("changing priority (P3.6)", () => {
  it("is a history entry, and the ticket follows it", async () => {
    const t = await newTicket();
    const e = await mustAdd(t.id, "priority", { new_priority: "urgent", note: "Test: water reaching the carpet" });
    expect(e.kind).toBe("priority");
    expect((await ticketNow(t.id)).priority).toBe("urgent");
  });

  it("must be a real change, on a ticket not closed, and only on a priority entry", async () => {
    const t = await newTicket();
    const c = await asRole("centre_admin");
    expect((await addEvent(c, t.id, "priority", { new_priority: "normal" })).error?.message).toMatch(/already/i);
    expect((await addEvent(c, t.id, "priority")).error?.message).toMatch(/priority/i);
    expect((await addEvent(c, t.id, "note", { note: "Test", new_priority: "low" })).error).not.toBeNull();
    await mustAdd(t.id, "closed", { note: "Test: done" });
    expect((await addEvent(c, t.id, "priority", { new_priority: "low" })).error?.message).toMatch(/closed/i);
  });

  it("still cannot be typed over, even with the master key", async () => {
    const t = await newTicket();
    expect((await masterKeyClient().from("maintenance_tickets").update({ priority: "urgent" }).eq("id", t.id)).error).not.toBeNull();
    expect((await ticketNow(t.id)).priority).toBe("normal");
  });
});

describe("closing a ticket (P3.6)", () => {
  for (const who of noAccess) {
    it(`${who.label} cannot close a ticket`, async () => {
      const t = await newTicket();
      await closeTicket(await who.client(), t.id, "Test: should not close");
      expect((await ticketNow(t.id)).status).toBe("open");
    });
  }

  it("closes with a note and an optional cost; nothing happens to the asset unless asked", async () => {
    const { asset } = await damagedAsset();
    const t = await newTicket({ item_id: asset.id });
    const r = await closeTicket(await asRole("centre_admin"), t.id, "Test: glued", { cost: 1999 });
    expect(r.error).toBeNull();
    const now = await ticketNow(t.id);
    expect(now.status).toBe("closed");
    expect(now.cost_cents).toBe(1999);
    expect(await conditionOf(asset.id)).toBe("damaged");
  });

  it("can mark a damaged asset repaired in the same step; the two records point at each other", async () => {
    const { asset } = await damagedAsset();
    const t = await newTicket({ item_id: asset.id });
    const r = await closeTicket(await asRole("super_admin"), t.id, "Test: new leg fitted", { repaired: "fair" });
    expect(r.error).toBeNull();
    expect(await conditionOf(asset.id)).toBe("fair");
    const db = masterKeyClient();
    const closed = await db.from("maintenance_ticket_events").select("asset_event_id").eq("ticket_id", t.id).eq("kind", "closed").single();
    const repair = await db.from("asset_events").select("kind, to_condition, note").eq("id", closed.data!.asset_event_id).single();
    expect(repair.data).toMatchObject({ kind: "back_in_use", to_condition: "fair" });
    expect(repair.data!.note).toContain(`T-${String(t.id).padStart(4, "0")}`);
  });

  it("refuses 'mark repaired' when the asset is not damaged, or the ticket has no asset; then nothing is saved", async () => {
    const asset = await newFixedAsset();
    const t = await newTicket({ item_id: asset.id });
    const c = await asRole("centre_admin");
    expect((await closeTicket(c, t.id, "Test", { repaired: "good" })).error?.message).toMatch(/damaged/i);
    expect((await ticketNow(t.id)).status).toBe("open");
    const placeOnly = await newTicket();
    expect((await closeTicket(c, placeOnly.id, "Test", { repaired: "good" })).error?.message).toMatch(/asset/i);
    expect((await closeTicket(c, placeOnly.id, "Test", { repaired: "perfect" })).error).not.toBeNull();
    expect((await ticketNow(placeOnly.id)).status).toBe("open");
  });

  it("a closing entry can only point at a repair saved in the same step, for the ticket's own asset", async () => {
    const { asset } = await damagedAsset();
    const t = await newTicket({ item_id: asset.id });
    const c = await asRole("centre_admin");
    const repair = await c
      .from("asset_events")
      .insert({ item_id: asset.id, kind: "back_in_use", to_condition: "good", note: "Test: fixed", reported_by: "Test volunteer" })
      .select()
      .single();
    if (repair.error) throw repair.error;
    const r = await addEvent(c, t.id, "closed", { note: "Test", asset_event_id: repair.data.id });
    expect(r.error?.message).toMatch(/same step/i);
  });
});

describe("open tickets on the home page (P3.6)", () => {
  type C = { tickets_open: number; tickets_urgent: number };
  const counters = async () => {
    const { data, error } = await (await asRole("centre_admin")).rpc("home_counters").single<C>();
    if (error) throw error;
    return data;
  };

  it("counts tickets not closed, and urgent ones separately", async () => {
    const before = await counters();
    const t = await newTicket({ priority: "urgent" });
    let now = await counters();
    expect(now.tickets_open).toBe(before.tickets_open + 1);
    expect(now.tickets_urgent).toBe(before.tickets_urgent + 1);
    await mustAdd(t.id, "closed", { note: "Test: done" });
    now = await counters();
    expect(now.tickets_open).toBe(before.tickets_open);
    expect(now.tickets_urgent).toBe(before.tickets_urgent);
  });
});
