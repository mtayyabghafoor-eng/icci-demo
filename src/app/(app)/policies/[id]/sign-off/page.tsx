// Record sign-off for a policy's current version (slice P2.6). Lists the
// people who must sign and have not yet; your own name is shown but cannot be
// ticked (the database refuses it too). Several people at once for one sheet.
// A7: opened from a square of the policy grid (?person=…&grid=…), that person
// starts ticked, and Back, Cancel and Save return to the grid with its filter.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDate } from "@/lib/items/rules";
import { MAY_SEE_POLICIES, POLICY_ROW_COLUMNS, type PolicyRow } from "@/lib/policies/rules";
import { readGridBack, SIGNOFF_STATUS, SQUARE_COLUMNS, type Square } from "@/lib/policies/signoffs";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { SignoffForm, type Candidate } from "./signoff-form";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Record sign-off | ICCI Control Dashboard" };

const note = "mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3";

export default function RecordSignoffPage(props: PageProps<"/policies/[id]/sign-off">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/policies/[id]/sign-off">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSee area="policies" />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const grid = readGridBack(sp.grid);
  const ticked = typeof sp.person === "string" && UUID.test(sp.person) ? sp.person : null;
  const gridHref = grid === null ? null : `/policies/grid${grid ? `?${grid}` : ""}`;
  const supabase = await createClient();
  const { data } = await supabase.from("policies_overview").select(POLICY_ROW_COLUMNS).eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as PolicyRow;
  const [squaresRes, mine] = await Promise.all([
    supabase.from("policy_grid").select(SQUARE_COLUMNS).eq("policy_id", id).neq("status", "signed").order("full_name"),
    supabase.from("people").select("id").eq("app_user_id", me.id).maybeSingle(),
  ]);
  const squares = (squaresRes.data ?? []) as Square[];
  const myPerson = (mine.data as { id: string } | null)?.id ?? null;
  const candidates: Candidate[] = squares.map((s) => ({
    id: s.person_id,
    name: s.full_name,
    isMe: s.person_id === myPerson,
    note: s.person_id === myPerson ? "This is you. Another admin must record your sign-off." : s.status === "overdue" ? SIGNOFF_STATUS.overdue.word : null,
  }));

  return (
    <>
      {gridHref ? <BackLink href={gridHref}>Policy grid</BackLink> : <BackLink href={`/policies/${p.id}`}>Back to {p.title}</BackLink>}
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Record Sign-off</h1>
      <p className="mt-1 font-semibold" dir="auto">
        {p.title}
        {p.current_label ? `, ${p.current_label}` : ""}
      </p>
      {!p.active ? (
        <p className={note} data-testid="switched-off">
          This policy is switched off. Switch it back on to record sign-offs.
        </p>
      ) : !p.current_version_id ? (
        <p className={note} data-testid="nothing-published">
          Nothing is published yet. A version must be published before anyone can sign it.
        </p>
      ) : candidates.length === 0 ? (
        <p className={note} data-testid="all-signed">
          Everyone who must sign this version has signed. Nothing to record.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            For version {p.current_label}, approved {formatDate(p.approved_on)}. Only people who must sign and have not yet are listed.
          </p>
          <SignoffForm
            policyId={p.id}
            versionId={p.current_version_id}
            approvedOn={p.approved_on!}
            today={todayInDublin()}
            candidates={candidates}
            ticked={candidates.some((c) => c.id === ticked && !c.isMe) ? ticked : null}
            grid={grid}
          />
        </>
      )}
    </>
  );
}
