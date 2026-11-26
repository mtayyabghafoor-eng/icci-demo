// The receipts pack (slice P5.5; docs/PHASE-5.md section 7): every claim
// approved in a month, one per page, with its number, amount and receipt
// pictures, to print or "Save as PDF" for the bookkeeper. A PDF receipt
// cannot be printed inside a page reliably, so it is listed with a link to
// download it on its own. Super Admin, Centre Admin and Finance.
import type { Metadata } from "next";
import { BackLink, Notice, PageHeader, PageShell } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { claimNumber, monthName, monthRange, RECEIPT_BUCKET, receiptFileName, todayInDublin } from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { formatDate, formatEuro } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import { PrintButton } from "../../../categories/call-sheet/print-button";
import { CannotSeeExpenses } from "../../cannot-see";
import { loadMonthExport } from "../data";

export const metadata: Metadata = { title: "Receipts pack | ICCI Control Dashboard" };

export default function ReceiptsPackPage(props: PageProps<"/expenses/export/receipts">) {
  return (
    <PageShell width="wide" loading="Loading the receipts…">
      <Content searchParams={props.searchParams} />
    </PageShell>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/expenses/export/receipts">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSeeExpenses title="Receipts Pack" />;
  const { month: raw } = await searchParams;
  const month = typeof raw === "string" && monthRange(raw) ? raw : todayInDublin().slice(0, 7);
  const supabase = await createClient();
  const { data } = await loadMonthExport(supabase, month);
  const ids = data.claims.map((c) => c.id);
  const files = ids.length
    ? (
        await Promise.all(
          Array.from({ length: Math.ceil(ids.length / 200) }, (_, i) =>
            allRows<{ id: number; claim_id: number; position: number; file_path: string }>((from, to) =>
              supabase.from("expense_files").select("id, claim_id, position, file_path").in("claim_id", ids.slice(i * 200, i * 200 + 200)).order("id").range(from, to),
            ),
          ),
        )
      ).flat()
    : [];
  const url = new Map<string, string>();
  for (let i = 0; i < files.length; i += 100) {
    const paths = files.slice(i, i + 100).map((f) => f.file_path);
    const { data: urls } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 1800);
    (urls ?? []).forEach((u, k) => u.signedUrl && url.set(paths[k], u.signedUrl));
  }

  return (
    <>
      <div className="print:hidden">
        <BackLink href={`/expenses/export?month=${month}`}>Monthly export</BackLink>
        <PageHeader
          title={`Receipts Pack: ${monthName(month)}`}
          subtitle={`${data.claims.length} ${data.claims.length === 1 ? "claim" : "claims"} approved in ${monthName(month)}, one per page.`}
          actions={<PrintButton />}
        />
        <Notice tone="info">To keep a copy as a file, choose “Save as PDF” in the print window.</Notice>
      </div>
      {data.claims.length === 0 && <p className="mt-6">No claims were approved in {monthName(month)}.</p>}
      <ol className="mt-6 space-y-6 print:mt-0 print:space-y-0" data-testid="receipts-pack">
        {data.claims.map((c) => {
          const own = files.filter((f) => f.claim_id === c.id).sort((a, b) => a.position - b.position);
          return (
            <li key={c.id} className="receipt-pack-page rounded-2xl border border-icci-line bg-white p-6 shadow-card print:rounded-none print:border-0 print:p-[12mm] print:shadow-none" data-testid="pack-claim">
              <h2 className="text-2xl font-bold text-icci-green-dark">
                {claimNumber(c.id)} · {formatEuro(c.amount_cents)}
              </h2>
              <p className="mt-1" dir="auto">
                {c.description} · {c.paid_to || "Paid to not recorded"}
              </p>
              <p className="text-sm">
                Receipt date {formatDate(c.receipt_date)} · approved {formatDate(c.approved_on)} · {c.category} · {c.fund}
              </p>
              {c.receipt === "Lost" ? (
                <p className="mt-4 font-semibold">No receipt: it was lost (see the claim for why).</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {own.map((f) =>
                    f.file_path.endsWith(".pdf") ? (
                      <p key={f.id}>
                        PDF receipt: <a href={url.get(f.file_path)}>{receiptFileName(c.id, f.position, f.file_path)}</a> (download and print on its own)
                      </p>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link
                      <img key={f.id} src={url.get(f.file_path)} alt={`${claimNumber(c.id)} receipt ${f.position}`} className="max-h-[220mm] max-w-full object-contain" />
                    ),
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
