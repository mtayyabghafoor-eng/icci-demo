// "New claim" (slice P5.2): the receipt, what was bought and how it was
// paid. From a ticket (?ticket=42) the company, category, description and
// cost are filled in. "Enter again" (?again=12) copies a withdrawn or
// rejected claim, receipt included, to put right. Super Admin, Centre Admin
// and Finance.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BackLink, Notice, PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { claimNumber, todayInDublin, type EntryRow } from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeExpenses } from "../cannot-see";
import { loadExpenseNames, type ExpenseTicket } from "../data";
import { ClaimForm, type ClaimStart } from "../forms";
import Link from "next/link";

export const metadata: Metadata = { title: "New claim | ICCI Control Dashboard" };

export default function NewClaimPage(props: PageProps<"/expenses/new">) {
  return (
    <PageShell width="narrow">
      <Content searchParams={props.searchParams} />
    </PageShell>
  );
}

const euros = (cents: number | null | undefined) => (cents == null ? undefined : (cents / 100).toFixed(2));

async function Content({ searchParams }: { searchParams: PageProps<"/expenses/new">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSeeExpenses title="New Claim" />;
  const { ticket: rawTicket, again: rawAgain, done, last } = await searchParams;
  const supabase = await createClient();
  const [names, ticketRes, settings] = await Promise.all([
    loadExpenseNames(supabase),
    supabase.rpc("expense_tickets").order("id", { ascending: false }),
    supabase.from("app_settings").select("key, amount_cents"),
  ]);
  const allTickets = (ticketRes.data ?? []) as ExpenseTicket[];
  const secondAbove = (settings.data ?? []).find((s) => s.key === "second_approval_cents")?.amount_cents ?? 50000;

  let start: ClaimStart = {};
  let copiedFrom: number | null = null;
  let keptFiles = 0;
  let fromTicket: ExpenseTicket | null = null;

  if (typeof rawTicket === "string" && /^\d{1,9}$/.test(rawTicket)) {
    fromTicket = allTickets.find((t) => t.id === Number(rawTicket)) ?? null;
    if (!fromTicket) notFound();
    // The company it was last passed to, if Finance may see it: read as the admin (Finance gets nothing, which is fine).
    const { data: ref } = await supabase
      .from("maintenance_ticket_events")
      .select("company_id")
      .eq("ticket_id", fromTicket.id)
      .eq("kind", "referred")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    const repairs = names.categories.find((c) => c.active && c.name === "Repairs and maintenance");
    start = {
      ticket: String(fromTicket.id),
      description: `Repair: ${fromTicket.description}`.slice(0, 500),
      amount: euros(fromTicket.cost_cents),
      category: repairs?.id,
      paid_to_company: ref?.company_id && names.companyName.has(ref.company_id) ? ref.company_id : undefined,
      payment: "centre_direct",
    };
  }

  if (typeof rawAgain === "string" && /^\d{1,12}$/.test(rawAgain)) {
    const { data } = await supabase.from("expense_entries").select("*").eq("id", rawAgain).maybeSingle();
    const old = data as EntryRow | null;
    if (!old || old.kind !== "claim") notFound();
    if (old.state !== "withdrawn" && old.state !== "rejected") {
      return (
        <>
          <PageHeader title="Enter Again" />
          <Notice tone="warning" title={`${claimNumber(old.id)} is not withdrawn or rejected`}>
            Only a withdrawn or rejected claim can be entered again. <Link href={`/expenses/${old.id}`}>Open {claimNumber(old.id)}</Link>
          </Notice>
        </>
      );
    }
    const { data: again } = await supabase.from("expense_claims").select("id").eq("copied_from_id", old.id).maybeSingle();
    if (again) {
      return (
        <>
          <PageHeader title="Enter Again" />
          <Notice tone="info" title={`${claimNumber(old.id)} has already been entered again`}>
            <Link href={`/expenses/${again.id}`}>Open {claimNumber(again.id)}</Link>
          </Notice>
        </>
      );
    }
    const { count } = await supabase.from("expense_files").select("id", { count: "exact", head: true }).eq("claim_id", old.id);
    copiedFrom = old.id;
    keptFiles = count ?? 0;
    const active = <T extends { id: string; active: boolean }>(list: T[], id: string | null) => (id && list.some((x) => x.id === id && x.active) ? id : undefined);
    start = {
      amount: euros(old.amount_cents),
      vat: euros(old.vat_cents),
      receipt_date: old.receipt_date,
      category: active(names.categories, old.category_id),
      description: old.description,
      paid_to_company: old.paid_to_company_id ?? undefined,
      paid_to_text: old.paid_to_text ?? undefined,
      ticket: old.ticket_id ? String(old.ticket_id) : undefined,
      suggested_fund: active(names.funds, old.suggested_fund_id),
      payment: old.payment,
      paid_by: old.paid_by_person_id ?? undefined,
      lost_reason: old.receipt_lost_reason ?? undefined,
    };
  }

  // Tickets offered: not closed, or closed in the last 90 days, newest first.
  const cutoff = me.serverNow - 90 * 86400000;
  const tickets = allTickets
    .filter((t) => t.status !== "closed" || (t.closed_at && Date.parse(t.closed_at) > cutoff) || t.id === fromTicket?.id || String(t.id) === start.ticket)
    .map((t) => ({ id: t.id, label: `T-${String(t.id).padStart(4, "0")} ${t.description.slice(0, 60)}` }));

  const lastId = typeof last === "string" && /^\d{1,12}$/.test(last) ? Number(last) : null;
  return (
    <>
      <BackLink href="/expenses">Expenses</BackLink>
      <PageHeader
        title={copiedFrom ? "Enter Again" : "New Claim"}
        subtitle={
          copiedFrom
            ? `A new claim copied from ${claimNumber(copiedFrom)}. Put right what was wrong, then save.`
            : fromTicket
              ? `For ticket T-${String(fromTicket.id).padStart(4, "0")}. Check the amount against the invoice.`
              : "Money the Centre spent, with its receipt."
        }
      />
      {done === "entered" && lastId && (
        <Notice tone="success" floating testId="notice">
          {claimNumber(lastId)} saved. Enter the next one below.
        </Notice>
      )}
      <ClaimForm
        key={lastId ?? "new"}
        categories={names.categories.filter((c) => c.active)}
        funds={names.funds.filter((f) => f.active)}
        people={names.people.filter((p) => p.active)}
        companies={names.companies.filter((c) => c.active)}
        tickets={tickets}
        today={todayInDublin()}
        start={start}
        copiedFrom={copiedFrom}
        keptFiles={keptFiles}
        secondAboveCents={secondAbove}
      />
    </>
  );
}
