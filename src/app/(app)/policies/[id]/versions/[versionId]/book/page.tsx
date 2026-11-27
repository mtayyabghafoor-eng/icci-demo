// D7 (owner, 27 Nov 2026): a policy version read as a book. English turns
// from left to right; the Arabic PDF (if the version has one) from right to
// left. The PDF comes from this website (../pdf), never from outside.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, CannotSee, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { FlipBook } from "@/components/ui/flip-book";
import { requireAdmin } from "@/lib/auth/current-admin";
import { UUID } from "@/lib/forms";
import { MAY_SEE_POLICIES } from "@/lib/policies/rules";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";

export const metadata: Metadata = { title: "Read the policy | ICCI Control Dashboard" };

export default function PolicyBookPage(props: PageProps<"/policies/[id]/versions/[versionId]/book">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/policies/[id]/versions/[versionId]/book">["params"];
  searchParams: PageProps<"/policies/[id]/versions/[versionId]/book">["searchParams"];
}) {
  const me = await requireAdmin();
  if (!MAY_SEE_POLICIES.includes(me.roleCode)) return <CannotSee area="policies" />;
  const { id, versionId } = await params;
  if (!UUID.test(id) || !UUID.test(versionId)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: policy }, { data: version }] = await Promise.all([
    supabase.from("policies").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("policy_versions").select("id, version_label, status, file_path_ar").eq("id", versionId).eq("policy_id", id).maybeSingle(),
  ]);
  if (!policy || !version) notFound();
  const arabic = sp.lang === "ar" && !!version.file_path_ar;
  const tab = (on: boolean) =>
    cx(
      "inline-flex min-h-11 items-center rounded-xl px-4 font-semibold no-underline transition-colors duration-150",
      on ? "bg-icci-green-dark text-white!" : "border border-icci-line bg-white text-icci-green-dark! hover:bg-icci-green-50",
    );
  const base = `/policies/${id}/versions/${versionId}`;
  return (
    <>
      <BackLink href={`/policies/${id}`}>{policy.title}</BackLink>
      <PageHeader
        title={policy.title}
        subtitle={`Version ${version.version_label}`}
        status={version.status === "draft" ? <StatusBadge word="Draft: not published yet" tone="amber" /> : undefined}
        actions={
          version.file_path_ar ? (
            <nav aria-label="Language" className="flex gap-2" data-testid="book-languages">
              <Link href={`${base}/book`} className={tab(!arabic)} aria-current={!arabic ? "page" : undefined}>
                English
              </Link>
              <Link href={`${base}/book?lang=ar`} className={tab(arabic)} aria-current={arabic ? "page" : undefined} lang="ar" dir="rtl">
                العربية
              </Link>
            </nav>
          ) : undefined
        }
      />
      <FlipBook
        key={arabic ? "ar" : "en"}
        src={`${base}/pdf${arabic ? "?lang=ar" : ""}`}
        dir={arabic ? "rtl" : "ltr"}
        title={arabic ? `${policy.title}, in Arabic` : policy.title}
        downloadName={`${policy.title} ${version.version_label}${arabic ? " (Arabic)" : ""}.pdf`}
      />
    </>
  );
}
