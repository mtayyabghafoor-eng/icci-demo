// Record Garda vetting for one person (slice P2.3). Phone-friendly: three
// fields at most. Never for the person linked to your own account (the
// database refuses it too).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_PEOPLE } from "@/lib/people/rules";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeePeople } from "../../cannot-see";
import { VettingForm } from "./vetting-form";
import { BackLink } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Record vetting | ICCI Control Dashboard" };

export default function RecordVettingPage(props: PageProps<"/people/[id]/vetting">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/people/[id]/vetting">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PEOPLE.includes(me.roleCode)) return <CannotSeePeople />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("people").select("id, full_name, active, app_user_id").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as { id: string; full_name: string; active: boolean; app_user_id: string | null };

  return (
    <>
      <BackLink href={`/people/${p.id}`}>Back to {p.full_name}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Record Vetting</h1>
      <p className="mt-1 font-semibold" dir="auto">
        {p.full_name}
      </p>
      {p.app_user_id === me.id ? (
        <p className="mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3" data-testid="own-vetting">
          This is you. Nobody can record their own Garda vetting. Ask another admin.
        </p>
      ) : !p.active ? (
        <p className="mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3" data-testid="switched-off">
          This person is switched off. Switch them back on to record vetting.
        </p>
      ) : (
        <VettingForm personId={p.id} today={todayInDublin()} />
      )}
    </>
  );
}
