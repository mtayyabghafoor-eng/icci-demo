// Correct a register entry (Phase 6): the same form, filled in from the
// newest version, plus "What was wrong?". Saving adds a new version with the
// same number; the old one stays in the history. Super Admin only.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, CannotSee, PageNotice, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { isRegisterKind, MAY_SEE_REGISTERS, peopleOf, REGISTER, type RegisterRow } from "@/lib/registers/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { personChoices } from "../../../data";
import { EntryForm } from "../../../forms";

export const metadata: Metadata = { title: "Correct an entry | ICCI Control Dashboard" };

export default function CorrectEntryPage(props: PageProps<"/registers/[kind]/[id]/correct">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Pick<PageProps<"/registers/[kind]/[id]/correct">, "params">) {
  const { kind, id } = await params;
  const entryId = Number(id);
  if (!isRegisterKind(kind) || !Number.isSafeInteger(entryId) || entryId < 1) notFound();
  const cfg = REGISTER[kind];
  const me = await requireAdmin();
  const back = <BackLink href={`/registers/${kind}/${entryId}`}>Back to the entry</BackLink>;
  if (!MAY_SEE_REGISTERS.includes(me.roleCode)) {
    return (
      <>
        {back}
        <CannotSee area="registers" />
      </>
    );
  }
  const supabase = await createClient();
  const { data } = await supabase.from(cfg.view).select("*").eq("first_id", entryId).maybeSingle();
  if (!data) notFound();
  const current = data as RegisterRow;
  if (current.cancelled_at) {
    return (
      <>
        {back}
        <PageNotice tone="error">This entry is cancelled, so it cannot be corrected.</PageNotice>
      </>
    );
  }
  const people = await personChoices(supabase, peopleOf(kind, current));
  return (
    <>
      {back}
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">
        Correct <span className="title-code">{current.number}</span>
      </h1>
      <p className="mt-1">Change what was wrong and say why. The number stays the same.</p>
      <EntryForm kind={kind} people={people} today={todayInDublin()} current={current} />
    </>
  );
}
