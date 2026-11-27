// One vehicle (slice P2.7): registration, make and model, keeper, the asset
// it belongs to, and motor tax, insurance and NCT with their status and full
// history. "Record a renewal"; a wrong entry is withdrawn with a reason.
import { messageTone } from "@/lib/ui/messages";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate, formatDateTime } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import {
  DATE_STATUS,
  dateOf,
  KIND_LABEL,
  MAY_SEE_VEHICLES,
  RENEWAL_COLUMNS,
  RENEWAL_KINDS,
  VEHICLE_COLUMNS,
  type Renewal,
  type VehicleRow,
} from "@/lib/vehicles/rules";
import { todayInDublin, daysBetween } from "@/lib/vetting/rules";
import { setVehicleActive, withdrawRenewal } from "../actions";
import { BackLink, buttonClass, CannotSee, PageNotice, PrimaryLink, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Vehicle | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Vehicle registered. Now record its motor tax, insurance and NCT.",
  saved: "Changes saved.",
  renewed: "Renewal recorded.",
  withdrawn: "Entry withdrawn. It stays in the history, marked withdrawn.",
  "withdraw-reason": "Please say why the entry is wrong (500 characters at most).",
  "withdraw-refused": "That entry could not be withdrawn. It may already be withdrawn.",
  "switched-off": "Switched off. Its history stays, but nothing new can be recorded.",
  "switched-on": "Switched back on.",
  "not-allowed": "Your account is not allowed to do this.",
};

export default function VehiclePage(props: PageProps<"/vehicles/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <BackLink href="/vehicles">Vehicles</BackLink>
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function untilLine(until: string | null, status: string, today: string): string {
  if (status === "not_needed") return "Not needed yet.";
  if (!until) return "Nothing recorded.";
  const days = daysBetween(today, until);
  if (days < 0) return `Ended ${formatDate(until)}, ${-days} ${days === -1 ? "day" : "days"} ago.`;
  if (days === 0) return `Ends today, ${formatDate(until)}.`;
  return `Valid until ${formatDate(until)}, ${days} ${days === 1 ? "day" : "days"} left.`;
}

async function Content({ params, searchParams }: Pick<PageProps<"/vehicles/[id]">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_VEHICLES.includes(me.roleCode)) return <CannotSee area="vehicles" />;
  const { id } = await params;
  const { done } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("vehicle_status").select(VEHICLE_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const v = data as VehicleRow;
  const [renewalsRes, keeper, accounts] = await Promise.all([
    supabase.from("vehicle_renewals").select(RENEWAL_COLUMNS).eq("vehicle_id", id).order("renewed_on", { ascending: false }).order("id", { ascending: false }),
    v.keeper_person_id ? supabase.from("people").select("id, full_name, active").eq("id", v.keeper_person_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("app_users").select("id, display_name"),
  ]);
  const renewals = (renewalsRes.data ?? []) as Renewal[];
  const k = keeper.data as { id: string; full_name: string; active: boolean } | null;
  const adminName = (uid: string | null) => ((accounts.data ?? []) as { id: string; display_name: string }[]).find((a) => a.id === uid)?.display_name ?? "an admin";
  const today = todayInDublin();
  const open = v.active && v.condition !== "disposed";
  const button = "inline-flex min-h-11 items-center justify-center rounded-[10px] border px-4 py-2 font-semibold transition-colors duration-150";

  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]">{v.registration}</h1>
        {!v.active && <StatusBadge word="Switched off" tone="grey" />}
        {v.condition === "disposed" && <StatusBadge word="Disposed of" tone="grey" />}
      </div>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating tone={messageTone(done)} testId="notice">{DONE[done]}</PageNotice>
      )}

      <dl className="facts">
        <dt>Make and model</dt>
        <dd>{v.make_model ?? "Not recorded"}</dd>
        <dt>Keeper</dt>
        <dd dir="auto" data-testid="keeper">
          {k ? (
            <Link href={`/people/${k.id}`}>
              {k.full_name}
              {k.active ? "" : " (switched off)"}
            </Link>
          ) : (
            "Nobody"
          )}
        </dd>
        <dt>Asset</dt>
        <dd>
          <Link href={`/items/${v.item_id}`}>
            {v.item_name} ({v.label_serial})
          </Link>
          <span className="block text-sm">Location, photo and damage reports are on the asset&rsquo;s page.</span>
        </dd>
      </dl>

      <div className="mt-4 flex flex-wrap gap-3">
        <SecondaryLink href={`/vehicles/${v.id}/edit`}>Change details</SecondaryLink>
        {v.condition !== "disposed" && (
          <form action={setVehicleActive.bind(null, v.id, !v.active)}>
            {v.active ? (
              <button type="submit" className={buttonClass("danger")}>
                Switch off
              </button>
            ) : (
              <button type="submit" className={`${button} border-icci-green-dark bg-icci-green-dark text-white shadow-sm hover:bg-icci-green-900`}>
                Switch back on
              </button>
            )}
          </form>
        )}
      </div>

      <section className="mt-6 grid gap-3 sm:grid-cols-3" data-testid="vehicle-dates" aria-label="Motor tax, insurance and NCT">
        {RENEWAL_KINDS.map((kind) => {
          const d = dateOf(v, kind);
          return (
            <div key={kind} className="rounded-2xl border border-icci-line bg-white p-4 shadow-card" data-testid={`date-${kind}`}>
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-icci-green-dark">{KIND_LABEL[kind]}</h2>
                <StatusBadge {...DATE_STATUS[d.status]} />
              </div>
              <p className="mt-1 text-sm">{untilLine(d.until, d.status, today)}</p>
              {open && (
                <Link href={`/vehicles/${v.id}/renewal?kind=${kind}`} className="mt-2 inline-flex min-h-11 items-center font-semibold">
                  Record {KIND_LABEL[kind].toLowerCase() === "nct" ? "NCT" : KIND_LABEL[kind].toLowerCase()} renewal
                </Link>
              )}
            </div>
          );
        })}
      </section>

      <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="renewals">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-icci-green-dark">History</h2>
          {open && <PrimaryLink href={`/vehicles/${v.id}/renewal`}>Record a renewal</PrimaryLink>}
        </div>
        {renewals.length === 0 ? (
          <p className="mt-2">Nothing recorded yet.</p>
        ) : (
          <ol className="mt-3 space-y-3" data-testid="renewal-history">
            {renewals.map((r) => (
              <li key={r.id} className={`rounded-xl border p-4 ${r.withdrawn_at ? "border-dashed border-icci-text/40 bg-[#F0F0EE]" : "border-icci-line"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {KIND_LABEL[r.kind]}: renewed {formatDate(r.renewed_on)}, valid until {formatDate(r.valid_until)}
                  </span>
                  {r.withdrawn_at && <StatusBadge word="Withdrawn" tone="grey" />}
                </div>
                <p className="text-sm">
                  Entered by {adminName(r.created_by)}, {formatDateTime(r.created_at)}.
                </p>
                {r.withdrawn_at ? (
                  <p className="text-sm">
                    Withdrawn by {adminName(r.withdrawn_by)}, {formatDateTime(r.withdrawn_at)}. Reason: {r.withdrawn_reason}
                  </p>
                ) : (
                  <details className="mt-2">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Withdraw this entry</summary>
                    <form action={withdrawRenewal.bind(null, v.id, r.id)} className="mt-2 flex flex-wrap items-end gap-3">
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
        <p className="mt-3 text-sm">Entries are never changed or deleted. A wrong one is withdrawn, and the right one recorded.</p>
      </section>
    </>
  );
}
