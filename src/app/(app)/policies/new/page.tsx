// Add a policy (slice P2.5): title, owner from the people directory, and
// which person roles must sign it. Versions are uploaded on the policy page.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { CannotSeePolicies } from "../cannot-see";
import { ownerChoices, roleChoices } from "../data";
import { PolicyForm } from "../forms";
import { BackLink } from "@/components/ui";

export const metadata: Metadata = { title: "Add a policy | ICCI Control Dashboard" };

export default function NewPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <BackLink href="/policies">Policies</BackLink>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">Add a Policy</h1>
      <p className="mt-1">After adding it, upload the first version as a PDF.</p>
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSeePolicies />;
  const supabase = await createClient();
  const [people, roles] = await Promise.all([ownerChoices(supabase), roleChoices(supabase)]);
  return <PolicyForm people={people} roles={roles} />;
}
