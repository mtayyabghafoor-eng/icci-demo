// Loading expense claims and the names that go with them. Runs on the web
// server as the signed-in admin; the database decides what they may read.
// Finance cannot read People, Companies or Tickets, so names come through
// the three narrow look-ups of migration 0050.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClaimRow, EntryRow } from "@/lib/expenses/claims";
import type { ExpenseCategory, ExpenseFund } from "@/lib/expenses/rules";
import { allRows } from "@/lib/supabase/all-rows";

export type ExpensePerson = { id: string; full_name: string; active: boolean; has_account: boolean; is_me: boolean };
export type ExpenseCompany = { id: string; name: string; active: boolean };
export type ExpenseTicket = { id: number; description: string; status: string; cost_cents: number | null; closed_at: string | null };

export type ExpenseNames = Awaited<ReturnType<typeof loadExpenseNames>>;

/** Everything a claim screen needs to put names to ids. */
export async function loadExpenseNames(supabase: SupabaseClient) {
  const [people, companies, categories, funds, accounts] = await Promise.all([
    allRows<ExpensePerson>((from, to) => supabase.rpc("expense_people").order("full_name").order("id").range(from, to)),
    allRows<ExpenseCompany>((from, to) => supabase.rpc("expense_companies").order("name").order("id").range(from, to)),
    allRows<ExpenseCategory>((from, to) => supabase.from("expense_categories").select("id, name, active").order("name").order("id").range(from, to)),
    allRows<ExpenseFund>((from, to) => supabase.from("expense_funds").select("id, name, restricted, active").order("name").order("id").range(from, to)),
    allRows<{ id: string; display_name: string }>((from, to) => supabase.from("app_users").select("id, display_name").order("id").range(from, to)),
  ]);
  const person = new Map(people.map((p) => [p.id, p]));
  const account = new Map(accounts.map((a) => [a.id, a.display_name]));
  // Funds: Unrestricted first, then the rest by name.
  funds.sort((a, b) => Number(a.restricted) - Number(b.restricted) || a.name.localeCompare(b.name));
  return {
    people,
    companies,
    categories,
    funds,
    me: people.find((p) => p.is_me) ?? null,
    personName: (id: string | null) => (id ? (person.get(id)?.full_name ?? "A person in People") : ""),
    personHasAccount: (id: string | null) => Boolean(id && person.get(id)?.has_account),
    companyName: new Map(companies.map((c) => [c.id, c.name])),
    categoryName: new Map(categories.map((c) => [c.id, c.name])),
    fundName: new Map(funds.map((f) => [f.id, f.name])),
    accountName: (id: string | null) => (id ? (account.get(id) ?? "Another admin") : "The seed script"),
  };
}

/** Who a claim was paid to, in words. */
export function paidToText(c: { paid_to_company_id: string | null; paid_to_text: string | null }, names: ExpenseNames): string {
  if (c.paid_to_company_id) return names.companyName.get(c.paid_to_company_id) ?? "A company";
  return c.paid_to_text ?? "";
}

/** Who paid, in words: a person, or the Centre. */
export function paidByText(c: { payment: string; paid_by_person_id: string | null }, names: ExpenseNames): string {
  if (c.payment === "centre_direct") return "The Centre (directly)";
  if (c.payment === "centre_card") return `Centre card, used by ${names.personName(c.paid_by_person_id)}`;
  return names.personName(c.paid_by_person_id);
}

export type ClaimFilter = { states?: string[]; month?: { from: string; to: string }; ticket?: number; owed?: boolean; overpaid?: boolean };

/** Claims (not corrections), newest first, every one of them that matches. */
export async function loadClaims(supabase: SupabaseClient, f: ClaimFilter = {}): Promise<ClaimRow[]> {
  return allRows<ClaimRow>((from, to) => {
    let q = supabase.from("expense_claim_list").select("*");
    if (f.states?.length) q = q.in("state", f.states);
    if (f.month) q = q.gte("created_at", f.month.from).lt("created_at", f.month.to);
    if (f.ticket) q = q.eq("ticket_id", f.ticket);
    if (f.owed) q = q.gt("owed_cents", 0);
    // Repaid, then corrected to less: money to get back (migration 0053).
    if (f.overpaid) q = q.lt("owed_cents", 0);
    return q.order("id", { ascending: false }).range(from, to);
  });
}

/** Claims and corrections still waiting for a decision, oldest first. */
export async function loadWaiting(supabase: SupabaseClient): Promise<EntryRow[]> {
  return allRows<EntryRow>((from, to) => supabase.from("expense_entries").select("*").in("state", ["waiting", "second"]).order("id").range(from, to));
}

/** Who entered each claim that these corrections correct (migration 0053). */
export async function loadCorrectedBy(supabase: SupabaseClient, rows: EntryRow[]): Promise<Map<number, string | null>> {
  const ids = [...new Set(rows.map((r) => r.corrects_id).filter((x): x is number => x !== null))];
  if (!ids.length) return new Map();
  const { data } = await supabase.from("expense_claims").select("id, created_by").in("id", ids);
  return new Map((data ?? []).map((c) => [c.id as number, c.created_by as string | null]));
}
