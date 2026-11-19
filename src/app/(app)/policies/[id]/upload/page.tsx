// Upload a new version of a policy (slice P2.5): name, approval date, next
// review date (suggested as one year later) and the PDF. It is saved as a
// draft; a different admin publishes it. One draft at a time.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeePolicies } from "../../cannot-see";
import { VersionForm } from "../../forms";

export const metadata: Metadata = { title: "Upload a new version | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const note = "mt-4 rounded-xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3";

export default function UploadVersionPage(props: PageProps<"/policies/[id]/upload">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/policies/[id]/upload">["params"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSeePolicies />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const [{ data }, { data: drafts }] = await Promise.all([
    supabase.from("policies").select("id, title, active").eq("id", id).maybeSingle(),
    supabase.from("policy_versions").select("id").eq("policy_id", id).eq("status", "draft"),
  ]);
  if (!data) notFound();
  const policy = data as { id: string; title: string; active: boolean };
  const draft = (drafts ?? [])[0] as { id: string } | undefined;
  return (
    <>
      <p className="text-sm">
        <Link className="back-link" href={`/policies/${policy.id}`}>← Back to {policy.title}</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Upload a New Version</h1>
      <p className="mt-1 font-semibold" dir="auto">
        {policy.title}
      </p>
      {!policy.active ? (
        <p className={note} data-testid="switched-off">
          This policy is switched off. Switch it back on to upload a version.
        </p>
      ) : draft ? (
        <p className={note} data-testid="draft-waiting">
          This policy already has a draft. <Link href={`/policies/${policy.id}/versions/${draft.id}`}>Change that draft</Link> instead.
        </p>
      ) : (
        <VersionForm policyId={policy.id} today={todayInDublin()} />
      )}
    </>
  );
}
