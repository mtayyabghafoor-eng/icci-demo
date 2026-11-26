// One claim or correction (slices P5.2 to P5.4): the receipt beside the
// details and the buttons, so an approver sees what they approve. Approve,
// second approval, reject, withdraw, "Enter again", "Correct this claim",
// its corrections, its repayments and its full history.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { BackLink, CannotSee, Card, CardTitle, FactGrid, LinkButton, Notice, PageHeader, PageShell, StatusPill, Timeline, type TimelineEntry } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  claimNumber,
  mayDecide,
  METHOD_LABEL,
  PAYMENT_SHORT,
  RECEIPT_BUCKET,
  receiptFileName,
  STATE_LABEL,
  type ClaimRow,
  type EntryRow,
  type RepayMethod,
} from "@/lib/expenses/claims";
import { MAY_HANDLE_EXPENSES } from "@/lib/expenses/rules";
import { formatDate, formatDateTime, formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { loadExpenseNames, paidByText, paidToText } from "../data";
import { ApproveForm, ReasonForm, WithdrawRepaymentForm } from "../forms";

export const metadata: Metadata = { title: "Expense claim | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  entered: "Claim saved. It now waits for another admin to approve it.",
  approved: "Approved.",
  second_approved: "Second approval given. The claim is approved.",
  rejected: "Rejected. Whoever entered it can see why.",
  withdrawn: "Withdrawn. You can enter it again with the right details.",
  "correction-entered": "Correction saved. It now waits for another admin to approve it.",
  "repayment-withdrawn": "Repayment withdrawn. The claims it covered are awaiting repayment again.",
};

export default function ClaimPage(props: PageProps<"/expenses/[id]">) {
  return (
    <PageShell width="wide" loading="Loading claim…">
      <Content params={props.params} searchParams={props.searchParams} />
    </PageShell>
  );
}

type Repayment = {
  id: number;
  person_id: string;
  paid_on: string;
  method: RepayMethod;
  reference: string | null;
  withdrawn_reason: string | null;
  withdrawn_at: string | null;
  withdrawn_by: string | null;
  created_by: string | null;
  created_at: string;
};

async function Content(props: { params: PageProps<"/expenses/[id]">["params"]; searchParams: PageProps<"/expenses/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) return <CannotSee area="expenses" title="Expense Claim" />;
  const { id } = await props.params;
  const { done } = await props.searchParams;
  if (!/^\d{1,12}$/.test(id)) notFound();

  const supabase = await createClient();
  const { data } = await supabase.from("expense_entries").select("*").eq("id", Number(id)).maybeSingle();
  if (!data) notFound();
  const entry = data as EntryRow;
  const claimId = entry.kind === "claim" ? entry.id : entry.corrects_id!;

  const [names, claimRes, correctionsRes, filesRes, copyRes, linksRes, link] = await Promise.all([
    loadExpenseNames(supabase),
    supabase.from("expense_claim_list").select("*").eq("id", claimId).single(),
    supabase.from("expense_entries").select("*").eq("corrects_id", claimId).order("id"),
    supabase.from("expense_files").select("id, position, file_path").eq("claim_id", claimId).order("position"),
    supabase.from("expense_claims").select("id").eq("copied_from_id", claimId).maybeSingle(),
    supabase.from("expense_repayment_claims").select("repayment_id, amount_cents").eq("claim_id", claimId).order("id"),
    supabase.rpc("my_expense_link"),
  ]);
  const claim = claimRes.data as ClaimRow;
  const corrections = (correctionsRes.data ?? []) as EntryRow[];
  const files = (filesRes.data ?? []) as { id: number; position: number; file_path: string }[];
  const links = (linksRes.data ?? []) as { repayment_id: number; amount_cents: number }[];
  const linked = Boolean((link.data as { linked: boolean }[] | null)?.[0]?.linked);
  const repayIds = [...new Set(links.map((l) => l.repayment_id))];
  const repayments = repayIds.length
    ? (((await supabase.from("expense_repayments").select("*").in("id", repayIds).order("id")).data ?? []) as Repayment[])
    : [];

  // Receipt pictures shown in the page; every file can be opened or saved with a clear name.
  const shown = new Map<string, string>();
  const saved = new Map<string, string>();
  if (files.length) {
    const paths = files.map((f) => f.file_path);
    const { data: urls } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrls(paths, 600);
    (urls ?? []).forEach((u, i) => u.signedUrl && shown.set(paths[i], u.signedUrl));
    for (const f of files) {
      const { data: d } = await supabase.storage.from(RECEIPT_BUCKET).createSignedUrl(f.file_path, 600, { download: receiptFileName(claimId, f.position, f.file_path) });
      if (d?.signedUrl) saved.set(f.file_path, d.signedUrl);
    }
  }

  const isCorrection = entry.kind === "correction";
  const payerIsMe = Boolean(entry.paid_by_person_id && names.me?.id === entry.paid_by_person_id);
  const decide = mayDecide(me.id, linked, entry, payerIsMe, isCorrection ? claim.created_by : null);
  // Whoever entered the claim, or an approved correction of it, never records
  // or withdraws its repayment (migration 0053).
  const enteredByMe = claim.created_by === me.id || corrections.some((c) => c.state === "approved" && c.created_by === me.id);
  const waitingCorrection = corrections.find((c) => c.state === "waiting" || c.state === "second");
  const label = STATE_LABEL[entry.state];
  const title = isCorrection ? `Correction ${claimNumber(entry.id)}` : claimNumber(entry.id);
  const fund = (fid: string | null) => (fid ? (names.fundName.get(fid) ?? "A fund") : "Not chosen yet");
  const amountText = `${formatEuro(entry.amount_cents)} for “${entry.description}”`;

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: isCorrection ? "Right amount" : "Amount",
      value: (
        <span data-testid="claim-amount">
          <span className="text-xl font-bold tabular-nums">{formatEuro(isCorrection ? entry.amount_cents : claim.current_amount_cents)}</span>
          {!isCorrection && claim.correction_id && <span className="block text-sm text-icci-ink-60">Corrected; first entered as {formatEuro(claim.amount_cents)}</span>}
        </span>
      ),
    },
    { label: "VAT", value: (isCorrection ? entry.vat_cents : claim.current_vat_cents) == null ? "Not recorded" : formatEuro(isCorrection ? entry.vat_cents : claim.current_vat_cents) },
    { label: "Date on the receipt", value: formatDate(isCorrection ? entry.receipt_date : claim.current_receipt_date) },
    { label: "Spend category", value: names.categoryName.get(isCorrection ? entry.category_id : claim.current_category_id) ?? "A category" },
    { label: "What it was for", value: <span dir="auto">{entry.description}</span> },
    { label: "Paid to", value: <span dir="auto">{paidToText(entry, names) || "Not recorded"}</span> },
    { label: "How it was paid", value: PAYMENT_SHORT[entry.payment] },
    { label: "Who paid", value: <span dir="auto">{paidByText(entry, names)}</span> },
    {
      label: entry.state === "approved" ? "Fund" : "Suggested fund",
      value: entry.state === "approved" ? fund(isCorrection ? entry.fund_id : claim.current_fund_id) : entry.suggested_fund_id ? fund(entry.suggested_fund_id) : "None; the approver chooses",
    },
    {
      label: "Maintenance ticket",
      value: entry.ticket_id ? (
        me.roleCode === "finance" ? (
          `T-${String(entry.ticket_id).padStart(4, "0")}`
        ) : (
          <Link href={`/tickets/${entry.ticket_id}`}>T-{String(entry.ticket_id).padStart(4, "0")}</Link>
        )
      ) : (
        "None"
      ),
    },
    { label: "Entered by", value: `${names.accountName(entry.created_by)}, ${formatDateTime(entry.created_at)}` },
  ];
  if (isCorrection) facts.unshift({ label: "Corrects", value: <Link href={`/expenses/${claimId}`}>{claimNumber(claimId)}</Link> });
  if (isCorrection && entry.correction_reason) facts.push({ label: "Why it is corrected", value: <span dir="auto">{entry.correction_reason}</span> });
  if (!isCorrection && claim.copied_from_id) facts.push({ label: "Entered again from", value: <Link href={`/expenses/${claim.copied_from_id}`}>{claimNumber(claim.copied_from_id)}</Link> });
  if (!isCorrection && copyRes.data) facts.push({ label: "Entered again as", value: <Link href={`/expenses/${copyRes.data.id}`}>{claimNumber(copyRes.data.id)}</Link> });
  if (!isCorrection && claim.payment === "personal" && claim.state === "approved") {
    facts.push({
      label: "Paid back",
      value: (
        <span data-testid="claim-owed">
          {claim.owed_cents > 0
            ? `${formatEuro(claim.owed_cents)} still owed${claim.repaid_cents ? ` (${formatEuro(claim.repaid_cents)} paid back)` : ""}`
            : claim.owed_cents < 0
              ? `Paid too much: ${formatEuro(-claim.owed_cents)} to get back (${formatEuro(claim.repaid_cents)} paid back)`
              : `Yes, ${formatEuro(claim.repaid_cents)}`}
        </span>
      ),
    });
  }

  // The history, oldest first.
  const history: (TimelineEntry & { at: string })[] = [
    { key: "entered", at: entry.created_at, when: formatDateTime(entry.created_at), title: `Entered by ${names.accountName(entry.created_by)}`, tone: "grey" },
  ];
  if (entry.first_at) {
    history.push({
      key: "first",
      at: entry.first_at,
      when: formatDateTime(entry.first_at),
      title: `${entry.needs_second ? "First approval" : "Approved"} by ${names.accountName(entry.first_by)}, from ${fund(entry.first_fund_id)}`,
      detail: entry.needs_second ? "Needs a second approver." : undefined,
      tone: entry.needs_second ? "amber" : "green",
    });
  }
  if (entry.second_at) {
    history.push({
      key: "second",
      at: entry.second_at,
      when: formatDateTime(entry.second_at),
      title: `Second approval by ${names.accountName(entry.second_by)}${entry.second_fund_id && entry.second_fund_id !== entry.first_fund_id ? `, fund changed to ${fund(entry.second_fund_id)}` : ""}`,
      tone: "green",
    });
  }
  if (entry.closed_at) {
    history.push({
      key: "closed",
      at: entry.closed_at,
      when: formatDateTime(entry.closed_at),
      title: `${entry.state === "withdrawn" ? "Withdrawn" : "Rejected"} by ${names.accountName(entry.closed_by)}`,
      detail: <span dir="auto">{entry.closed_note}</span>,
      tone: entry.state === "withdrawn" ? "grey" : "red",
    });
  }
  if (!isCorrection) {
    for (const c of corrections) {
      history.push({
        key: `c${c.id}`,
        at: c.created_at,
        when: formatDateTime(c.created_at),
        title: (
          <>
            <Link href={`/expenses/${c.id}`}>Correction {claimNumber(c.id)}</Link> to {formatEuro(c.amount_cents)}: {STATE_LABEL[c.state].word.toLowerCase()}
          </>
        ),
        detail: <span dir="auto">{c.correction_reason}</span>,
        tone: STATE_LABEL[c.state].tone,
      });
    }
    for (const r of repayments) {
      const amount = links.filter((l) => l.repayment_id === r.id).reduce((n, l) => n + l.amount_cents, 0);
      history.push({
        key: `r${r.id}`,
        at: r.created_at,
        when: formatDateTime(r.created_at),
        title: `Paid back ${formatEuro(amount)} on ${formatDate(r.paid_on)} (${METHOD_LABEL[r.method]})`,
        detail: `Recorded by ${names.accountName(r.created_by)}${r.reference ? `, reference ${r.reference}` : ""}`,
        tone: "green",
      });
      if (r.withdrawn_at) {
        history.push({
          key: `rw${r.id}`,
          at: r.withdrawn_at,
          when: formatDateTime(r.withdrawn_at),
          title: `That repayment was withdrawn by ${names.accountName(r.withdrawn_by)}`,
          detail: <span dir="auto">{r.withdrawn_reason}</span>,
          tone: "grey",
        });
      }
    }
  }
  history.sort((a, b) => a.at.localeCompare(b.at));

  return (
    <>
      <BackLink href={entry.state === "waiting" || entry.state === "second" ? "/expenses" : "/expenses?tab=all"}>Expenses</BackLink>
      <PageHeader
        title={title}
        subtitle={<span dir="auto">{entry.description}</span>}
        status={
          <span className="flex flex-wrap gap-2" data-testid="claim-status">
            <StatusPill tone={label.tone}>{label.word}</StatusPill>
            {entry.receipt_lost_reason && <StatusPill tone="amber">No receipt</StatusPill>}
            {!isCorrection && claim.correction_id && <StatusPill tone="grey">Corrected</StatusPill>}
            {!isCorrection && claim.owed_cents > 0 && <StatusPill tone="amber">Awaiting repayment</StatusPill>}
          </span>
        }
      />
      {typeof done === "string" && DONE[done] && (
        <Notice tone="success" floating testId="notice">
          {DONE[done]}
        </Notice>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card>
          <CardTitle>Receipt</CardTitle>
          {entry.receipt_lost_reason ? (
            <Notice tone="warning" title="No receipt" testId="receipt-lost-note">
              <span dir="auto">{entry.receipt_lost_reason}</span>
            </Notice>
          ) : files.length === 0 ? (
            <p>No receipt file.</p>
          ) : (
            <ul className="space-y-4" data-testid="receipt-files">
              {files.map((f) => {
                const pdf = f.file_path.endsWith(".pdf");
                const name = receiptFileName(claimId, f.position, f.file_path);
                return (
                  <li key={f.id}>
                    {!pdf && shown.get(f.file_path) && (
                      <a href={shown.get(f.file_path)} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a private, short-lived link */}
                        <img src={shown.get(f.file_path)} alt={`Receipt ${f.position}`} className="max-h-[32rem] w-full rounded-xl border border-icci-line object-contain" />
                      </a>
                    )}
                    <p className="mt-1 flex flex-wrap gap-x-4 text-sm">
                      {pdf && shown.get(f.file_path) && (
                        <a href={shown.get(f.file_path)} target="_blank" rel="noreferrer" className="font-semibold">
                          Open the PDF receipt
                        </a>
                      )}
                      {saved.get(f.file_path) && <a href={saved.get(f.file_path)}>Download {name}</a>}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          {(entry.state === "waiting" || entry.state === "second") && (
            <Card>
              <CardTitle>{entry.state === "second" ? "Second approval" : "Decide"}</CardTitle>
              {decide.ok ? (
                <div className="space-y-5" data-testid="decide">
                  <ApproveForm
                    claimId={entry.id}
                    kind={entry.state === "second" ? "second_approved" : "approved"}
                    funds={names.funds.filter((f) => f.active)}
                    suggestedFund={entry.state === "second" ? null : entry.suggested_fund_id}
                    amountText={amountText}
                  />
                  <details>
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-error">Reject this claim</summary>
                    <div className="pt-2">
                      <ReasonForm claimId={entry.id} kind="rejected" />
                    </div>
                  </details>
                </div>
              ) : (
                <p data-testid="cannot-decide">{decide.why}</p>
              )}
              {entry.state === "second" && <p className="mt-3 text-sm text-icci-ink-60">First approval by {names.accountName(entry.first_by)}.</p>}
              {entry.state === "waiting" && entry.created_by === me.id && (
                <details className="mt-4 border-t border-icci-panel pt-3">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Something wrong? Withdraw it</summary>
                  <div className="pt-2">
                    <ReasonForm claimId={entry.id} kind="withdrawn" />
                  </div>
                </details>
              )}
            </Card>
          )}

          <Card>
            <CardTitle>Details</CardTitle>
            <FactGrid facts={facts} />
          </Card>

          {!isCorrection && (entry.state === "withdrawn" || entry.state === "rejected") && !copyRes.data && (
            <Card tone="panel">
              <p className="mb-3">Put right what was wrong in a new claim. Everything is copied across, the receipt too.</p>
              <LinkButton href={`/expenses/new?again=${entry.id}`}>Enter again</LinkButton>
            </Card>
          )}

          {!isCorrection && entry.state === "approved" && (
            <Card tone="panel">
              {waitingCorrection ? (
                <p>
                  A correction is waiting for a decision: <Link href={`/expenses/${waitingCorrection.id}`}>{claimNumber(waitingCorrection.id)}</Link>.
                </p>
              ) : (
                <>
                  <p className="mb-3">An approved claim never changes. If the amount, date, category or fund is wrong, send a correction for approval.</p>
                  <LinkButton href={`/expenses/${entry.id}/correct`} kind="outline">
                    Correct this claim
                  </LinkButton>
                </>
              )}
            </Card>
          )}

          {!isCorrection && repayments.some((r) => !r.withdrawn_at) && (
            <Card>
              <CardTitle>Repayments</CardTitle>
              <ul className="space-y-3" data-testid="claim-repayments">
                {repayments
                  .filter((r) => !r.withdrawn_at)
                  .map((r) => (
                    <li key={r.id}>
                      <p>
                        {formatDate(r.paid_on)}, {METHOD_LABEL[r.method]}
                        {r.reference ? `, reference ${r.reference}` : ""}, to <span dir="auto">{names.personName(r.person_id)}</span>
                      </p>
                      {names.me?.id !== r.person_id && !enteredByMe && <WithdrawRepaymentForm repaymentId={r.id} claimId={claimId} />}
                      {names.me?.id !== r.person_id && enteredByMe && (
                        <p className="text-sm text-icci-ink-60">You entered this claim, so if this repayment is wrong another admin withdraws it.</p>
                      )}
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle>History</CardTitle>
            <Timeline entries={history} />
          </Card>
        </div>
      </div>
    </>
  );
}
