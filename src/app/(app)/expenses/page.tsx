// Expenses (slices P5.2 to P5.4): three tabs.
//   * Waiting: claims and corrections waiting for a decision, oldest first,
//     with the ones this admin may decide marked "For you".
//   * Awaiting repayment: approved claims of someone's own money not yet
//     paid back, grouped by person with a total; tick several and record
//     one repayment.
//   * All: every claim entered in a chosen month, newest first.
// Super Admin, Centre Admin and Finance.
import { Receipt } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState, LinkButton, Notice, PageHeader, PageShell, Pagination, StatusPill } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  claimNumber,
  mayDecide,
  monthName,
  monthRange,
  PAYMENT_SHORT,
  recentMonths,
  STATE_LABEL,
  todayInDublin,
  type ClaimRow,
  type EntryRow,
} from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { formatDate, formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, pageOf, readPage } from "@/lib/ui/text";
import { cx } from "@/lib/ui/text";
import { CannotSeeExpenses } from "./cannot-see";
import { loadClaims, loadExpenseNames, loadWaiting, paidByText, type ExpenseNames } from "./data";
import { RepaymentForm } from "./forms";
import { ExpenseLinkNote } from "./link-note";

export const metadata: Metadata = { title: "Expenses | ICCI Control Dashboard" };

