// One ticket (slice P3.5): what is wrong, where, the photos and the full
// history, oldest first. Assign, progress, close and reopen come in P3.6.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime, formatEuro } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import {
  describeTicketEvent,
  isTicketStep,
  STEP_DONE,
  MAY_SEE_TICKETS,
  PRIORITY_LABEL,
  STATUS_LABEL,
  TICKET_COLUMNS,
  TICKET_EVENT_COLUMNS,
  ticketNumber,
  type TicketEventRow,
  type TicketRow,
} from "@/lib/tickets/rules";
import { loadLookups } from "../../items/data";
import { adminNames } from "../../stock/data";
import { personNames, TICKET_PHOTO_BUCKET } from "../data";
import { TicketActions } from "../forms";
import { BackLink, CannotSee, PageNotice, Skeleton, StatusBadge } from "@/components/ui";
import { allCompanies, companyChoices } from "../../companies/data";
import { ContactCard, contactContext } from "../../companies/contact-card";
import { TicketExpenseClaims } from "../expense-claims";

export const metadata: Metadata = { title: "Ticket | ICCI Control Dashboard" };

export default function TicketPage(props: PageProps<"/tickets/[id]">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content(props: { params: PageProps<"/tickets/[id]">["params"]; searchParams: PageProps<"/tickets/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_TICKETS.includes(me.roleCode)) return <CannotSee area="tickets" />;
  const { id } = await props.params;
  const { done } = await props.searchParams;
  if (!/^\d{1,12}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("maintenance_tickets").select(TICKET_COLUMNS).eq("id", Number(id)).maybeSingle();
  if (!data) notFound();
  const t = data as TicketRow;

  const [lookups, eventsRes, itemRes, nameOf, peopleRows] = await Promise.all([
    loadLookups(supabase),
    supabase.from("maintenance_ticket_events").select(TICKET_EVENT_COLUMNS).eq("ticket_id", t.id).order("id"),
    t.item_id ? supabase.from("items").select("id, name, label_serial").eq("id", t.item_id).maybeSingle() : null,
    adminNames(supabase),
    // Switched-on people for "Assign" (P3.6: anyone in the directory), every one of them.
    allRows<{ id: string; full_name: string; person_roles: unknown }>((from, to) =>
      supabase.from("people").select("id, full_name, person_roles(name)").eq("active", true).order("full_name").order("id").range(from, to),
    ),
  ]);
  // One role per person (the library's guess at the shape is a list, so read it either way).
  const roleName = (r: unknown) => ((Array.isArray(r) ? r[0] : r) as { name?: string } | null)?.name ?? "";
  const activePeople = peopleRows.map((p) => ({ id: p.id, full_name: p.full_name, role: roleName(p.person_roles) }));
  const events = (eventsRes.data ?? []) as TicketEventRow[];
  const people = await personNames(supabase, [t.reported_by_person_id, t.assigned_person_id, ...events.map((e) => e.new_assignee_person_id)]);
  const item = (itemRes?.data ?? null) as { id: string; name: string; label_serial: string } | null;
  // P1.21: who to call about the asset, offered first in "Passed to a company".
  const contact = item ? await contactContext(supabase, item.id) : null;
  const companyRows = contact?.companies ?? (await allCompanies(supabase));
  const companyName = new Map(companyRows.map((c) => [c.id, c.name]));

  // Photos: the one sent with the report, then any added later.
  const paths = [t.photo_path, ...events.map((e) => e.photo_path)].filter((p): p is string => Boolean(p));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data: urls } = await supabase.storage.from(TICKET_PHOTO_BUCKET).createSignedUrls(paths, 600);
    (urls ?? []).forEach((u, i) => u.signedUrl && signed.set(paths[i], u.signedUrl));
  }
  const reportPhoto = t.photo_path ? signed.get(t.photo_path) : undefined;
  const lastReferral = [...events].reverse().find((e) => e.kind === "referred") ?? null;

  const reporter = t.reported_by_person_id ? (
    <Link href={`/people/${t.reported_by_person_id}`} dir="auto">
      {people.get(t.reported_by_person_id) ?? "A person in the directory"}
    </Link>
  ) : (
    <span dir="auto">{t.reported_by}</span>
  );

  const fields: [string, React.ReactNode][] = [
    ["Where", lookups.locationName.get(t.location_id) ?? "Unknown location"],
    [
      "Asset",
      item ? (
        <Link href={`/items/${item.id}`}>
          {item.label_serial} {item.name}
        </Link>
      ) : (
        "None (a problem with the place)"
      ),
    ],
    ...(t.asset_event_id && item
      ? ([["Opened from", <Link key="from" href={`/items/${item.id}`}>a damage report on this asset</Link>]] as [string, React.ReactNode][])
      : []),
    // A4: the latest company it was passed to, with their job number, at a glance.
    ...(lastReferral && lastReferral.company_id
      ? ([
          [
            "Passed to",
            <span key="passed" data-testid="passed-to">
              <Link href={`/companies/${lastReferral.company_id}`}>{companyName.get(lastReferral.company_id) ?? "A company"}</Link>
              {lastReferral.company_job_ref ? `, their job number ${lastReferral.company_job_ref}` : ""}
              {` (${formatDateTime(lastReferral.created_at)})`}
            </span>,
          ],
        ] as [string, React.ReactNode][])
      : []),
    ["Priority", PRIORITY_LABEL[t.priority].word],
    ["Reported by", reporter],
    ["Reported", `${formatDateTime(t.created_at)} · entered by ${nameOf(t.created_by)}`],
    [
      "Assigned to",
      t.assigned_person_id ? (
        <Link href={`/people/${t.assigned_person_id}`} dir="auto">
          {people.get(t.assigned_person_id) ?? "A person in the directory"}
        </Link>
      ) : (
        "Nobody yet"
      ),
    ],
    ...(t.status === "closed"
      ? ([
          ["Closed", t.closed_at ? formatDateTime(t.closed_at) : ""],
          ["Closing note", t.closing_note ?? ""],
          ["Cost", formatEuro(t.cost_cents)],
        ] as [string, React.ReactNode][])
      : []),
  ];

  return (
    <>
      <BackLink href="/tickets">All tickets</BackLink>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]">Ticket {ticketNumber(t.id)}</h1>
        <StatusBadge {...STATUS_LABEL[t.status]} />
        {t.priority === "urgent" && <StatusBadge {...PRIORITY_LABEL.urgent} />}
      </div>
      {done === "reported" && <PageNotice floating>Problem reported as ticket {ticketNumber(t.id)}.</PageNotice>}
      {done === "reported-damaged" && (
        <PageNotice floating>Problem reported as ticket {ticketNumber(t.id)}, and the item is marked damaged until it is repaired.</PageNotice>
      )}
      {typeof done === "string" && isTicketStep(done) && <PageNotice floating>{STEP_DONE[done]}</PageNotice>}

      <div className="mt-4 grid gap-6 md:grid-cols-[1fr_280px]">
        <section className="rounded-2xl border border-icci-line bg-white p-5 shadow-card" aria-label="Details">
          <p className="whitespace-pre-line text-lg" dir="auto" data-testid="ticket-description">
            {t.description}
          </p>
          <dl className="mt-4 grid gap-x-4 gap-y-2 sm:grid-cols-[140px_1fr]">
            {fields.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-sm font-semibold text-icci-ink-60">{k}</dt>
                <dd className="mb-2 whitespace-pre-line sm:mb-0">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 border-t border-icci-panel pt-4">
            <TicketActions
              ticketId={t.id}
              status={t.status}
              priority={t.priority}
              assignedPersonId={t.assigned_person_id}
              people={activePeople}
              companies={companyChoices(companyRows)}
              suggestedCompany={contact?.call?.companyId ?? null}
            />
          </div>
        </section>
        <section aria-label="Photo">
          {reportPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link
            <img src={reportPhoto} alt="Photo sent with the report" className="w-full rounded-2xl border border-icci-line object-cover shadow-card" />
          ) : (
            <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-icci-gold-300 bg-white text-sm text-icci-ink-60">
              No photo sent
            </div>
          )}
        </section>
      </div>

      {item && (
        <div className="mt-6">
          <ContactCard itemId={item.id} />
        </div>
      )}

      <TicketExpenseClaims ticketId={t.id} closedWithCost={t.status === "closed" && t.cost_cents != null} />

      <section className="mt-8" aria-labelledby="history-title">
        <h2 id="history-title" className="text-lg font-bold text-icci-green-dark">
          History
        </h2>
        <p className="text-sm">Every step on this ticket. Entries are never changed. Oldest first.</p>
        <ol className="mt-3 space-y-3 border-l-2 border-icci-gold pl-4" data-testid="ticket-history">
          {events.map((e) => {
            const pic = e.photo_path ? signed.get(e.photo_path) : undefined;
            return (
              <li key={e.id} className="flex gap-3 rounded-xl border border-icci-line bg-white p-4 shadow-card">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold" dir="auto">
                      {describeTicketEvent(e, people, companyName)}
                    </span>
                    {e.kind === "closed" && e.cost_cents != null && <span className="text-sm">Cost {formatEuro(e.cost_cents)}</span>}
                  </p>
                  {e.asset_event_id && item && (
                    <p className="text-sm">
                      The asset was marked repaired at the same time (see{" "}
                      <Link href={`/items/${item.id}`}>its moves and reports</Link>).
                    </p>
                  )}
                  {e.note && (
                    <p className="whitespace-pre-line text-sm" dir="auto">
                      {e.note}
                    </p>
                  )}
                  <p className="text-sm">
                    {formatDateTime(e.created_at)} · {nameOf(e.created_by)}
                  </p>
                </div>
                {pic && (
                  // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link
                  <img src={pic} alt="Photo with this entry" className="h-20 w-20 shrink-0 rounded-xl border border-icci-line object-cover" />
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}
