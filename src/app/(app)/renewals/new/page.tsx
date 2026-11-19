// Add a renewal (slice P2.8): something the Centre must renew that is not
// already a vehicle, vetting, policy or warranty date, for example building
// insurance or a lift inspection. The first due date is saved with it.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_RENEWALS } from "@/lib/renewals/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeRenewals } from "../cannot-see";
import { ownerChoices } from "../data";
import { RenewalForm } from "../forms";

export const metadata: Metadata = { title: "Add a renewal | ICCI Control Dashboard" };

export default function NewRenewalPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <p className="text-sm">
        <Link className="back-link" href="/renewals">← Renewals</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Add a Renewal</h1>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_RENEWALS.includes(me.roleCode)) return <CannotSeeRenewals />;
  const people = await ownerChoices(await createClient());
  return (
    <>
      <p className="mt-1">
        Vehicle tax, insurance and NCT, Garda vetting, policy reviews and warranties appear in the register by themselves. Add anything else here.
      </p>
      <RenewalForm people={people} />
    </>
  );
}
