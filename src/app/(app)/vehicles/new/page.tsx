// Register a vehicle (slice P2.7): pick the labelled asset (category
// "Vehicles"), then add its registration, make and model, keeper and whether
// an NCT is needed yet. The asset itself is registered as an item first.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { createClient } from "@/lib/supabase/server";
import { MAY_SEE_VEHICLES } from "@/lib/vehicles/rules";
import { CannotSeeVehicles } from "../cannot-see";
import { assetChoices, keeperChoices } from "../data";
import { VehicleForm } from "../forms";

export const metadata: Metadata = { title: "Register a vehicle | ICCI Control Dashboard" };

export default function NewVehiclePage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/vehicles">← Vehicles</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Register a Vehicle</h1>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_VEHICLES.includes(me.roleCode)) return <CannotSeeVehicles />;
  const supabase = await createClient();
  const [assets, people] = await Promise.all([assetChoices(supabase), keeperChoices(supabase)]);
  return (
    <>
      <p className="mt-1">
        A vehicle is first registered as an item, with a label, in the &ldquo;Vehicles&rdquo; category. Then its vehicle details are added here.
      </p>
      {assets.length === 0 ? (
        <p className="mt-4 rounded-xl border border-icci-line bg-white p-5 shadow-card" data-testid="no-vehicle-assets">
          No asset in the &ldquo;Vehicles&rdquo; category is waiting for vehicle details. <Link href="/items/new">Register an item</Link> first, choosing
          the &ldquo;Vehicles&rdquo; category.
        </p>
      ) : (
        <VehicleForm people={people} assets={assets} />
      )}
    </>
  );
}
