// Record training for one person (slice P2.4). Phone-friendly: three fields
// (type, date done, expiry). Never for the person linked to your own account
// (the database refuses it too).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { TRAINING_TYPE_COLUMNS, type TrainingType } from "@/lib/training/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { TrainingForm } from "./training-form";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Record training | ICCI Control Dashboard" };

export default function RecordTrainingPage(props: PageProps<"/people/[id]/training">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/people/[id]/training">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSee area="people" />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, types] = await Promise.all([
    supabase.from("people").select("id, full_name, active, app_user_id").eq("id", id).maybeSingle(),
    supabase.from("training_types").select(TRAINING_TYPE_COLUMNS).eq("active", true).order("name"),
  ]);
  if (!data) notFound();
  const p = data as { id: string; full_name: string; active: boolean; app_user_id: string | null };
  const note = "mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3";

  return (
    <>
      <BackLink href={`/people/${p.id}`}>Back to {p.full_name}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Record Training</h1>
      <p className="mt-1 font-semibold" dir="auto">
        {p.full_name}
      </p>
      {p.app_user_id === me.id ? (
        <p className={note} data-testid="own-training">
          This is you. Nobody can record their own training. Ask another admin.
        </p>
      ) : !p.active ? (
        <p className={note} data-testid="switched-off">
          This person is switched off. Switch them back on to record training.
        </p>
      ) : (
        <TrainingForm personId={p.id} today={todayInDublin()} types={(types.data ?? []) as TrainingType[]} />
      )}
    </>
  );
}
