// Monthly export (slice P5.5; docs/PHASE-5.md section 7): choose a month,
// see what its file holds (claims approved, corrections, repayments, and the
// totals by fund and by category), download the CSV for the bookkeeper, or
// open the printable receipts pack. Super Admin, Centre Admin and Finance.
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardTitle, LinkButton, Notice, PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { claimNumber, monthName, monthRange, recentMonths, todayInDublin } from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeExpenses } from "../cannot-see";
import { loadMonthExport } from "./data";

export const metadata: Metadata = { title: "Monthly export | ICCI Control Dashboard" };

export default function ExportPage(props: PageProps<"/expenses/export">) {
  return (
    <PageShell width="wide" loading="Loading the month…">
      <PageHeader title="Monthly Export" subtitle="The month's file for the bookkeeper, and the receipts to go with it." />
      <Content searchParams={props.searchParams} />
    </PageShell>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/expenses/export">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSeeExpenses />;
  const { month: raw } = await searchParams;
  const months = recentMonths();
  const month = typeof raw === "string" && monthRange(raw) ? raw : months[0];
  const open = month === todayInDublin().slice(0, 7);
  const supabase = await createClient();
  const { data } = await loadMonthExport(supabase, month);
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Choose a month">
        <label className="min-w-52">
          <span className="font-semibold">Month</span>
          <select name="month" defaultValue={month} className="mt-1 block min-h-11 w-full rounded-xl border border-[#87948f] bg-white px-3.5 py-2">
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

      {open ? (
        <Notice tone="info" title={`${monthName(month)} is not over yet`}>
          Its file still grows as claims are approved. Once the month is over it never changes: anything later goes in the month it happens.
        </Notice>
      ) : (
        <Notice tone="info">This month is over, so its file never changes. A later correction or repayment goes in the month it happens.</Notice>
      )}

      <div className="flex flex-wrap gap-3">
        <a href={`/expenses/export/csv?month=${month}`} download className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white! no-underline">
          Download the CSV file
        </a>
        <LinkButton href={`/expenses/export/receipts?month=${month}`} kind="outline">
          Receipts pack (print or save as PDF)
        </LinkButton>
      </div>

      <div className="grid gap-6 md:grid-cols-3" data-testid="export-summary">
        <Card>
          <CardTitle>Claims approved</CardTitle>
          <p className="text-3xl font-bold tabular-nums" data-testid="export-claims">
            {data.claims.length}
          </p>
          <p className="text-sm text-icci-ink-60">{formatEuro(data.claims.reduce((n, c) => n + c.amount_cents, 0))}</p>
        </Card>
        <Card>
          <CardTitle>Corrections</CardTitle>
          <p className="text-3xl font-bold tabular-nums" data-testid="export-corrections">
            {data.corrections.length / 2}
          </p>
          <p className="text-sm text-icci-ink-60">Difference {formatEuro(data.corrections.reduce((n, c) => n + c.amount_cents, 0))}</p>
        </Card>
        <Card>
          <CardTitle>Repayments</CardTitle>
          <p className="text-3xl font-bold tabular-nums" data-testid="export-repayments">
            {data.repayments.filter((r) => r.kind === "Paid").length}
          </p>
          <p className="text-sm text-icci-ink-60">{formatEuro(data.repaid_cents)} paid back</p>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>By fund</CardTitle>
          <Totals rows={sorted(data.byFund)} total={data.total_cents} testId="export-by-fund" />
        </Card>
        <Card>
          <CardTitle>By category</CardTitle>
          <Totals rows={sorted(data.byCategory)} total={data.total_cents} testId="export-by-category" />
        </Card>
      </div>

      {data.corrections.length > 0 && (
        <Card>
          <CardTitle>Corrections in this month&apos;s file</CardTitle>
          <ul className="space-y-1 text-[15px]">
            {data.corrections.map((c) => (
              <li key={`${c.correction}-${c.line}`}>
                <Link href={`/expenses/${c.claim}`}>{claimNumber(c.claim)}</Link> {c.line.toLowerCase()}: {formatEuro(c.amount_cents)} ({c.fund}, {c.category})
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Totals({ rows, total, testId }: { rows: [string, number][]; total: number; testId: string }) {
  if (rows.length === 0) return <p>Nothing approved this month.</p>;
  return (
    <table className="w-full text-[15px]" data-testid={testId}>
      <tbody>
        {rows.map(([name, cents]) => (
          <tr key={name} className="border-b border-icci-panel">
            <td className="py-1.5 pr-3">{name}</td>
            <td className="py-1.5 text-right tabular-nums">{formatEuro(cents)}</td>
          </tr>
        ))}
        <tr className="font-bold">
          <td className="py-1.5 pr-3">Total</td>
          <td className="py-1.5 text-right tabular-nums">{formatEuro(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}
