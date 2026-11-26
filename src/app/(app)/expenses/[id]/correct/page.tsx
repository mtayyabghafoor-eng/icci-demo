// "Correct this claim" (slice P5.4; question 8A): an approved claim never
// changes, so a wrong amount, VAT, date, category or fund is put right by a
// new entry that points at it, approved by the same rules. The monthly file
// then shows the old line taken out and the new line put in.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BackLink, Notice, PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { claimNumber, todayInDublin, type ClaimRow } from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeExpenses } from "../../cannot-see";
import { loadExpenseNames } from "../../data";
import { CorrectionForm } from "../../forms";

export const metadata: Metadata = { title: "Correct a claim | ICCI Control Dashboard" };

export default function CorrectPage(props: PageProps<"/expenses/[id]/correct">) {
  return (
    <PageShell width="narrow">
      <Content params={props.params} />
    </PageShell>
  );
}

const euros = (cents: number | null) => (cents == null ? "" : (cents / 100).toFixed(2));

async function Content({ params }: { params: PageProps<"/expenses/[id]/correct">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSeeExpenses title="Correct a Claim" />;
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("expense_claim_list").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as ClaimRow;
  const names = await loadExpenseNames(supabase);
  const title = `Correct ${claimNumber(c.id)}`;
  if (c.state !== "approved") {
    return (
      <>
        <BackLink href={`/expenses/${c.id}`}>{claimNumber(c.id)}</BackLink>
        <PageHeader title={title} />
        <Notice tone="warning" title="Only an approved claim can be corrected">
          A claim still waiting can be withdrawn and entered again instead. <Link href={`/expenses/${c.id}`}>Back to {claimNumber(c.id)}</Link>
        </Notice>
      </>
    );
  }
  // Keep switched-off choices on the list if the claim uses them, so nothing changes by accident.
  const categories = names.categories.filter((x) => x.active || x.id === c.current_category_id);
  const funds = names.funds.filter((x) => x.active || x.id === c.current_fund_id);
  return (
    <>
      <BackLink href={`/expenses/${c.id}`}>{claimNumber(c.id)}</BackLink>
      <PageHeader
        title={title}
        subtitle={
          <>
            Now {formatEuro(c.current_amount_cents)}, <span dir="auto">{c.description}</span>. Change what is wrong; another admin approves the correction.
          </>
        }
      />
      <CorrectionForm
        claimId={c.id}
        categories={categories}
        funds={funds}
        today={todayInDublin()}
        current={{
          amount: euros(c.current_amount_cents),
          vat: euros(c.current_vat_cents),
          receipt_date: c.current_receipt_date,
          category: c.current_category_id,
          fund: c.current_fund_id ?? funds[0]?.id ?? "",
        }}
      />
    </>
  );
}
