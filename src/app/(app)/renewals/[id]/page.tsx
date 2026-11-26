// One typed-in renewal (slice P2.8): title, category, owner, documents
// needed, notes, its current due date with status, and the full history of
// due dates. "Mark renewed" adds a new entry; a wrong one is withdrawn with a
// reason. Switched off, never deleted.
import { messageTone } from "@/lib/ui/messages";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate, formatDateTime } from "@/lib/items/rules";
import { dueLine, MAY_SEE_RENEWALS, REGISTER_COLUMNS, REGISTER_STATUS, type RegisterRow } from "@/lib/renewals/rules";
import { createClient } from "@/lib/supabase/server";
import { daysBetween, todayInDublin } from "@/lib/vetting/rules";
import { setRenewalActive, withdrawDueDate } from "../actions";
import { BackLink, buttonClass, CannotSee, PageNotice, PrimaryLink, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Renewal | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Renewal added. It is now in the register.",
  saved: "Changes saved.",
  renewed: "Marked renewed. The new due date counts from now.",
  withdrawn: "Entry withdrawn. It stays in the history, marked withdrawn.",
  "withdraw-reason": "Please say why the entry is wrong (500 characters at most).",
  "withdraw-refused": "That entry could not be withdrawn. It may already be withdrawn.",
  "switched-off": "Switched off. It leaves the register, and its history stays.",
  "switched-on": "Switched back on.",
  "not-allowed": "Your account is not allowed to do this.",
};

type Renewal = {
  id: string;
  title: string;
  category: string;
  owner_person_id: string | null;
  documents_needed: string | null;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
};
type DueEntry = {
  id: number;
  renewed_on: string | null;
  due_on: string;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  withdrawn_reason: string | null;
  created_by: string | null;
  created_at: string;
};

export default function RenewalPage(props: PageProps<"/renewals/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/renewals">Renewals</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/renewals/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_RENEWALS.includes(me.roleCode)) return <CannotSee area="renewals" />;
  const { id } = await params;
  const { done } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("renewals")
    .select("id, title, category, owner_person_id, documents_needed, notes, active, created_by, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const r = data as Renewal;
  const [datesRes, statusRes, owner, accounts] = await Promise.all([
    supabase
      .from("renewal_dates")
      .select("id, renewed_on, due_on, withdrawn_at, withdrawn_by, withdrawn_reason, created_by, created_at")
      .eq("renewal_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("renewals_register").select(REGISTER_COLUMNS).eq("source", "manual").eq("record_id", id).maybeSingle(),
    r.owner_person_id ? supabase.from("people").select("id, full_name, active").eq("id", r.owner_person_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("app_users").select("id, display_name"),
  ]);
  const dates = (datesRes.data ?? []) as DueEntry[];
  const current = statusRes.data as RegisterRow | null;
  const o = owner.data as { id: string; full_name: string; active: boolean } | null;
  const adminName = (uid: string | null) => ((accounts.data ?? []) as { id: string; display_name: string }[]).find((a) => a.id === uid)?.display_name ?? "an admin";
  const today = todayInDublin();
  const button = "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 py-2 font-semibold transition-colors duration-150";

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
          {r.title}
        </h1>
        {!r.active && <StatusBadge word="Switched off" tone="grey" />}
      </div>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating tone={messageTone(done)} testId="notice">{DONE[done]}</PageNotice>
      )}

      {current && (
        <section className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="current-due">
          <StatusBadge {...REGISTER_STATUS[current.status]} />
          <span className="font-semibold">{current.due_on ? `Due ${formatDate(current.due_on)}` : "No due date"}</span>
          <span>{dueLine(current.due_on, current.status, current.due_on ? daysBetween(today, current.due_on) : null)}</span>
        </section>
      )}

      <dl className="mt-4 grid gap-x-6 gap-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card sm:grid-cols-[10rem_1fr]">
        <dt className="text-sm font-semibold text-icci-ink-60">Category</dt>
        <dd>{r.category}</dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Owner</dt>
        <dd dir="auto" data-testid="owner">
          {o ? (
            <Link href={`/people/${o.id}`}>
              {o.full_name}
              {o.active ? "" : " (switched off)"}
            </Link>
          ) : (
            "Nobody"
          )}
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Documents needed</dt>
        <dd className="whitespace-pre-line" dir="auto">
          {r.documents_needed ?? "None listed"}
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Notes</dt>
        <dd className="whitespace-pre-line" dir="auto">
          {r.notes ?? "None"}
        </dd>
        <dt className="text-sm font-semibold text-icci-ink-60">Added</dt>
        <dd>
          By {adminName(r.created_by)}, {formatDateTime(r.created_at)}
        </dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        {r.active && <PrimaryLink href={`/renewals/${r.id}/renewed`}>Mark renewed</PrimaryLink>}
        <SecondaryLink href={`/renewals/${r.id}/edit`}>Change details</SecondaryLink>
        <form action={setRenewalActive.bind(null, r.id, !r.active)}>
          {r.active ? (
            <button type="submit" className={buttonClass("danger")}>
              Switch off
            </button>
          ) : (
            <button type="submit" className={`${button} border-icci-green-dark bg-icci-green-dark text-white shadow-sm hover:bg-icci-green-900`}>
              Switch back on
            </button>
          )}
        </form>
      </div>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="due-history">
        <h2 className="text-lg font-semibold text-icci-green-dark">History of due dates</h2>
        {dates.length === 0 ? (
          <p className="mt-2">Nothing recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {dates.map((d) => (
              <li key={d.id} data-testid="due-entry" className={`rounded-xl border p-4 ${d.withdrawn_at ? "border-dashed border-icci-text/40 bg-[#F0F0EE]" : "border-icci-line"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {d.renewed_on ? `Renewed ${formatDate(d.renewed_on)}, next due ${formatDate(d.due_on)}` : `Due date entered: ${formatDate(d.due_on)}`}
                  </span>
                  {d.withdrawn_at && <StatusBadge word="Withdrawn" tone="grey" />}
                </div>
                <p className="text-sm">
                  Entered by {adminName(d.created_by)}, {formatDateTime(d.created_at)}.
                </p>
                {d.withdrawn_at ? (
                  <p className="text-sm">
                    Withdrawn by {adminName(d.withdrawn_by)}, {formatDateTime(d.withdrawn_at)}. Reason: {d.withdrawn_reason}
                  </p>
                ) : (
                  <details className="mt-2">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Withdraw this entry</summary>
                    <form action={withdrawDueDate.bind(null, r.id, d.id)} className="mt-2 flex flex-wrap items-end gap-3">
                      <label className="min-w-64 flex-1">
                        <span className="font-semibold">Why is it wrong?</span>
                        <input
                          name="reason"
                          required
                          maxLength={500}
                          className="mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2 transition-colors duration-150 hover:border-icci-green/60 focus:border-icci-green"
                        />
                      </label>
                      <button type="submit" className={`${button} border-icci-field bg-white text-icci-text hover:border-icci-green hover:bg-icci-green-50`}>
                        Withdraw
                      </button>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-3 text-sm">Due dates are never changed or deleted. The latest one counts; a wrong one is withdrawn.</p>
      </section>
    </>
  );
}
