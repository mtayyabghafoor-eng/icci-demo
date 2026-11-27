// Lists (UI-PLAN 5.3): a light header row, roomy rows with a hover tint,
// and Previous / Next paging with "1 to 50 of 487".
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cx, rangeText } from "@/lib/ui/text";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => ReactNode;
  align?: "left" | "right";
  /** Hidden in the table below PC width (A2: a phone shows cards instead, with every column as a line). */
  wideOnly?: boolean;
};

export function DataTable<Row>({ columns, rows, rowKey, caption }: { columns: Column<Row>[]; rows: Row[]; rowKey: (r: Row) => string; caption?: string }) {
  const [first, ...rest] = columns;
  return (
    <>
      {/* A2: on a phone each row is a card: the first column as its title, the others as short lines under it. */}
      <ul className="space-y-2 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li key={rowKey(r)} className="rounded-2xl border border-icci-line bg-white p-4 shadow-card">
            <div className="font-semibold">{first?.cell(r)}</div>
            {rest.length > 0 && (
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]">
                {rest.map((c) => (
                  <div key={c.key} className="contents">
                    <dt className="text-sm text-icci-ink-60">{c.header}</dt>
                    <dd className="min-w-0">{c.cell(r)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
      <DataTableWide columns={columns} rows={rows} rowKey={rowKey} caption={caption} />
    </>
  );
}

function DataTableWide<Row>({ columns, rows, rowKey, caption }: { columns: Column<Row>[]; rows: Row[]; rowKey: (r: Row) => string; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-icci-line bg-white shadow-card max-md:hidden">
      <table className="w-full border-collapse text-left text-[15px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="bg-icci-green-50">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(
                  "border-b border-icci-line px-4 py-3 text-sm font-semibold text-icci-ink-60",
                  c.align === "right" && "text-right",
                  c.wideOnly && "hidden md:table-cell",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-b border-icci-line transition-colors duration-150 last:border-b-0 hover:bg-icci-green-50">
              {columns.map((c) => (
                <td key={c.key} className={cx("px-4 py-3.5 align-middle", c.align === "right" && "text-right", c.wideOnly && "hidden md:table-cell")}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, size, total, hrefFor }: { page: number; size: number; total: number; hrefFor: (page: number) => string }) {
  const last = Math.max(1, Math.ceil(total / size));
  const link = "inline-flex min-h-11 items-center gap-1 rounded-[10px] border border-icci-line bg-white px-3.5 font-semibold text-icci-green! no-underline hover:border-icci-green";
  const off = "inline-flex min-h-11 items-center gap-1 rounded-[10px] border border-icci-line px-3.5 font-semibold text-icci-ink-60/60";
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-icci-ink-60">{rangeText(page, size, total)}</p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className={link} href={hrefFor(page - 1)}>
            <ChevronLeft aria-hidden size={18} /> Previous
          </Link>
        ) : (
          <span className={off} aria-disabled>
            <ChevronLeft aria-hidden size={18} /> Previous
          </span>
        )}
        {page < last ? (
          <Link className={link} href={hrefFor(page + 1)}>
            Next <ChevronRight aria-hidden size={18} />
          </Link>
        ) : (
          <span className={off} aria-disabled>
            Next <ChevronRight aria-hidden size={18} />
          </span>
        )}
      </div>
    </nav>
  );
}
