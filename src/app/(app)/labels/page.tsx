// Print labels: create the next N label numbers and print them on A4 sheets,
// or print an earlier sheet again (same numbers, nothing new created).
// Designed for a PC first.
import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { formatDateTime } from "@/lib/items/rules";
import { serialOf } from "@/lib/labels/sheet";
import { createClient } from "@/lib/supabase/server";
import { adminNames } from "../stock/data";
import { PrintAgainButton, PrintLabelsForm } from "./forms";

export const metadata: Metadata = { title: "Print labels | ICCI Control Dashboard" };

type Run = {
  id: number;
  first_number: number;
  last_number: number;
  label_count: number;
  reprint_of: number | null;
  created_by: string | null;
  created_at: string;
};

export default function PrintLabelsPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <h1 className="page-title text-[28px] md:text-[34px]">Print Labels</h1>
      <p className="mt-2">
        Prints QR labels on A4 sheets of 21 (63.5 × 38.1 mm, the Avery L7160 size). Each code holds only a link with
        the label number.
      </p>
      <Suspense fallback={<p className="mt-4">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

const MAY_PRINT = ["super_admin", "centre_admin"];

async function Content() {
  const me = await requireAdmin();
  if (!MAY_PRINT.includes(me.roleCode)) {
    // The database refuses anyway; this just says so plainly.
    return (
      <p className="mt-4 rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3" data-testid="cannot-print">
        Your account cannot print labels. Only a Super Admin or Centre Admin can.
      </p>
    );
  }
  const supabase = await createClient();
  const [highest, runs, nameOf] = await Promise.all([
    supabase.from("labels").select("serial").order("serial", { ascending: false }).limit(1).maybeSingle(),
    supabase
      .from("label_print_runs")
      .select("id, first_number, last_number, label_count, reprint_of, created_by, created_at")
      .order("id", { ascending: false })
      .limit(20),
    adminNames(supabase),
  ]);
  const nextSerial = serialOf((highest.data ? Number(highest.data.serial.slice(5)) : 0) + 1);
  const list = (runs.data ?? []) as Run[];

  return (
    <>
      <PrintLabelsForm nextSerial={nextSerial} />

      <h2 className="mt-8 text-xl font-semibold text-icci-green-dark">Sheets printed before</h2>
      <p className="mt-1 text-sm">
        Use <strong>Print again</strong> if a sheet jammed or was spoiled. It prints the same numbers; no new labels are
        made. The latest 20 are shown.
      </p>
      {list.length === 0 ? (
        <p className="mt-3">No sheets printed yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-icci-line rounded-2xl border border-icci-line bg-white shadow-card" data-testid="print-runs">
          {list.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <div className="min-w-52 flex-1">
                <p className="font-semibold">
                  {serialOf(r.first_number)}
                  {r.label_count > 1 && <> to {serialOf(r.last_number)}</>}
                </p>
                <p className="text-sm">
                  {r.label_count} {r.label_count === 1 ? "label" : "labels"} · Sheet {r.id}
                  {r.reprint_of && <> · reprint of sheet {r.reprint_of}</>}
                </p>
              </div>
              <p className="min-w-44 text-sm">
                {nameOf(r.created_by)}
                <br />
                {formatDateTime(r.created_at)}
              </p>
              <PrintAgainButton runId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
