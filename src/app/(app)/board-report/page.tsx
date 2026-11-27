// The Board report (slice P5.6; docs/PHASE-5.md section 8): one month on
// one or two printed A4 pages, counts and totals only, no people's names.
// "During October" (what happened in the month) is kept apart from "As at
// 3 November, 10:15" (where things stand when the report is made). While
// the month is open it says "Draft". Once it is over, "Make the final copy"
// freezes the numbers; making it again keeps both copies. Print or "Save
// as PDF" from the browser. Super Admin, Centre Admin and Finance.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { CannotSee, Notice, PageHeader, PageShell, StatusPill } from "@/components/ui";
import { ROUTE_LABEL, type DisposalRoute } from "@/lib/assets/disposal";
import { requireAdmin } from "@/lib/auth/current-admin";
import { monthName, monthRange, recentMonths, todayInDublin } from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { formatDateTime, formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../categories/call-sheet/print-button";
import { FinalCopyForm } from "./forms";

export const metadata: Metadata = { title: "Board report | ICCI Control Dashboard" };

type Amount = { count: number; cents: number };
type Report = {
  month: string;
  made_at: string;
  during: {
    spend_cents: number;
    by_category: { name: string; cents: number }[];
    by_fund: { name: string; restricted: boolean; cents: number }[];
    claims_approved: number;
    corrections_approved: number;
    no_receipt: Amount;
    over_amount: Amount;
    repaid: Amount;
    repaid_withdrawn: Amount;
    tickets_opened: number;
    tickets_closed: number;
    items_registered: number;
    disposals: number;
    disposals_by_route: { route: string; count: number }[];
    sold_cents: number;
    stocktakes_finished: number;
    loans: number;
    returns: number;
    copies_added: number;
    copies_lost: number;
  };
  as_at: Record<string, number>;
};

export default function BoardReportPage(props: PageProps<"/board-report">) {
  return (
    <PageShell width="wide" loading="Making the report…">
      <Content searchParams={props.searchParams} />
    </PageShell>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/board-report">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSee area="expenses" title="Board Report" />;
  const { month: raw, copy: rawCopy, done } = await searchParams;
  const months = recentMonths();
  // The month just finished is the one a Board usually wants.
  const month = typeof raw === "string" && monthRange(raw) ? raw : months[1];
  const open = month >= todayInDublin().slice(0, 7);
  const supabase = await createClient();

  const { data: copies } = await supabase.from("board_report_copies").select("id, created_at, created_by").eq("month", month).order("id", { ascending: false });
  const copyId = typeof rawCopy === "string" && /^\d{1,12}$/.test(rawCopy) ? Number(rawCopy) : null;
  let report: Report | null = null;
  let finalCopy: { id: number; created_at: string } | null = null;
  if (copyId) {
    const { data } = await supabase.from("board_report_copies").select("id, created_at, report").eq("id", copyId).eq("month", month).maybeSingle();
    if (data) {
      report = data.report as Report;
      finalCopy = { id: data.id, created_at: data.created_at };
    }
  }
  if (!report) {
    const { data, error } = await supabase.rpc("board_report", { p_month: month });
    if (error || !data) {
      return (
        <Notice tone="error" title="The report could not be made.">
          Please try again.
        </Notice>
      );
    }
    report = data as Report;
  }
  const name = monthName(month);
  const d = report.during;
  const a = report.as_at;
  const asAt = formatDateTime(report.made_at);

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          title="Board Report"
          subtitle="One month for the Board: counts and totals only, no names."
          actions={<PrintButton />}
        />
        {done === "copied" && (
          <Notice tone="success" floating testId="notice">
            Final copy made. Its numbers will not change.
          </Notice>
        )}
        <form method="get" className="mb-5 flex flex-wrap items-end gap-3" aria-label="Choose a month">
          <label className="min-w-52">
            <span className="font-semibold">Month</span>
            <select name="month" defaultValue={month} className="mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthName(m)}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white!">
            Show
          </button>
        </form>
        <div className="mb-5 space-y-3">
          {finalCopy ? (
            <Notice tone="info" title="You are looking at a final copy" testId="copy-note">
              Made {formatDateTime(finalCopy.created_at)}. <Link href={`/board-report?month=${month}`}>See today&apos;s numbers</Link> instead.
            </Notice>
          ) : open ? (
            <Notice tone="info" testId="copy-note">
              {name} is not over yet, so this is a draft. A final copy can be made from the first day of the next month.
            </Notice>
          ) : (
            <FinalCopyForm month={month} monthText={name} waiting={a.waiting_from_month ?? 0} />
          )}
          {(copies ?? []).length > 0 && (
            <p className="text-[15px]" data-testid="copies">
              Final copies of {name}:{" "}
              {(copies ?? []).map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ", "}
                  <Link href={`/board-report?month=${month}&copy=${c.id}`}>{formatDateTime(c.created_at)}</Link>
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      <article className="board-report rounded-2xl border border-icci-line bg-white p-6 shadow-card print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="board-report">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-icci-line pb-3">
          <div>
            <h2 className="text-2xl font-bold text-icci-green-dark">ICCI Board report: {name}</h2>
            <p className="text-sm">Counts and totals only. Made {asAt}.</p>
          </div>
          <span data-testid="report-status">
            <StatusPill tone={finalCopy ? "green" : "amber"}>{finalCopy ? "Final copy" : "Draft"}</StatusPill>
          </span>
        </header>

        <section className="mt-4" aria-labelledby="during-title">
          <h3 id="during-title" className="text-lg font-bold text-icci-green-dark">
            During {name}
          </h3>
          <div className="mt-2 grid gap-5 md:grid-cols-2 print:grid-cols-2">
            <div>
              <p className="font-semibold">
                Spending approved: <span data-testid="spend-total">{formatEuro(d.spend_cents)}</span>
              </p>
              <p className="text-sm">
                {d.claims_approved} {d.claims_approved === 1 ? "claim" : "claims"}
                {d.corrections_approved ? `, ${d.corrections_approved} ${d.corrections_approved === 1 ? "correction" : "corrections"}` : ""}
              </p>
              <Rows title="By fund" rows={d.by_fund.map((f) => [`${f.name}${f.restricted ? " (restricted)" : ""}`, formatEuro(f.cents)])} testId="by-fund" />
              <Rows title="By category" rows={d.by_category.map((c) => [c.name, formatEuro(c.cents)])} testId="by-category" />
            </div>
            <div>
              <Rows
                title="Expenses"
                rows={[
                  ["Claims without a receipt", `${d.no_receipt.count} (${formatEuro(d.no_receipt.cents)})`],
                  ["Claims needing two approvers", `${d.over_amount.count} (${formatEuro(d.over_amount.cents)})`],
                  ["Repayments made", `${d.repaid.count} (${formatEuro(d.repaid.cents)})`],
                  ...(d.repaid_withdrawn.count ? ([["Repayments withdrawn", `${d.repaid_withdrawn.count} (${formatEuro(d.repaid_withdrawn.cents)})`]] as [string, string][]) : []),
                ]}
              />
              <Rows
                title="Building and equipment"
                rows={[
                  ["Maintenance tickets opened", String(d.tickets_opened)],
                  ["Maintenance tickets closed", String(d.tickets_closed)],
                  ["Items registered", String(d.items_registered)],
                  ["Assets disposed of", String(d.disposals)],
                  ...d.disposals_by_route.map((r) => [`  ${ROUTE_LABEL[r.route as DisposalRoute] ?? "Route not recorded"}`, String(r.count)] as [string, string]),
                  ...(d.sold_cents ? ([["Money from assets sold", formatEuro(d.sold_cents)]] as [string, string][]) : []),
                  ["Stocktakes finished", String(d.stocktakes_finished)],
                ]}
              />
              <Rows
                title="Library"
                rows={[
                  ["Loans", String(d.loans)],
                  ["Returns", String(d.returns)],
                  ["Copies added", String(d.copies_added)],
                  ["Copies lost", String(d.copies_lost)],
                ]}
              />
            </div>
          </div>
        </section>

        <section className="mt-6 border-t border-icci-line pt-4" aria-labelledby="as-at-title">
          <h3 id="as-at-title" className="text-lg font-bold text-icci-green-dark">
            As at {asAt}
          </h3>
          <div className="mt-2 grid gap-5 md:grid-cols-2 print:grid-cols-2">
            <div>
              <Rows
                title="Expenses"
                rows={[
                  ["Claims waiting for a decision", String(a.claims_waiting)],
                  ["Owed back to people", `${formatEuro(a.owed_cents)} (${a.owed_people} ${a.owed_people === 1 ? "person" : "people"})`],
                  // Migration 0053; final copies made before it have no such figure.
                  ...(typeof a.overpaid_cents === "number"
                    ? [["Paid too much, to get back", `${formatEuro(a.overpaid_cents)} (${a.overpaid_people} ${a.overpaid_people === 1 ? "person" : "people"})`] as [string, string]]
                    : []),
                  // Migration 0054 (security review, finding 5); absent from older final copies.
                  ...(typeof a.receipts_unclaimed === "number"
                    ? [["Receipt files not on any claim", String(a.receipts_unclaimed)] as [string, string]]
                    : []),
                ]}
              />
              <Rows
                title="Fixed assets"
                rows={[
                  ["Good", String(a.assets_good)],
                  ["Fair", String(a.assets_fair)],
                  ["Damaged", String(a.assets_damaged)],
                  ["Missing", String(a.assets_missing)],
                  ["Total recorded value", formatEuro(a.assets_value_cents)],
                ]}
                testId="assets"
              />
              <Rows
                title="Stock and maintenance"
                rows={[
                  ["Stock lines running low", String(a.stock_low)],
                  ["Stock lines out", String(a.stock_out)],
                  ["Tickets open", String(a.tickets_open)],
                  ["  of which urgent", String(a.tickets_urgent)],
                ]}
              />
            </div>
            <div>
              <Rows
                title="People"
                rows={[
                  ["Garda vetting valid", String(a.vetting_valid)],
                  ["Garda vetting due within 60 days", String(a.vetting_due)],
                  ["Garda vetting expired", String(a.vetting_expired)],
                  ["Needing vetting, none on record", String(a.vetting_none)],
                  ["Training expired", String(a.training_expired)],
                  ["Policy sign-offs not signed", String(a.signoffs_unsigned)],
                  ["Policy sign-offs overdue", String(a.signoffs_overdue)],
                ]}
              />
              <Rows
                title="Renewals and library"
                rows={[
                  ["Renewals overdue", String(a.renewals_overdue)],
                  ["Renewals due within 30 days", String(a.renewals_due_30)],
                  ["Library books overdue", String(a.books_overdue)],
                ]}
              />
            </div>
          </div>
        </section>
        <p className="mt-6 text-xs text-icci-ink-60">
          Spending is what was approved in the month, with corrections as the difference. The cost typed on a maintenance ticket is not counted. Fund balances
          are kept by the bookkeeper, not here.
        </p>
      </article>
    </>
  );
}

function Rows({ title, rows, testId }: { title: string; rows: [string, string][]; testId?: string }): ReactNode {
  return (
    <div className="mt-3 break-inside-avoid">
      <p className="text-sm font-bold text-icci-ink-60">{title}</p>
      {rows.length === 0 ? (
        <p className="text-[15px]">None.</p>
      ) : (
        <table className="w-full text-[15px]" data-testid={testId}>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-icci-panel">
                <td className={`py-1 pr-3 ${k.startsWith("  ") ? "pl-4" : ""}`}>{k.trim()}</td>
                <td className="py-1 text-right tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
