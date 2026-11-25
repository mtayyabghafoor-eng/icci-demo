// Mark a renewal as renewed (slice P2.8). Phone-friendly: two fields. A new
// dated entry is added; the old due date stays in the history.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_RENEWALS } from "@/lib/renewals/rules";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeeRenewals } from "../../cannot-see";
import { RenewedForm } from "../../forms";
import { BackLink } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Mark renewed | ICCI Control Dashboard" };

const note = "mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3";

export default function RenewedPage(props: PageProps<"/renewals/[id]/renewed">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/renewals/[id]/renewed">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_RENEWALS.includes(me.roleCode)) return <CannotSeeRenewals />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("renewals").select("id, title, active").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as { id: string; title: string; active: boolean };
  return (
    <>
      <BackLink href={`/renewals/${r.id}`}>Back to {r.title}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Mark Renewed</h1>
      <p className="mt-1 font-semibold" dir="auto">
        {r.title}
      </p>
      {!r.active ? (
        <p className={note} data-testid="switched-off">
          This renewal is switched off. Switch it back on to record a new date.
        </p>
      ) : (
        <RenewedForm renewalId={r.id} today={todayInDublin()} />
      )}
    </>
  );
}
