// P5.4: a ticket's expense claims, and "Add an expense claim for this
// ticket". The cost typed on a ticket is information only, never an
// expense claim, so a closed ticket with a cost and no claim says so.
import Link from "next/link";
import { LinkButton, StatusPill } from "@/components/ui";
import { claimNumber, STATE_LABEL, type ClaimRow } from "@/lib/expenses/claims";
import { formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";

export async function TicketExpenseClaims({ ticketId, closedWithCost }: { ticketId: number; closedWithCost: boolean }) {
  const supabase = await createClient();
  const { data } = await supabase.from("expense_claim_list").select("*").eq("ticket_id", ticketId).order("id");
  const claims = (data ?? []) as ClaimRow[];
  return (
    <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" aria-labelledby="ticket-claims-title" data-testid="ticket-claims">
      <h2 id="ticket-claims-title" className="text-lg font-bold text-icci-green-dark">
        Expense claims
      </h2>
      {claims.length === 0 ? (
        <p className="mt-1 text-[15px]">
          No expense claim for this ticket yet.
          {closedWithCost && " The cost on a ticket is not an expense claim: add one with the receipt so it reaches the bookkeeper."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-icci-panel">
          {claims.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <Link href={`/expenses/${c.id}`} className="font-mono">
                {claimNumber(c.id)}
              </Link>
              <span className="font-semibold tabular-nums">{formatEuro(c.current_amount_cents)}</span>
              <StatusPill tone={STATE_LABEL[c.state].tone}>{STATE_LABEL[c.state].word}</StatusPill>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3">
        <LinkButton href={`/expenses/new?ticket=${ticketId}`} kind="outline">
          Add an expense claim for this ticket
        </LinkButton>
      </div>
    </section>
  );
}
