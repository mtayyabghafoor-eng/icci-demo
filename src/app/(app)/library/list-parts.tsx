// Shared parts of the library lists (slice P4.5): a CSV button (admins only),
// the on-loan table and the lost-and-withdrawn list. Designed for a PC
// first; each row becomes a card on a phone.
import Link from "next/link";
import { formatDate } from "@/lib/items/rules";
import { days } from "@/lib/library/loans";
import { statusWord, type CopyRow } from "@/lib/library/lists";
import { StatusBadge } from "../items/ui";
import type { Borrower } from "./data";

export function CsvButton({ href }: { href: string }) {
  return (
    <a
      href={href}
      download
      data-testid="csv-link"
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50"
    >
      Download CSV
    </a>
  );
}

/** Copies out on loan: title, borrower (with contact when asked), due date and status. */
export function LoanTable({ rows, borrowers, showContact }: { rows: CopyRow[]; borrowers: Map<string, Borrower>; showContact: boolean }) {
  return (
    <>
      <div className="list-table-wrap">
        <table className="list-table hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Book</th>
              <th className="px-3 py-2">Borrower</th>
              {showContact && <th className="px-3 py-2">Contact</th>}
              <th className="px-3 py-2">Due back</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const b = r.borrower_id ? borrowers.get(r.borrower_id) : undefined;
              const st = statusWord(r);
              return (
                <tr key={r.id} data-testid="loan-list-row" className="border-b border-icci-panel align-top">
                  <td className="px-3 py-2" dir="auto">
                    <Link href={`/library/copies/${r.id}`} className="font-semibold">
                      {r.title}
                    </Link>
                    <span className="block font-mono text-sm text-icci-ink-60">{r.label_serial}</span>
                  </td>
                  <td className="px-3 py-2" dir="auto">
                    {b ? <Link href={`/library/borrowers/${b.id}`}>{b.full_name}</Link> : "Not found"}
                  </td>
                  {showContact && (
                    <td className="px-3 py-2" dir="auto">
                      {b?.contact ?? ""}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.due_on)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge word={st.word} tone={st.tone} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((r) => {
          const b = r.borrower_id ? borrowers.get(r.borrower_id) : undefined;
          const st = statusWord(r);
          return (
            <li key={r.id}>
              <Link href={`/library/copies/${r.id}`} data-testid="loan-list-row" className="list-card">
                <span className="flex flex-wrap items-start justify-between gap-2">
                  <span className="font-semibold text-icci-green" dir="auto">
                    {r.title}
                  </span>
                  <StatusBadge word={st.word} tone={st.tone} />
                </span>
                <span className="mt-1 block text-sm" dir="auto">
                  {b?.full_name ?? "Borrower not found"}
                  {showContact && b ? `, ${b.contact}` : ""}
                </span>
                <span className="mt-1 block text-sm">
                  Due {formatDate(r.due_on)}
                  {r.days_overdue > 0 ? ` (${days(r.days_overdue)} late)` : ""}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** Lost and withdrawn copies. */
export function FlaggedList({ rows }: { rows: CopyRow[] }) {
  return (
    <ul className="mt-3 space-y-3">
      {rows.map((r) => {
        const st = statusWord(r);
        return (
          <li key={r.id}>
            <Link href={`/library/copies/${r.id}`} data-testid="flagged-row" className="list-card">
              <span className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-semibold text-icci-green" dir="auto">
                    {r.title}
                  </span>
                  <span className="block text-sm" dir="auto">
                    {r.author ?? "Author not recorded"} · <span className="font-mono">{r.label_serial}</span>
                  </span>
                  <span className="block text-sm">
                    {r.status === "lost" ? "Lost" : "Withdrawn"} on {formatDate(r.flagged_on)}
                  </span>
                </span>
                <StatusBadge word={st.word} tone={st.tone} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
