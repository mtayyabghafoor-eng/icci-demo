// Change a renewal's details (slice P2.8): title, category, owner, documents
// needed, notes. Due dates are never changed here: use "Mark renewed", or
// withdraw a wrong entry. Changes are kept in the audit log.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_RENEWALS } from "@/lib/renewals/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeeRenewals } from "../../cannot-see";
import { ownerChoices } from "../../data";
import { RenewalForm, type RenewalDetails } from "../../forms";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Change renewal | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function EditRenewalPage(props: PageProps<"/renewals/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/renewals/[id]/edit">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_RENEWALS.includes(me.roleCode)) return <CannotSeeRenewals />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("renewals").select("id, title, category, owner_person_id, documents_needed, notes").eq("id", id).maybeSingle();
  if (!data) notFound();
  const r = data as RenewalDetails;
  return (
    <>
      <BackLink href={`/renewals/${r.id}`}>Back to {r.title}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Change Renewal</h1>
      <RenewalForm people={await ownerChoices(supabase, r.owner_person_id)} renewal={r} />
    </>
  );
}
