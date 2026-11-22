// Change a vehicle's details (slice P2.7): registration, make and model,
// keeper, and whether an NCT is needed yet. Changes are kept in the audit log.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_VEHICLES } from "@/lib/vehicles/rules";
import { CannotSeeVehicles } from "../../cannot-see";
import { keeperChoices } from "../../data";
import { VehicleForm } from "../../forms";
import { BackLink } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Change vehicle | ICCI Control Dashboard" };

export default function EditVehiclePage(props: PageProps<"/vehicles/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/vehicles/[id]/edit">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_VEHICLES.includes(me.roleCode)) return <CannotSeeVehicles />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("vehicles").select("id, registration, make_model, keeper_person_id, nct_needed").eq("id", id).maybeSingle();
  if (!data) notFound();
  const v = data as { id: string; registration: string; make_model: string | null; keeper_person_id: string | null; nct_needed: boolean };
  return (
    <>
      <BackLink href={`/vehicles/${v.id}`}>Back to {v.registration}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Change Vehicle</h1>
      <VehicleForm people={await keeperChoices(supabase, v.keeper_person_id)} vehicle={v} />
    </>
  );
}
