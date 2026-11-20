// Change a draft version (slice P2.5): its name, dates or PDF. A published
// version can never be changed; upload a new version instead. Whoever
// changes a draft cannot then publish it.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeePolicies } from "../../../cannot-see";
import { VersionForm } from "../../../forms";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Change draft | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const note = "mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3";

export default function ChangeDraftPage(props: PageProps<"/policies/[id]/versions/[versionId]">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/policies/[id]/versions/[versionId]">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSeePolicies />;
  const { id, versionId } = await params;
  if (!UUID.test(id) || !UUID.test(versionId)) notFound();
  const supabase = await createClient();
  const [{ data: policy }, { data: version }] = await Promise.all([
    supabase.from("policies").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("policy_versions")
      .select("id, version_label, approved_on, next_review_on, status")
      .eq("id", versionId)
      .eq("policy_id", id)
      .maybeSingle(),
  ]);
  if (!policy || !version) notFound();
  const v = version as { id: string; version_label: string; approved_on: string; next_review_on: string; status: string };
  return (
    <>
      <BackLink href={`/policies/${policy.id}`}>Back to {policy.title}</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Change Draft</h1>
      <p className="mt-1 font-semibold" dir="auto">
        {policy.title}, {v.version_label}
      </p>
      {v.status !== "draft" ? (
        <p className={note} data-testid="published-locked">
          This version is published and can never be changed. Upload a new version instead.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">After you change it, a different admin must publish it.</p>
          <VersionForm policyId={policy.id} today={todayInDublin()} draft={v} />
        </>
      )}
    </>
  );
}
