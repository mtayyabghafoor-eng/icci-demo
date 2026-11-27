// D7 (owner, 27 Nov 2026): every PDF in the app reads as a book. A
// document (manual, warranty, service report) turns left to right; one in
// Arabic can be turned right to left with the switch.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BackLink, PageHeader, Skeleton } from "@/components/ui";
import { FlipBook } from "@/components/ui/flip-book";
import { requireAdmin } from "@/lib/auth/current-admin";
import { DOCUMENT_KINDS, type DocumentRow } from "@/lib/documents/rules";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";

export const metadata: Metadata = { title: "Read the document | ICCI Control Dashboard" };

export default function DocumentBookPage(props: PageProps<"/documents/[id]/book">) {
  return (
    <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/documents/[id]/book">["params"]; searchParams: PageProps<"/documents/[id]/book">["searchParams"] }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^\d{1,12}$/.test(id)) notFound();
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("asset_documents").select("id, title, kind, file_path, item_id, model_id").eq("id", Number(id)).eq("hidden", false).maybeSingle();
  const doc = data as Pick<DocumentRow, "id" | "title" | "kind" | "file_path" | "item_id" | "model_id"> | null;
  if (!doc || !doc.file_path.endsWith(".pdf")) notFound();
  const rtl = sp.dir === "rtl";
  const back = doc.item_id ? `/items/${doc.item_id}` : doc.model_id ? `/models/${doc.model_id}` : "/";
  const tab = (on: boolean) =>
    cx(
      "inline-flex min-h-11 items-center rounded-xl px-4 font-semibold no-underline transition-colors duration-150",
      on ? "bg-icci-green-dark text-white!" : "border border-icci-line bg-white text-icci-green-dark! hover:bg-icci-green-50",
    );
  return (
    <>
      <BackLink href={back}>{doc.item_id ? "The item" : "The model"}</BackLink>
      <PageHeader
        title={doc.title}
        subtitle={DOCUMENT_KINDS[doc.kind]}
        actions={
          <nav aria-label="Which way the pages turn" className="flex gap-2">
            <Link href={`/documents/${doc.id}/book`} className={tab(!rtl)} aria-current={!rtl ? "page" : undefined}>
              Left to right
            </Link>
            <Link href={`/documents/${doc.id}/book?dir=rtl`} className={tab(rtl)} aria-current={rtl ? "page" : undefined}>
              Right to left (Arabic)
            </Link>
          </nav>
        }
      />
      <FlipBook key={rtl ? "rtl" : "ltr"} src={`/documents/${doc.id}/pdf`} dir={rtl ? "rtl" : "ltr"} title={doc.title} downloadName={`${doc.title}.pdf`} />
    </>
  );
}
