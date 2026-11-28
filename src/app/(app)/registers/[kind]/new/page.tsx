// Record a funeral, Shahada or Nikah (Phase 6). The number comes from the
// database once it is saved. Super Admin only.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { isRegisterKind, MAY_SEE_REGISTERS, REGISTER } from "@/lib/registers/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { onCallOn, personChoices } from "../../data";
import { EntryForm } from "../../forms";

export async function generateMetadata(props: PageProps<"/registers/[kind]/new">): Promise<Metadata> {
  const { kind } = await props.params;
  return { title: `${isRegisterKind(kind) ? REGISTER[kind].addLabel : "Register"} | ICCI Control Dashboard` };
}

export default function NewEntryPage(props: PageProps<"/registers/[kind]/new">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Pick<PageProps<"/registers/[kind]/new">, "params">) {
  const { kind } = await params;
  if (!isRegisterKind(kind)) notFound();
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
  const today = todayInDublin();
  const [people, onCall] = await Promise.all([personChoices(supabase), kind === "funerals" ? onCallOn(supabase, today) : Promise.resolve([])]);
  return (
    <>
      {back}
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">{cfg.addLabel}</h1>
      <p className="mt-1">The database gives the entry its number when you save. Nothing can be deleted; a mistake is corrected later, with a reason.</p>
      <EntryForm kind={kind} people={people} today={today} onCallToday={onCall} />
    </>
  );
}
