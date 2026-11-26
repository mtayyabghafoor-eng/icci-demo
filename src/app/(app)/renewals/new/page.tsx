// Add a renewal (slice P2.8): something the Centre must renew that is not
// already a vehicle, vetting, policy or warranty date, for example building
// insurance or a lift inspection. The first due date is saved with it.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_RENEWALS } from "@/lib/renewals/rules";
import { createClient } from "@/lib/supabase/server";
import { ownerChoices } from "../data";
import { RenewalForm } from "../forms";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Add a renewal | ICCI Control Dashboard" };

export default function NewRenewalPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <BackLink href="/renewals">Renewals</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Add a Renewal</h1>
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_RENEWALS.includes(me.roleCode)) return <CannotSee area="renewals" />;
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
