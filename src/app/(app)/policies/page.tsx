// The policies list (slice P2.5): title, owner, current version, next review
// date and how many people must sign, worst first (review overdue, due soon,
// not published yet, up to date). Switched-off policies are folded away.
// Designed for a PC first; one card per policy on a phone.
// Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { MAY_SEE_POLICIES, POLICY_ROW_COLUMNS, REVIEW_DUE_DAYS, REVIEW_STATUS, worstFirst, type PolicyRow } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { PrimaryLink, SecondaryLink, StatusBadge } from "../items/ui";
import { CannotSeePolicies } from "./cannot-see";
import { loadGridSquares } from "./grid/data";

export const metadata: Metadata = { title: "Policies | ICCI Control Dashboard" };

/** How many switched-off policies the fold shows (there can be many). */
const OFF_SHOWN = 50;

export default function PoliciesPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Policies</h1>
      <p className="mt-2">
        Each policy, its current version and when it is next reviewed, worst first. &ldquo;Review due soon&rdquo; means within{" "}
        {REVIEW_DUE_DAYS} days.
      </p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <List />
      </Suspense>
    </main>
  );
}

type Counts = Map<string, { signed: number; total: number }>;

function signLine(p: PolicyRow, counts: Counts): string {
  if (!p.current_version_id) return p.must_sign === 0 ? "Nobody yet" : `${p.must_sign} must sign`;
  const c = counts.get(p.id);
  if (!c || c.total === 0) return "Nobody yet";
  return `${c.signed} of ${c.total}`;
}

async function List() {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSeePolicies />;
  const supabase = await createClient();
  // Switched-on policies in full; only the most recently changed switched-off
  // ones (there can be many), with a count of them all.
  const [{ data }, { data: offData, count: offCount }, squares] = await Promise.all([
    supabase.from("policies_overview").select(POLICY_ROW_COLUMNS).eq("active", true),
    supabase.from("policies_overview").select(POLICY_ROW_COLUMNS, { count: "exact" }).eq("active", false).order("title").limit(OFF_SHOWN),
    // A7: every square, page by page (one request returns at most 1,000).
    loadGridSquares(supabase),
  ]);
  const ownerIds = [...new Set([...((data ?? []) as PolicyRow[]), ...((offData ?? []) as PolicyRow[])].map((p) => p.owner_person_id))];
  const { data: people } = ownerIds.length ? await supabase.from("people").select("id, full_name").in("id", ownerIds) : { data: [] };
  const counts: Counts = new Map();
  for (const q of squares) {
    const c = counts.get(q.policy_id) ?? { signed: 0, total: 0 };
    c.total += 1;
    if (q.status === "signed") c.signed += 1;
    counts.set(q.policy_id, c);
  }
  const ownerName = new Map(((people ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const inUse = worstFirst((data ?? []) as PolicyRow[]);
  const off = (offData ?? []) as PolicyRow[];

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="policy-count">
          {inUse.length === 0 ? "No policies yet." : `${inUse.length} ${inUse.length === 1 ? "policy" : "policies"}`}
        </p>
        <div className="flex flex-wrap gap-2">
          <SecondaryLink href="/policies/grid">Policy grid</SecondaryLink>
          <PrimaryLink href="/policies/new">Add a policy</PrimaryLink>
        </div>
      </div>
      <Rows rows={inUse} ownerName={ownerName} counts={counts} testId="policy-row" />
      {off.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Switched off ({offCount ?? off.length})</summary>
          <Rows rows={off} ownerName={ownerName} counts={counts} testId="policy-row-off" />
          {(offCount ?? 0) > off.length && <p className="mt-2 text-sm">The first {off.length} by title are shown.</p>}
        </details>
      )}
      <p className="mt-4 text-sm">
        &ldquo;Signed&rdquo; counts switched-on people whose role must sign, against the current version. A new version starts
        everyone at unsigned.
      </p>
    </>
  );
}

function Rows({ rows, ownerName, counts, testId }: { rows: PolicyRow[]; ownerName: Map<string, string>; counts: Counts; testId: string }) {
  if (rows.length === 0) return null;
  return (
    <>
      <div className="list-table-wrap">
        <table className="list-table hidden md:table">
          <thead>
            <tr>
              <th className="px-3 py-2">Title</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Current version</th>
              <th className="px-3 py-2">Next review</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Signed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} data-testid={testId} className="border-b border-icci-panel align-top">
                <td className="px-3 py-2" dir="auto">
                  <Link href={`/policies/${p.id}`} className="font-semibold">
                    {p.title}
                  </Link>
                  {p.has_draft && <span className="block text-sm">A draft is waiting to be published.</span>}
                </td>
                <td className="px-3 py-2" dir="auto">
                  {ownerName.get(p.owner_person_id)}
                </td>
                <td className="px-3 py-2">{p.current_label ? `${p.current_label}, approved ${formatDate(p.approved_on)}` : "None yet"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.next_review_on ? formatDate(p.next_review_on) : "–"}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <StatusBadge {...REVIEW_STATUS[p.review_status]} />
                </td>
                <td className="px-3 py-2" data-testid="signed">{signLine(p, counts)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mt-3 space-y-3 md:hidden">
        {rows.map((p) => (
          <li key={p.id}>
            <Link href={`/policies/${p.id}`} data-testid={testId} className="list-card">
              <span className="flex items-start justify-between gap-2">
                <span className="font-semibold text-icci-green" dir="auto">
                  {p.title}
                </span>
                <StatusBadge {...REVIEW_STATUS[p.review_status]} />
              </span>
              <span className="mt-1 block text-sm">
                {p.current_label ? `Version ${p.current_label}` : "Not published yet"}
                {p.next_review_on ? ` · review ${formatDate(p.next_review_on)}` : ""}
              </span>
              <span className="block text-sm" dir="auto">
                Owner: {ownerName.get(p.owner_person_id)} · signed: {signLine(p, counts)}
              </span>
              {p.has_draft && <span className="block text-sm">A draft is waiting to be published.</span>}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
