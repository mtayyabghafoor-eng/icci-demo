// One register entry (Phase 6): its number, what the newest version says,
// "Correct this entry" and "Cancel this entry", and every version in the
// history with what changed and why. Super Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, buttonClass, CannotSee, PageNotice, SecondaryLink, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate, formatDateTime } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { messageTone } from "@/lib/ui/messages";
import {
  CIVIL,
  entryName,
  isRegisterKind,
  MAY_SEE_REGISTERS,
  peopleOf,
  REASON_MAX,
  REGISTER,
  servicesWords,
  type AnyRow,
  type FuneralRow,
  type NikahRow,
  type RegisterKind,
  type ShahadaRow,
} from "@/lib/registers/rules";
import { cancelEntry } from "../../actions";
import { adminNames, peopleNames } from "../../data";

const DONE: Record<string, string> = {
  added: "Saved. The database gave it the number above.",
  corrected: "Correction saved. The old version stays in the history below.",
  cancelled: "Entry cancelled. It stays in the register, marked cancelled, and its number is never used again.",
  "cancel-reason": "Please say why this entry is cancelled (500 characters at most).",
  "cancel-refused": "That entry could not be cancelled. It may already be cancelled or corrected.",
  "not-allowed": "Your account is not allowed to do this.",
};

export async function generateMetadata(props: PageProps<"/registers/[kind]/[id]">): Promise<Metadata> {
  const { kind, id } = await props.params;
  const entryId = Number(id);
  if (!isRegisterKind(kind) || !Number.isSafeInteger(entryId) || entryId < 1) return { title: "Register entry | ICCI Control Dashboard" };
  // E7: the tab shows the entry's number only, never a name.
  const { data } = await (await createClient()).from(REGISTER[kind].table).select("number").eq("id", entryId).maybeSingle();
  return { title: `${(data as { number: string } | null)?.number ?? "Register entry"} | ICCI Control Dashboard` };
}

