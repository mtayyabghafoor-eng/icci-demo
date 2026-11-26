// "Lost and withdrawn" (slice P4.5): copies marked lost, which can still be
// found, and copies withdrawn for good. Open a copy to mark it found.
// CSV download for a Super Admin or Centre Admin only.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { mayDownloadLibraryCsv } from "@/lib/library/lists";
import { mayUseLibrary } from "@/lib/library/rules";
import { createClient } from "@/lib/supabase/server";
import { loadCopyList } from "../data";
import { CsvButton, FlaggedList } from "../list-parts";
import { BackLink, CannotSee, Skeleton } from "@/components/ui";
import { DeskTabs } from "../desk-tabs";

export const metadata: Metadata = { title: "Lost and Withdrawn | ICCI Control Dashboard" };

const FLAGGED_ORDER = [
  { column: "status", ascending: true },
  { column: "flagged_on", ascending: false },
  { column: "title", ascending: true },
];

export default function Page() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <DeskTabs />
      <BackLink href="/library">Library</BackLink>
      <h1 className="page-title mt-2 text-[28px] md:text-[34px]">Lost and withdrawn</h1>
      <p className="mt-2">Copies marked lost (they can be found again) and copies withdrawn for good.</p>
      <Suspense fallback={<Skeleton />}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!mayUseLibrary(me.roleCode)) return <CannotSee area="library" />;
  const supabase = await createClient();
  const rows = await loadCopyList(supabase, ["lost", "withdrawn"], FLAGGED_ORDER);
  const lost = rows.filter((r) => r.status === "lost").length;
  return (
    <>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[15px] text-icci-ink-60" data-testid="list-count">
          {rows.length === 0 ? "No copy is lost or withdrawn." : `${lost} lost, ${rows.length - lost} withdrawn`}
        </p>
        {mayDownloadLibraryCsv(me.roleCode) && <CsvButton href="/library/lost/csv" />}
      </div>
      {rows.length > 0 && <FlaggedList rows={rows} />}
    </>
  );
}
