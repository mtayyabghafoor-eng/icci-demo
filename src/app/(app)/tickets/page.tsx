// The tickets list (slice P3.5): tickets not yet closed first, urgent at the
// top. Filter by status, priority, place (and what is inside it) and who it
// is assigned to; download what is shown as a CSV file. Designed for a PC
// first; one card per ticket on a phone. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Pagination } from "@/components/ui";
import { FilterFold } from "@/components/ui/filter-fold";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import {
  filtersQuery,
  MAY_SEE_TICKETS,
  PRIORITY_LABEL,
  readFilters,
  shortDescription,
  STATUS_LABEL,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  ticketNumber,
  type TicketCsvRow,
} from "@/lib/tickets/rules";
import { PAGE_SIZE, pageOf, readPage } from "@/lib/ui/text";
import { PrimaryLink, StatusBadge } from "../items/ui";
import { CannotSeeTickets } from "./cannot-see";
import { filterChoices, loadTickets } from "./data";

export const metadata: Metadata = { title: "Tickets | ICCI Control Dashboard" };

export default function TicketsPage(props: PageProps<"/tickets">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Maintenance Tickets</h1>
      <p className="mt-2">Problems reported around the Centre. Tickets not yet closed come first, urgent ones at the top.</p>
      <Suspense fallback={<p className="mt-6">Loading tickets…</p>}>
        <List searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

const field =
  "mt-1 block min-h-11 w-full rounded-xl border border-[#c9d3cf] bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green";

async function List({ searchParams }: { searchParams: PageProps<"/tickets">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_TICKETS.includes(me.roleCode)) return <CannotSeeTickets />;

  const params = await searchParams;
  const f = readFilters(params);
  const supabase = await createClient();
  const { rows: all, lookups } = await loadTickets(supabase, f);
  const choices = await filterChoices(supabase, lookups);
  const { rows, page, total } = pageOf(all, readPage(params.page), PAGE_SIZE);
  const query = filtersQuery(f);
  const pageLink = (p: number) => `/tickets${query}${query ? "&" : "?"}page=${p}`;
  const filtered = query !== "";
  const urgent = all.filter((t) => t.priority === "urgent" && t.status !== "closed").length;

  return (
    <>
      <form data-folded="true" method="get" className="list-filters mt-5 flex flex-wrap items-end gap-3" aria-label="Filter tickets">
        <label className="min-w-40 flex-1">
          <span className="font-semibold">Status</span>
          <select name="status" defaultValue={f.status} className={field}>
            <option value="not_closed">Not closed yet</option>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s].word}
              </option>
            ))}
            <option value="all">All tickets</option>
          </select>
        </label>
        <label className="min-w-36 flex-1">
          <span className="font-semibold">Priority</span>
          <select name="priority" defaultValue={f.priority} className={field}>
            <option value="">Any priority</option>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p].word}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-56 flex-[2]">
          <span className="font-semibold">Place</span>
          <select name="place" defaultValue={f.place} className={field}>
            <option value="">Everywhere</option>
            {choices.places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.path}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-44 flex-1">
          <span className="font-semibold">Assigned to</span>
          <select name="assigned" defaultValue={f.assigned} className={field}>
            <option value="">Anyone or nobody</option>
            <option value="nobody">Nobody yet</option>
            {choices.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] bg-icci-green-dark px-4 py-2 font-semibold text-white! no-underline shadow-sm transition-colors duration-150 hover:bg-icci-green-900"
        >
          Show
        </button>
        {filtered && (
          <Link href="/tickets" className="inline-flex min-h-11 items-center px-2 font-semibold">
            Clear filters
          </Link>
        )}
        <FilterFold />
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="ticket-count">
          {total === 0 ? "No tickets match." : `${total} ${total === 1 ? "ticket" : "tickets"}`}
          {urgent > 0 && ` · ${urgent} urgent`}
        </p>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/tickets/csv${query}`}
            download
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-[10px] border border-icci-green/40 bg-white px-4 py-2 font-semibold text-icci-green! no-underline transition-colors duration-150 hover:border-icci-green hover:bg-icci-green-50"
          >
            Download CSV
          </a>
          <PrimaryLink href="/tickets/new">Report a problem</PrimaryLink>
        </div>
      </div>

      {rows.length > 0 && <Rows rows={rows} />}
      {total > PAGE_SIZE && <Pagination page={page} size={PAGE_SIZE} total={total} hrefFor={pageLink} />}
    </>
  );
}

function Badges({ t }: { t: TicketCsvRow }) {
  return (
    <span className="flex flex-wrap gap-1.5">
      <StatusBadge {...STATUS_LABEL[t.status]} />
      {t.priority !== "normal" && <StatusBadge {...PRIORITY_LABEL[t.priority]} />}
    </span>
  );
}

function Rows({ rows }: { rows: TicketCsvRow[] }) {
  return (
    <>
      <div className="list-table-wrap">
        <table className="list-table hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Ticket</th>
              <th className="px-3 py-2">Problem</th>
              <th className="px-3 py-2">Place</th>
              <th className="px-3 py-2">Assigned to</th>
              <th className="px-3 py-2">Reported</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} data-testid="ticket-row" className="border-b border-icci-panel align-top">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-sm">
                  <Link href={`/tickets/${t.id}`}>{ticketNumber(t.id)}</Link>
                </td>
                <td className="px-3 py-2" dir="auto">
                  <Link href={`/tickets/${t.id}`} className="font-semibold">
                    {shortDescription(t.description)}
                  </Link>
                  {t.asset && <span className="block text-sm">{t.asset}</span>}
                </td>
                <td className="px-3 py-2 text-sm">{t.place}</td>
                <td className="px-3 py-2 text-sm" dir="auto">
                  {t.assignee || "Nobody yet"}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-sm">{formatDate(t.created_at)}</td>
                <td className="px-3 py-2">
                  <Badges t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((t) => (
          <li key={t.id}>
            <Link href={`/tickets/${t.id}`} data-testid="ticket-row" className="list-card">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green" dir="auto">
                  {shortDescription(t.description, 70)}
                </span>
                <Badges t={t} />
              </span>
              <span className="mt-1 block text-sm">
                {ticketNumber(t.id)} · {t.place} · {formatDate(t.created_at)}
              </span>
              <span className="block text-sm" dir="auto">
                Assigned to: {t.assignee || "nobody yet"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