export default function EntryPage(props: PageProps<"/registers/[kind]/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Names = Map<string, { name: string; on: boolean }>;

/** What a version says, as label and words, in the order the form asks. */
function factsOf(kind: RegisterKind, r: AnyRow, names: Names): [string, string][] {
  const who = (id: string) => {
    const p = names.get(id);
    return p ? `${p.name}${p.on ? "" : " (switched off)"}` : "Not found";
  };
  const date: [string, string] = [REGISTER[kind].dateLabel, formatDate(r.service_date)];
  if (kind === "funerals") {
    const f = r as FuneralRow;
    return [
      ["Person who died", f.deceased_name],
      date,
      ["Family contact", f.family_contact_name],
      ["Family contact's phone", f.family_contact_phone ?? "Not recorded"],
      ["Services", servicesWords(f)],
      ["On duty", f.on_duty_person_ids.map(who).join(", ")],
    ];
  }
  if (kind === "shahada") {
    const s = r as ShahadaRow;
    return [
      ["Name", s.person_name],
      date,
      ["Authenticating imam", who(s.imam_person_id)],
      ["Witnesses", [s.witness_1, s.witness_2].filter(Boolean).join(", ") || "None recorded"],
      ["18 or over", s.adult_confirmed ? "Confirmed" : "Not confirmed"],
    ];
  }
  const n = r as NikahRow;
  return [
    ["First spouse", n.spouse_1_name],
    ["Second spouse", n.spouse_2_name],
    date,
    ["Officiant", who(n.officiant_person_id)],
    ["Witnesses", `${n.witness_1}, ${n.witness_2}`],
    ["Wali", n.wali_name ?? "None recorded"],
    ["Also a civil marriage", CIVIL[n.civil_registration]],
    ["Both 18 or over", n.adults_confirmed ? "Confirmed" : "Not confirmed"],
  ];
}

async function Content({ params, searchParams }: Pick<PageProps<"/registers/[kind]/[id]">, "params" | "searchParams">) {
  const { kind, id } = await params;
  const { done } = await searchParams;
  const entryId = Number(id);
  if (!isRegisterKind(kind) || !Number.isSafeInteger(entryId) || entryId < 1) notFound();
  const cfg = REGISTER[kind];
  const me = await requireAdmin();
  const back = <BackLink href={`/registers/${kind}`}>{cfg.title}</BackLink>;
  if (!MAY_SEE_REGISTERS.includes(me.roleCode)) {
    return (
      <>
        {back}
        <CannotSee area="registers" />
      </>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from(cfg.table).select("*").eq("first_id", entryId).order("id", { ascending: true });
  const versions = (data ?? []) as AnyRow[];
  if (versions.length === 0) notFound();
  const current = versions[versions.length - 1];
  const [names, adminName] = await Promise.all([peopleNames(supabase, versions.flatMap((v) => peopleOf(kind, v))), adminNames(supabase)]);
  const facts = factsOf(kind, current, names);
  const cancelled = current.cancelled_at !== null;

  return (
    <>
      {back}
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="page-title text-[28px] md:text-[34px]" dir="auto">
          {entryName(kind, current)}
        </h1>
        {cancelled && <StatusBadge word="Cancelled" tone="grey" />}
      </div>
      <p className="code-tag mt-1" data-testid="entry-number">
        {current.number}
      </p>
      {typeof done === "string" && DONE[done] && (
        <PageNotice floating tone={messageTone(done)} testId="notice">
          {DONE[done]}
        </PageNotice>
      )}

      <dl className="facts" data-testid="entry-facts">
        {facts.map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd dir="auto">{value}</dd>
          </div>
        ))}
        <dt>Recorded</dt>
        <dd>
          {formatDateTime(versions[0].created_at)} by {adminName(versions[0].created_by)}
        </dd>
      </dl>

      {cancelled ? (
        <p className="mt-4 rounded-xl border border-icci-line bg-[#F0F0EE] p-4" data-testid="cancelled-note">
          Cancelled by {adminName(current.cancelled_by)}, {formatDateTime(current.cancelled_at!)}. Reason: <span dir="auto">{current.cancelled_reason}</span>
        </p>
      ) : (
        <div className="mt-4 flex flex-wrap items-start gap-3">
          <SecondaryLink href={`/registers/${kind}/${entryId}/correct`}>Correct this entry</SecondaryLink>
          <details className="min-w-0 flex-1">
            <summary className={`${buttonClass("danger")} cursor-pointer list-none`}>Cancel this entry</summary>
            <form action={cancelEntry.bind(null, kind, entryId, current.id)} className="mt-3 rounded-xl border border-icci-line bg-white p-4">
              <p className="text-sm">For an entry that should never have been made, for example one entered twice. It stays in the register, marked cancelled. Its number is never used again.</p>
              <label className="mt-2 block">
                <span className="font-semibold">Why is it cancelled?</span>
                <input dir="auto" name="reason" required maxLength={REASON_MAX} className="mt-1 block min-h-11 w-full rounded-xl border border-icci-field bg-white px-3.5 py-2" />
              </label>
              <button type="submit" className={`${buttonClass("danger")} mt-3`}>
                Cancel the entry
              </button>
            </form>
          </details>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="entry-history">
        <h2 className="text-lg font-semibold text-icci-green-dark">History</h2>
        <ol className="mt-3 space-y-3">
          {[...versions].reverse().map((v, i) => {
            const n = versions.length - i;
            const before = n > 1 ? factsOf(kind, versions[n - 2], names) : null;
            const after = factsOf(kind, v, names);
            const changed = before ? after.filter(([, value], j) => before[j]?.[1] !== value).map(([label]) => label) : [];
            return (
              <li key={v.id} className="rounded-xl border border-icci-line p-4">
                <p className="font-semibold">
                  {n === 1 ? "First recorded" : `Correction ${n - 1}`}: {formatDateTime(v.created_at)} by {adminName(v.created_by)}
                </p>
                {v.correction_reason && (
                  <p className="text-sm" dir="auto">
                    What was wrong: {v.correction_reason}
                  </p>
                )}
                {before && <p className="text-sm">Changed: {changed.length ? changed.join(", ") : "nothing shown here (the same details were saved again)"}.</p>}
                {n < versions.length && (
                  <details className="mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">What this version said</summary>
                    <dl className="facts">
                      {after.map(([label, value]) => (
                        <div key={label} className="contents">
                          <dt>{label}</dt>
                          <dd dir="auto">{value}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                )}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-sm">Entries are never changed or deleted. A correction is a new version; the old one stays here. </p>
      </section>
      <p className="mt-4 text-sm">
        <Link href={`/registers/${kind}`}>All entries in the {cfg.title.toLowerCase()}</Link>
      </p>
    </>
  );
}
