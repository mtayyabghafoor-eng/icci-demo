// Round C2 (migration 0057): the database now sorts the long lists and hands
// over one page at a time. Its order must be exactly the screen's old order
// (worked out in the website before), and the register's totals must add up.
import { describe, expect, it } from "vitest";
import { worstFirst as renewalsWorstFirst, REGISTER_COLUMNS, type RegisterRow } from "@/lib/renewals/rules";
import { listOrder, TICKET_COLUMNS, type TicketRow } from "@/lib/tickets/rules";
import { worstFirst as trainingWorstFirst, TRAINING_ROW_COLUMNS, type TrainingRow } from "@/lib/training/rules";
import { worstFirst as vettingWorstFirst, VETTING_ROW_COLUMNS, type VettingRow } from "@/lib/vetting/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { asRole, masterKeyClient } from "./clients";
import { newFixedAsset } from "./items-helpers";

describe("the database sorts each long list the way the screen did", () => {
  it("tickets: not closed first, urgent at the top; then the most recently closed", async () => {
    const c = await asRole("centre_admin");
    const rows = await allRows<TicketRow>((from, to) =>
      c.from("maintenance_ticket_list").select(TICKET_COLUMNS).order("closed_rank").order("priority_rank").order("status_rank").order("order_time").order("order_id").range(from, to),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.id)).toEqual([...rows].sort(listOrder).map((r) => r.id));
  });

  it("Garda vetting, training and renewals: worst first", async () => {
    const c = await asRole("centre_admin");
    const vetting = await allRows<VettingRow>((from, to) =>
      c.from("people_vetting_list").select(VETTING_ROW_COLUMNS).eq("active", true).order("list_rank").order("expires_on", { nullsFirst: false }).order("full_name").order("person_id").range(from, to),
    );
    expect(vetting.length).toBeGreaterThan(10);
    expect(vetting.map((r) => `${r.status} ${r.expires_on}`)).toEqual(vettingWorstFirst(vetting).map((r) => `${r.status} ${r.expires_on}`));

    const training = await allRows<TrainingRow>((from, to) =>
      c.from("people_training_list").select(TRAINING_ROW_COLUMNS).eq("active", true).order("list_rank").order("expires_on", { nullsFirst: false }).order("full_name").order("person_id").order("training_type_id").range(from, to),
    );
    expect(training.length).toBeGreaterThan(5);
    expect(training.map((r) => `${r.status} ${r.expires_on}`)).toEqual(trainingWorstFirst(training).map((r) => `${r.status} ${r.expires_on}`));

    const renewals = await allRows<RegisterRow>((from, to) =>
      c.from("renewals_register_list").select(REGISTER_COLUMNS).order("list_rank").order("due_on", { nullsFirst: false }).order("title").order("source").order("record_id").range(from, to),
    );
    expect(renewals.length).toBeGreaterThan(5);
    expect(renewals.map((r) => `${r.status} ${r.due_on}`)).toEqual(renewalsWorstFirst(renewals).map((r) => `${r.status} ${r.due_on}`));
  });

  it("the new lists show nothing to Finance or the Library Operator", async () => {
    for (const role of ["finance", "library_operator"]) {
      const c = await asRole(role);
      for (const view of ["maintenance_ticket_list", "people_vetting_list", "people_training_list", "renewals_register_list", "people_list"]) {
        const { data } = await c.from(view).select("*").limit(3);
        expect(data ?? [], `${role} ${view}`).toHaveLength(0);
      }
    }
  });
});

describe("the asset register's totals by place", () => {
  it("add up to exactly the register's rows, for every reader of it", async () => {
    for (const role of ["super_admin", "centre_admin", "finance"]) {
      const c = await asRole(role);
      const rows = await allRows<{ value_cents: number | null }>((from, to) => c.rpc("asset_register_rows", { p_place: null }).order("id").range(from, to));
      expect(rows.length, role).toBeGreaterThan(10);
      const { data: totals, error } = await c.rpc("asset_register_totals", { p_place: null });
      expect(error).toBeNull();
      const t = (totals ?? []) as { assets: number; total_cents: number; without_value: number }[];
      expect(t.reduce((s, x) => s + x.assets, 0), role).toBe(rows.length);
      expect(t.reduce((s, x) => s + Number(x.total_cents), 0), role).toBe(rows.reduce((s, r) => s + (r.value_cents ?? 0), 0));
      expect(t.reduce((s, x) => s + x.without_value, 0), role).toBe(rows.filter((r) => r.value_cents === null).length);
    }
    const { data } = await (await asRole("library_operator")).rpc("asset_register_totals", { p_place: null });
    expect(data ?? []).toHaveLength(0);
  });
});

describe("an item's history", () => {
  it("comes newest first and is never cut off, even past 1,000 changes", async () => {
    const item = await newFixedAsset("centre_admin");
    const m = masterKeyClient();
    for (let i = 1; i <= 1005; i++) {
      const r = await m.from("items").update({ notes: `Test: change ${i}` }).eq("id", item.id);
      if (r.error) throw r.error;
    }
    const c = await asRole("centre_admin");
    const history = await allRows<{ action: string; new_values: { notes: string | null } }>((from, to) => c.rpc("item_history", { p_item_id: item.id }).range(from, to));
    expect(history).toHaveLength(1006); // registered, then 1,005 changes
    expect(history[0].new_values.notes).toBe("Test: change 1005");
    expect(history.at(-1)!.action).toBe("insert");
  }, 300_000);
});