const TABS = [
  { key: "waiting", label: "Waiting" },
  { key: "repay", label: "Awaiting repayment" },
  { key: "all", label: "All claims" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export default function ExpensesPage(props: PageProps<"/expenses">) {
  return (
    <PageShell width="wide" loading="Loading expenses…">
      <PageHeader
        title="Expenses"
        subtitle="Money the Centre spent, with its receipts: waiting for approval, owed back to people, and every claim."
        actions={<LinkButton href="/expenses/new">New claim</LinkButton>}
      />
      <Content searchParams={props.searchParams} />
    </PageShell>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/expenses">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSeeExpenses />;
  const params = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === params.tab) ? (params.tab as Tab) : "waiting";
  const supabase = await createClient();
  const names = await loadExpenseNames(supabase);

  return (
    <div className="space-y-5">
      {params.done === "repaid" && (
        <Notice tone="success" floating testId="notice">
          Repayment recorded.
        </Notice>
      )}
      <nav aria-label="Expenses" className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <ul className="flex w-max gap-1 rounded-2xl border border-icci-line bg-white p-1 shadow-card">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.key === "waiting" ? "/expenses" : `/expenses?tab=${t.key}`}
                aria-current={t.key === tab ? "page" : undefined}
                className={cx(
                  "flex min-h-10 items-center whitespace-nowrap rounded-xl px-3.5 text-[14px] font-semibold no-underline transition-colors duration-150",
                  t.key === tab ? "bg-icci-green-dark text-white!" : "text-icci-ink-60! hover:bg-icci-green-50 hover:text-icci-green-dark!",
                )}
              >
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {tab === "waiting" && <Waiting meId={me.id} names={names} />}
      {tab === "repay" && <Repay names={names} />}
      {tab === "all" && <All names={names} month={typeof params.month === "string" ? params.month : ""} page={readPage(params.page)} />}
    </div>
  );
}

async function Waiting({ meId, names }: { meId: string; names: ExpenseNames }) {
  const supabase = await createClient();
  const [rows, link] = await Promise.all([loadWaiting(supabase), supabase.rpc("my_expense_link")]);
  const linked = Boolean((link.data as { linked: boolean }[] | null)?.[0]?.linked);
  const mine = (e: EntryRow) => mayDecide(meId, linked, e, Boolean(e.paid_by_person_id && names.me?.id === e.paid_by_person_id)).ok;
  const forMe = rows.filter(mine).length;
  return (
    <>
      <ExpenseLinkNote />
      <p className="text-[15px] text-icci-ink-60" data-testid="waiting-count">
        {rows.length === 0 ? "Nothing is waiting." : `${rows.length} waiting · ${forMe} for you to decide`}
      </p>
      {rows.length === 0 ? (
        <EmptyState icon={Receipt} title="Nothing is waiting">
          New claims wait here until another admin approves them.
        </EmptyState>
      ) : (
        <EntryList rows={rows} names={names} forMe={mine} />
      )}
    </>
  );
}

function EntryList({ rows, names, forMe }: { rows: EntryRow[]; names: ExpenseNames; forMe?: (e: EntryRow) => boolean }) {
  return (
    <ul className="space-y-3" data-testid="claim-list">
      {rows.map((e) => {
        const label = STATE_LABEL[e.state];
        return (
          <li key={e.id}>
            <Link href={`/expenses/${e.id}`} className="list-card" data-testid="claim-row">
              <span className="flex flex-wrap items-start justify-between gap-2">
                <span className="font-semibold text-icci-green" dir="auto">
                  {e.kind === "correction" ? `Correction of ${claimNumber(e.corrects_id!)}: ` : ""}
                  {e.description}
                </span>
                <span className="text-lg font-bold tabular-nums">{formatEuro(e.amount_cents)}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <span className="font-mono">{claimNumber(e.id)}</span>
                <span>· {formatDate(e.receipt_date)}</span>
                <span>· {names.categoryName.get(e.category_id) ?? ""}</span>
                <span dir="auto">· {paidByText(e, names)}</span>
              </span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                <StatusPill tone={label.tone}>{label.word}</StatusPill>
                {e.receipt_lost_reason && <StatusPill tone="amber">No receipt</StatusPill>}
                {forMe?.(e) && (
                  <span data-testid="for-you">
                    <StatusPill tone="green">For you</StatusPill>
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

async function Repay({ names }: { names: ExpenseNames }) {
  const supabase = await createClient();
  const owed = await loadClaims(supabase, { owed: true });
  const byPerson = new Map<string, ClaimRow[]>();
  for (const c of owed.sort((a, b) => a.id - b.id)) {
    const key = c.paid_by_person_id!;
    byPerson.set(key, [...(byPerson.get(key) ?? []), c]);
  }
  const groups = [...byPerson.entries()].sort((a, b) => names.personName(a[0]).localeCompare(names.personName(b[0])));
  const total = owed.reduce((n, c) => n + c.owed_cents, 0);
  return (
    <>
      <p className="text-[15px] text-icci-ink-60" data-testid="owed-total">
        {groups.length === 0 ? "Nobody is waiting to be paid back." : `${formatEuro(total)} owed to ${groups.length === 1 ? "1 person" : `${groups.length} people`}`}
      </p>
      {groups.length === 0 && (
        <EmptyState icon={Receipt} title="Nobody is owed">
          When a claim paid with someone&apos;s own money is approved, it waits here until they are paid back.
        </EmptyState>
      )}
      <ul className="space-y-4">
        {groups.map(([personId, claims]) => {
          const sum = claims.reduce((n, c) => n + c.owed_cents, 0);
          const name = names.personName(personId);
          return (
            <li key={personId} className="rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="owed-person">
              <h2 className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-lg font-bold text-icci-green-dark">
                <span dir="auto">{name}</span>
                <span className="text-base font-semibold text-icci-text">
                  {claims.length === 1 ? "1 claim" : `${claims.length} claims`}, {formatEuro(sum)}
                </span>
              </h2>
              <RepaymentForm
                personName={name}
                today={todayInDublin()}
                disabledWhy={names.me?.id === personId ? "This is you. Another admin records your repayment." : null}
                claims={claims.map((c) => ({
                  id: c.id,
                  label: `${claimNumber(c.id)} · ${formatDate(c.current_receipt_date)} · ${c.description}`,
                  owed_cents: c.owed_cents,
                }))}
              />
            </li>
          );
        })}
      </ul>
    </>
  );
}

async function All({ names, month: rawMonth, page }: { names: ExpenseNames; month: string; page: number }) {
  const months = recentMonths();
  const month = monthRange(rawMonth) ? rawMonth : months[0];
  const range = monthRange(month)!;
  const supabase = await createClient();
  // Entered in the month (Irish time): from midnight on the 1st.
  const all = await loadClaims(supabase, { month: { from: `${range.from}T00:00:00+00:00`, to: `${range.to}T00:00:00+00:00` } });
  const { rows, total } = pageOf(all, page, PAGE_SIZE);
  return (
    <>
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Choose a month">
        <input type="hidden" name="tab" value="all" />
        <label className="min-w-52">
          <span className="font-semibold">Entered in</span>
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
      <p className="text-[15px] text-icci-ink-60" data-testid="claim-count">
        {total === 0 ? `No claims entered in ${monthName(month)}.` : `${total} ${total === 1 ? "claim" : "claims"} entered in ${monthName(month)}`}
      </p>
      {total > 0 && (
        <>
          <div className="list-table-wrap">
            <table className="list-table hidden md:table">
              <thead>
                <tr>
                  <th className="px-3 py-2">Claim</th>
                  <th className="px-3 py-2">What for</th>
                  <th className="px-3 py-2">Receipt date</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} data-testid="claim-row" className="border-b border-icci-panel align-top">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-sm">
                      <Link href={`/expenses/${c.id}`}>{claimNumber(c.id)}</Link>
                    </td>
                    <td className="px-3 py-2" dir="auto">
                      <Link href={`/expenses/${c.id}`} className="font-semibold">
                        {c.description}
                      </Link>
                      <span className="block text-sm">{names.categoryName.get(c.current_category_id)}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-sm">{formatDate(c.current_receipt_date)}</td>
                    <td className="px-3 py-2 text-sm" dir="auto">
                      {PAYMENT_SHORT[c.payment]}
                      {c.paid_by_person_id && <span className="block">{names.personName(c.paid_by_person_id)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{formatEuro(c.current_amount_cents)}</td>
                    <td className="px-3 py-2">
                      <span className="flex flex-wrap gap-1.5">
                        <StatusPill tone={STATE_LABEL[c.state].tone}>{STATE_LABEL[c.state].word}</StatusPill>
                        {c.correction_id && <StatusPill tone="grey">Corrected</StatusPill>}
                        {c.owed_cents > 0 && <StatusPill tone="amber">Awaiting repayment</StatusPill>}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="md:hidden">
            <EntryList rows={rows.map((c) => ({ ...c, corrects_id: null, correction_reason: null, amount_cents: c.current_amount_cents }))} names={names} />
          </div>
          {total > PAGE_SIZE && <Pagination page={page} size={PAGE_SIZE} total={total} hrefFor={(p) => `/expenses?tab=all&month=${month}&page=${p}`} />}
        </>
      )}
    </>
  );
}
