// Record a renewal of motor tax, insurance or NCT (slice P2.7). Phone-
// friendly: three fields. "?kind=tax" picks the first one in advance.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_VEHICLES, RENEWAL_KINDS, type RenewalKind } from "@/lib/vehicles/rules";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeeVehicles } from "../../cannot-see";
import { RenewalForm } from "../../forms";
import { BackLink } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Record a renewal | ICCI Control Dashboard" };

const note = "mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3";

export default function RenewalPage(props: PageProps<"/vehicles/[id]/renewal">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: Pick<PageProps<"/vehicles/[id]/renewal">, "params" | "searchParams">) {
  const me = await requireAdmin();
  if (!MAY_SEE_VEHICLES.includes(me.roleCode)) return <CannotSeeVehicles />;
  const { id } = await params;
  const { kind } = await searchParams;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("vehicle_status").select("id, registration, active, condition").eq("id", id).maybeSingle();
  if (!data) notFound();
  const v = data as { id: string; registration: string; active: boolean; condition: string };
  const picked = typeof kind === "string" && (RENEWAL_KINDS as string[]).includes(kind) ? (kind as RenewalKind) : "";
  return (
    <>
      <BackLink href={`/vehicles/${v.id}`}>Back to {v.registration}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Record a Renewal</h1>
      <p className="mt-1 font-semibold">{v.registration}</p>
      {v.condition === "disposed" ? (
        <p className={note}>This vehicle has been disposed of. Nothing new can be recorded.</p>
      ) : !v.active ? (
        <p className={note} data-testid="switched-off">
          This vehicle is switched off. Switch it back on to record a renewal.
        </p>
      ) : (
        <RenewalForm vehicleId={v.id} today={todayInDublin()} kind={picked} />
      )}
    </>
  );
}
