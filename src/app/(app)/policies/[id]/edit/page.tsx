// Change a policy's title or owner (slice P2.5). Who must sign it is changed
// on the policy page itself.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { ownerChoices } from "../../data";
import { PolicyForm } from "../../forms";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";
import { UUID } from "@/lib/forms";

export const metadata: Metadata = { title: "Change policy | ICCI Control Dashboard" };

export default function EditPolicyPage(props: PageProps<"/policies/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/policies/[id]/edit">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSee area="policies" />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.from("policies").select("id, title, owner_person_id").eq("id", id).maybeSingle();
  if (!data) notFound();
  const policy = data as { id: string; title: string; owner_person_id: string };
  return (
    <>
      <BackLink href={`/policies/${policy.id}`}>Back to {policy.title}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Change Policy</h1>
      <PolicyForm people={await ownerChoices(supabase, policy.owner_person_id)} policy={policy} />
    </>
  );
}
