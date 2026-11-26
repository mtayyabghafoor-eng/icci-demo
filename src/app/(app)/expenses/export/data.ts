// Loading one month's file (slice P5.5): every approved entry, the receipt
// file counts and the repayments, then the three parts are built by
// src/lib/expenses/export.ts. Runs as the signed-in admin.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntryRow } from "@/lib/expenses/claims";
import { buildMonthExport, type RepaymentLink, type RepaymentRow } from "@/lib/expenses/export";
import { allRows } from "@/lib/supabase/all-rows";
import { loadExpenseNames, paidToText } from "../data";

export async function loadMonthExport(supabase: SupabaseClient, month: string) {
  const [names, entries, files, repayments, links] = await Promise.all([
    loadExpenseNames(supabase),
    allRows<EntryRow>((from, to) => supabase.from("expense_entries").select("*").eq("state", "approved").order("id").range(from, to)),
    allRows<{ id: number; claim_id: number }>((from, to) => supabase.from("expense_files").select("id, claim_id").order("id").range(from, to)),
    allRows<RepaymentRow>((from, to) => supabase.from("expense_repayments").select("*").order("id").range(from, to)),
    allRows<RepaymentLink & { id: number }>((from, to) => supabase.from("expense_repayment_claims").select("id, repayment_id, claim_id, amount_cents").order("id").range(from, to)),
  ]);
  const fileCount = new Map<number, number>();
  for (const f of files) fileCount.set(f.claim_id, (fileCount.get(f.claim_id) ?? 0) + 1);
  const data = buildMonthExport(month, entries, fileCount, repayments, links, {
    personName: names.personName,
    accountName: names.accountName,
    categoryName: names.categoryName,
    fundName: names.fundName,
    paidTo: (e) => paidToText(e, names),
  });
  return { data, names, entries };
}
