// The audit log screen (Round C5, PLAN.md 3): every change made in the
// system, newest first, for Super Admins only. Read-only: the log itself
// can never be changed or deleted, by anyone (migration 0001).
import type { Metadata } from "next";
import Link from "next/link";
import { CannotSee, fieldClass, Pagination, PageShell } from "@/components/ui";
import { MAY_MANAGE_ACCOUNTS } from "@/lib/accounts/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime } from "@/lib/items/rules";
import { pageRows } from "@/lib/supabase/page-rows";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, readPage } from "@/lib/ui/text";

export const metadata: Metadata = { title: "Audit Log | ICCI Control Dashboard" };

type Entry = {
  id: number;
  table_name: string;
  record_id: string;
  action: string;
  changed_by: string | null;
  changed_by_name: string | null;
  changed_at: string;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown>;
};

const ACTION_WORD: Record<string, string> = { insert: "Added", update: "Changed", delete: "Deleted" };
/** Who/when columns every table has; they are shown once, not as changes. */
const ALWAYS = new Set(["created_at", "created_by", "updated_at", "updated_by"]);

function show(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

/** What changed, in short lines: "name: Old → New". */
function changes(e: Entry): string[] {
  if (e.action === "insert") {
    return Object.entries(e.new_values)
      .filter(([k, v]) => !ALWAYS.has(k) && v !== null && k !== "id")
      .slice(0, 6)
      .map(([k, v]) => `${k}: ${show(v)}`);
  }
  const before = e.old_values ?? {};
  return Object.keys(e.new_values)
    .filter((k) => !ALWAYS.has(k) && JSON.stringify(before[k]) !== JSON.stringify(e.new_values[k]))
    .map((k) => `${k}: ${show(before[k])} → ${show(e.new_values[k])}`);
}

export default function AuditLogPage(props: PageProps<"/audit-log">) {
  return (
    <PageShell width="wide">
      <List searchParams={props.searchParams} />
    </PageShell>
  );
}

async function List({ searchParams }: { searchParams: PageProps<"/audit-log">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_MANAGE_ACCOUNTS.includes(me.roleCode)) return <CannotSee area="audit-log" title="Audit Log" />;
  const params = await searchParams;
  const table = typeof params.table === "string" && /^[a-z_]{1,60}$/.test(params.table) ? params.table : "";
  const supabase = await createClient();
  const shown = await pageRows<Entry>(readPage(params.page), PAGE_SIZE, (from, to) => {
    let q = supabase
      .from("audit_log_list")
      .select("id, table_name, record_id, action, changed_by, changed_by_name, changed_at, old_values, new_values", { count: "exact" })
      .order("id", { ascending: false })
      .range(from, to);
    if (table) q = q.eq("table_name", table);
    return q;
  });
  const pageLink = (n: number) => `/audit-log?${new URLSearchParams({ ...(table && { table }), ...(n > 1 && { page: String(n) }) })}`;

  return (
    <>
      <h1 className="page-title text-[28px] md:text-[34px]">Audit Log</h1>
      <p className="mt-2">
        Every change made in the system, newest first: what, when and by whom. Nothing here can be changed or deleted, by anyone.
      </p>
      <form method="get" className="mt-4 flex flex-wrap items-end gap-3" aria-label="Filter the audit log">
        <label className="min-w-64">
          <span className="font-semibold">Table</span>
          <input name="table" defaultValue={table} placeholder="for example items" className={fieldClass} />
        </label>
        <button type="submit" className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white!">
          Show
        </button>
        {table && (
          <Link href="/audit-log" className="inline-flex min-h-11 items-center px-2 font-semibold">
            Show everything
          </Link>
        )}
      </form>
      <p className="mt-4 text-[15px] text-icci-ink-60" data-testid="audit-count">
        {shown.total.toLocaleString("en-IE")} {shown.total === 1 ? "entry" : "entries"}
      </p>
      <ol className="mt-3 space-y-3" data-testid="audit-entries">
        {shown.rows.map((e) => (
          <li key={e.id} className="rounded-xl border border-icci-line bg-white p-4 shadow-card" data-testid="audit-entry">
            <p>
              <span className="font-semibold">
                {ACTION_WORD[e.action] ?? e.action} in {e.table_name}
              </span>{" "}
              · {formatDateTime(e.changed_at)} · {e.changed_by_name ?? (e.changed_by ? "an account" : "the system")}
            </p>
            <p className="font-mono text-xs text-icci-ink-60">Record {e.record_id}</p>
            {changes(e).length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm" dir="auto">
                {changes(e).map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>
      {shown.total > PAGE_SIZE && <Pagination page={shown.page} size={PAGE_SIZE} total={shown.total} hrefFor={pageLink} />}
    </>
  );
}
