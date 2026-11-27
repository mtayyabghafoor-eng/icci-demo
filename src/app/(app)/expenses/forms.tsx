"use client";
// The expense forms (slices P5.2 to P5.4): a new claim (one form in three
// numbered parts: on a phone they read as three short steps), approve,
// second approval, reject, withdraw, correct, and paying people back.
// Warnings never block; the database has the final word on every rule.
import { startTransition, useActionState, useMemo, useRef, useState, type FormEvent } from "react";
import { FormError } from "@/app/sign-in/ui";
import { buttonClass, ConfirmSubmit, Input, Notice, Select, Textarea, SaveBar } from "@/components/ui";
import { claimNumber, METHOD_LABEL, PAYMENT_LABEL, type Payment } from "@/lib/expenses/claims";
import { formatEuro, parseEuro } from "@/lib/items/rules";
import { correctClaim, decideClaim, enterClaim, recordRepayment, withdrawRepayment, type ClaimFormState } from "./actions";
import { ReceiptInput } from "./receipt-input";

const none: ClaimFormState = { error: null };
type Option = { id: string; name: string };
type PersonOption = { id: string; full_name: string; has_account: boolean; is_me: boolean };

const legend = "flex items-center gap-2 text-lg font-bold text-icci-green-dark";
const step = "inline-flex h-7 w-7 items-center justify-center rounded-full bg-icci-green-dark text-sm text-white";
const label = "block font-semibold";
const help = "mt-1 block text-sm text-icci-ink-60";

export type ClaimStart = {
  amount?: string;
  receipt_date?: string;
  category?: string;
  description?: string;
  vat?: string;
  paid_to_company?: string;
  paid_to_text?: string;
  ticket?: string;
  suggested_fund?: string;
  payment?: Payment;
  paid_by?: string;
  lost_reason?: string;
};

export function ClaimForm({
  categories,
  funds,
  people,
  companies,
  tickets,
  today,
  start = {},
  copiedFrom = null,
  keptFiles = 0,
  secondAboveCents,
}: {
  categories: Option[];
  funds: (Option & { restricted: boolean })[];
  people: PersonOption[];
  companies: Option[];
  tickets: { id: number; label: string }[];
  today: string;
  start?: ClaimStart;
  /** "Enter again": the claim this copies, and how many receipt files it had. */
  copiedFrom?: number | null;
  keptFiles?: number;
  secondAboveCents: number;
}) {
  const [state, send, pending] = useActionState(enterClaim.bind(null, copiedFrom), none);
  const files = useRef<File[]>([]);
  const [fileCount, setFileCount] = useState(0);
  const [keep, setKeep] = useState(keptFiles > 0);
  const me = people.find((p) => p.is_me) ?? null;
  const [payment, setPayment] = useState<Payment>(start.payment ?? "personal");
  const [paidBy, setPaidBy] = useState(start.paid_by ?? me?.id ?? "");
  const [lost, setLost] = useState(Boolean(start.lost_reason));
  const [amount, setAmount] = useState(start.amount ?? "");
  const [company, setCompany] = useState(start.paid_to_company ?? "");
  const confirmDuplicate = useRef(false);
  const then = useRef<string>("");

  const payer = people.find((p) => p.id === paidBy) ?? null;
  const cents = parseEuro(amount) ?? 0;
  // A warning, never a block (docs/PHASE-5.md section 6).
  const payerNote = useMemo(() => {
    if (payment === "centre_direct" || !payer) return null;
    if (payer.is_me) return "You paid, so another admin approves this claim. That is normal.";
    if (payer.has_account && cents > secondAboveCents) {
      return `You entered it and ${payer.full_name} paid, so neither of you can approve it, and it needs two approvers. It is quicker if ${payer.full_name} enters it.`;
    }
    if (payer.has_account) return `${payer.full_name} paid, so they cannot approve this claim. Neither can you, as you entered it.`;
    return null;
  }, [payment, payer, cents, secondAboveCents]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    data.delete("receipt");
    if (!lost) for (const f of files.current) data.append("receipt", f);
    if (confirmDuplicate.current) data.set("confirm_duplicate", "yes");
    if (then.current) data.set("then", then.current);
    if (keep && !files.current.length) data.set("keep_files", "yes");
    confirmDuplicate.current = false;
    startTransition(() => send(data));
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="New expense claim" data-testid="claim-form">
      {/* 1. The receipt */}
      <fieldset className="space-y-3 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
        <legend className="sr-only">The receipt</legend>
        <h2 className={legend}>
          <span className={step}>1</span> The receipt
        </h2>
        {!lost && (
          <>
            {keptFiles > 0 && copiedFrom && (
              <label className="flex min-h-11 items-center gap-3">
                <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-5 w-5 accent-icci-green-dark" data-testid="keep-files" />
                <span>
                  Keep the {keptFiles === 1 ? "receipt file" : `${keptFiles} receipt files`} from {claimNumber(copiedFrom)}
                  <span className={help}>Untick to add different files instead. New files replace them.</span>
                </span>
              </label>
            )}
            <ReceiptInput
              onChange={(f) => {
                files.current = f;
                setFileCount(f.length);
              }}
            />
            <p className="text-sm text-icci-ink-60">
              A supplier&apos;s own bank details on an invoice, and the last four digits of a card, are fine. Never photograph a bank statement, a card, or
              anyone&apos;s personal bank details.
            </p>
          </>
        )}
        <label className="flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            name="receipt_lost"
            value="yes"
            checked={lost}
            onChange={(e) => setLost(e.target.checked)}
            className="h-5 w-5 accent-icci-green-dark"
            data-testid="receipt-lost"
          />
          <span className="font-semibold">Receipt lost</span>
        </label>
        {lost && (
          <label className="block">
            <span className={label}>Why is there no receipt?</span>
            <Textarea name="lost_reason" required maxLength={500} defaultValue={start.lost_reason} dir="auto" className="mt-1" />
            <span className={help}>Claims without a receipt are marked “No receipt” and counted on the Board report.</span>
          </label>
        )}
        {fileCount > 0 && lost && <p className="text-sm">The files you chose are not sent while “Receipt lost” is ticked.</p>}
      </fieldset>

      {/* 2. What was bought */}
      <fieldset className="space-y-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
        <legend className="sr-only">What was bought</legend>
        <h2 className={legend}>
          <span className={step}>2</span> What was bought
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Amount on the receipt (€)</span>
            <Input name="amount" required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1" placeholder="45.00" />
          </label>
          <label className="block">
            <span className={label}>Date on the receipt</span>
            <Input name="receipt_date" type="date" required max={today} defaultValue={start.receipt_date ?? today} className="mt-1" />
          </label>
        </div>
        <label className="block">
          <span className={label}>What was it for?</span>
          <Input name="description" required maxLength={500} defaultValue={start.description} dir="auto" className="mt-1" placeholder="Bin bags for Friday prayers" />
        </label>
        <label className="block">
          <span className={label}>Spend category</span>
          <Select name="category" required defaultValue={start.category ?? ""} className="mt-1">
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <details className="rounded-xl border border-icci-line px-4 py-2" open={Boolean(start.vat || start.paid_to_company || start.paid_to_text || start.ticket || start.suggested_fund)}>
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">More details (optional): VAT, paid to, ticket, fund</summary>
          <div className="space-y-4 pb-3 pt-2">
            <label className="block">
              <span className={label}>
                VAT on the receipt (€) <span className="font-normal text-icci-ink-60">(optional)</span>
              </span>
              <Input name="vat" inputMode="decimal" defaultValue={start.vat} className="mt-1 sm:max-w-48" />
              <span className={help}>The Centre may claim part of the VAT back through Revenue, so it helps to record it.</span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className={label}>
                  Paid to a company <span className="font-normal text-icci-ink-60">(optional)</span>
                </span>
                <Select name="paid_to_company" value={company} onChange={(e) => setCompany(e.target.value)} className="mt-1">
                  <option value="">Not in the list</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </label>
              {!company && (
                <label className="block">
                  <span className={label}>
                    Or type the shop or company <span className="font-normal text-icci-ink-60">(optional)</span>
                  </span>
                  <Input name="paid_to_text" maxLength={200} defaultValue={start.paid_to_text} dir="auto" className="mt-1" />
                </label>
              )}
            </div>
            <label className="block">
              <span className={label}>
                For a maintenance ticket <span className="font-normal text-icci-ink-60">(optional)</span>
              </span>
              <Select name="ticket" defaultValue={start.ticket ?? ""} className="mt-1">
                <option value="">No ticket</option>
                {tickets.map((t) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className={label}>
                Suggested fund <span className="font-normal text-icci-ink-60">(optional)</span>
              </span>
              <Select name="suggested_fund" defaultValue={start.suggested_fund ?? ""} className="mt-1">
                <option value="">Let the approver choose</option>
                {funds.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.restricted ? " (restricted)" : ""}
                  </option>
                ))}
              </Select>
              <span className={help}>The approver confirms or changes it.</span>
            </label>
          </div>
        </details>
      </fieldset>

      {/* 3. How it was paid */}
      <fieldset className="space-y-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card">
        <legend className="sr-only">How it was paid</legend>
        <h2 className={legend}>
          <span className={step}>3</span> How it was paid
        </h2>
        <div className="grid gap-2" role="radiogroup" aria-label="How it was paid">
          {(["personal", "centre_card", "centre_direct"] as Payment[]).map((p) => (
            <label
              key={p}
              className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-icci-field bg-white px-4 py-2 has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50 has-[:checked]:font-semibold"
            >
              <input type="radio" name="payment" value={p} checked={payment === p} onChange={() => setPayment(p)} className="h-5 w-5 accent-icci-green-dark" />
              {PAYMENT_LABEL[p]}
            </label>
          ))}
        </div>
        {payment !== "centre_direct" && (
          <label className="block">
            <span className={label}>{payment === "personal" ? "Who paid with their own money?" : "Who used the Centre's card?"}</span>
            <Select name="paid_by" required value={paidBy} onChange={(e) => setPaidBy(e.target.value)} className="mt-1" data-testid="paid-by">
              <option value="" disabled>
                Choose a person…
              </option>
              {me && <option value={me.id}>You ({me.full_name})</option>}
              {people
                .filter((p) => !p.is_me)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
            </Select>
            <span className={help}>Chosen from People, so the system can check that nobody approves money they paid.</span>
          </label>
        )}
        {payerNote && (
          <p className="rounded-xl border border-[var(--icci-warn-text)]/30 bg-[var(--icci-warn-fill)] px-4 py-3 text-[15px]" data-testid="payer-note">
            {payerNote}
          </p>
        )}
      </fieldset>

      {state.warning && (
        <div data-testid="duplicate-warning" className="space-y-3">
          <Notice tone="warning" title="This may already be entered">
            {state.warning}
          </Notice>
          <button
            type="submit"
            disabled={pending}
            onClick={() => {
              confirmDuplicate.current = true;
              then.current = "";
            }}
            className={buttonClass("primary")}
          >
            Save anyway
          </button>
        </div>
      )}
      <FormError message={state.error} />
      <SaveBar cancelHref="/expenses">
        <button type="submit" disabled={pending} onClick={() => (then.current = "")} className={buttonClass("primary", "lg")}>
          {pending ? "Saving…" : "Save claim"}
        </button>
        <span className="hidden md:block">
          <button
            type="submit"
            disabled={pending}
            onClick={() => (then.current = "another")}
            className={buttonClass("outline", "lg")}
            data-testid="save-and-another"
          >
            Save and enter another
          </button>
        </span>
      </SaveBar>
    </form>
  );
}

// ---------------------------------------------------------------------------
/** Approve with a fund (first approval) or give the second approval (fund may change). */
export function ApproveForm({
  claimId,
  kind,
  funds,
  suggestedFund,
  amountText,
  amount,
  paidTo,
  payer,
}: {
  claimId: number;
  kind: "approved" | "second_approved";
  funds: (Option & { restricted: boolean })[];
  suggestedFund: string | null;
  amountText: string;
  /** E7: the amount on the button ("Approve €43.21") and who is paid back, beside it. */
  amount: string;
  paidTo: string;
  payer: string;
}) {
  const [state, send] = useActionState(decideClaim.bind(null, claimId, kind), none);
  const [fund, setFund] = useState(suggestedFund ?? (kind === "approved" ? (funds.find((f) => !f.restricted)?.id ?? "") : ""));
  const fundName = funds.find((f) => f.id === fund)?.name;
  const first = kind === "approved";
  return (
    <form action={send} className="space-y-3" data-testid={first ? "form-approve" : "form-second"}>
      <label className="block">
        <span className={label}>{first ? "Fund this money comes from" : "Fund (change it only if it is wrong)"}</span>
        <Select name="fund" value={fund} onChange={(e) => setFund(e.target.value)} required={first} className="mt-1">
          {!first && <option value="">Keep the fund chosen at the first approval</option>}
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
              {f.restricted ? " (restricted)" : ""}
            </option>
          ))}
        </Select>
      </label>
      <label className="block">
        <span className={label}>
          Note <span className="font-normal text-icci-ink-60">(optional)</span>
        </span>
        <Input name="note" maxLength={1000} dir="auto" className="mt-1" />
      </label>
      <FormError message={state.error} />
      <p className="text-[15px]" data-testid="approve-payee">
        {paidTo ? (
          <>
            Paid to <strong dir="auto">{paidTo}</strong>, by <strong dir="auto">{payer}</strong>
          </>
        ) : (
          <>
            Paid by <strong dir="auto">{payer}</strong>
          </>
        )}
      </p>
      <ConfirmSubmit
        kind="primary"
        label={first ? `Approve ${amount}` : `Give the second approval: ${amount}`}
        title={first ? "Approve this claim?" : "Give the second approval?"}
        confirmLabel={first ? "Yes, approve" : "Yes, approve"}
        testId={first ? "approve" : "second-approve"}
      >
        {amountText}
        {fundName ? `, from the ${fundName} fund` : ""}. An approved claim never changes; if it is wrong later, it is corrected with a new entry.
      </ConfirmSubmit>
    </form>
  );
}

/** Reject (with a reason) or withdraw (whoever entered it, with a reason). */
export function ReasonForm({ claimId, kind }: { claimId: number; kind: "rejected" | "withdrawn" }) {
  const [state, send] = useActionState(decideClaim.bind(null, claimId, kind), none);
  const reject = kind === "rejected";
  return (
    <form action={send} className="space-y-3" data-testid={reject ? "form-reject" : "form-withdraw"}>
      <label className="block">
        <span className={label}>{reject ? "Why is it rejected?" : "Why are you withdrawing it?"}</span>
        <Textarea name="note" required maxLength={1000} dir="auto" className="mt-1 min-h-20" />
      </label>
      <FormError message={state.error} />
      <ConfirmSubmit
        label={reject ? "Reject" : "Withdraw this claim"}
        title={reject ? "Reject this claim?" : "Withdraw this claim?"}
        confirmLabel={reject ? "Yes, reject" : "Yes, withdraw"}
        testId={reject ? "reject" : "withdraw"}
      >
        {reject
          ? "A rejected claim is final. Whoever entered it can enter it again, corrected, if it was a mistake."
          : "A withdrawn claim stays in the record. You can then enter it again with the right details; the receipt is carried across."}
      </ConfirmSubmit>
    </form>
  );
}

// ---------------------------------------------------------------------------
/** "Correct this claim" (P5.4). */
export function CorrectionForm({
  claimId,
  categories,
  funds,
  today,
  current,
}: {
  claimId: number;
  categories: Option[];
  funds: (Option & { restricted: boolean })[];
  today: string;
  current: { amount: string; vat: string; receipt_date: string; category: string; fund: string };
}) {
  const [state, send, pending] = useActionState(correctClaim.bind(null, claimId), none);
  return (
    <form action={send} className="space-y-4 rounded-2xl border border-icci-line bg-white p-5 shadow-card" data-testid="correction-form">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Right amount (€)</span>
          <Input name="amount" required inputMode="decimal" defaultValue={current.amount} className="mt-1" />
        </label>
        <label className="block">
          <span className={label}>
            Right VAT (€) <span className="font-normal text-icci-ink-60">(optional)</span>
          </span>
          <Input name="vat" inputMode="decimal" defaultValue={current.vat} className="mt-1" />
        </label>
        <label className="block">
          <span className={label}>Right date on the receipt</span>
          <Input name="receipt_date" type="date" required max={today} defaultValue={current.receipt_date} className="mt-1" />
        </label>
        <label className="block">
          <span className={label}>Right spend category</span>
          <Select name="category" required defaultValue={current.category} className="mt-1">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="block sm:col-span-2">
          <span className={label}>Right fund</span>
          <Select name="fund" required defaultValue={current.fund} className="mt-1">
            {funds.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
                {f.restricted ? " (restricted)" : ""}
              </option>
            ))}
          </Select>
          <span className={help}>The approver of the correction confirms or changes it.</span>
        </label>
      </div>
      <label className="block">
        <span className={label}>Why is it being corrected?</span>
        <Textarea name="reason" required maxLength={500} dir="auto" className="mt-1 min-h-20" />
      </label>
      <FormError message={state.error} />
      <SaveBar cancelHref={`/expenses/${claimId}`}>
        <button type="submit" disabled={pending} className={buttonClass("primary", "lg")}>
          {pending ? "Saving…" : "Send the correction for approval"}
        </button>
      </SaveBar>
    </form>
  );
}

// ---------------------------------------------------------------------------
/** "Awaiting repayment": one person's claims, ticked, paid back in one step. */
export function RepaymentForm({
  personName,
  claims,
  today,
  disabledWhy,
}: {
  personName: string;
  /** enteredByMe: whoever entered a claim never records its repayment (migration 0053). */
  claims: { id: number; label: string; owed_cents: number; enteredByMe?: boolean }[];
  today: string;
  /** Set when the signed-in admin is the person (never pay yourself back). */
  disabledWhy: string | null;
}) {
  const [state, send] = useActionState(recordRepayment, none);
  const [ticked, setTicked] = useState<number[]>(claims.filter((c) => !c.enteredByMe).map((c) => c.id));
  const total = claims.filter((c) => ticked.includes(c.id)).reduce((n, c) => n + c.owed_cents, 0);
  return (
    <form action={send} className="space-y-3" data-testid="repayment-form">
      <ul className="divide-y divide-icci-panel rounded-xl border border-icci-line">
        {claims.map((c) => (
          <li key={c.id}>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
              <input
                type="checkbox"
                name="claim"
                value={c.id}
                checked={ticked.includes(c.id)}
                disabled={c.enteredByMe}
                onChange={(e) => setTicked((t) => (e.target.checked ? [...t, c.id] : t.filter((x) => x !== c.id)))}
                className="h-5 w-5 accent-icci-green-dark"
              />
              <span className="flex-1" dir="auto">
                {c.label}
                {c.enteredByMe && (
                  <span className="block text-sm text-icci-ink-60" data-testid="entered-by-me">
                    You entered this claim, so another admin pays it back.
                  </span>
                )}
              </span>
              <span className="font-semibold tabular-nums">{formatEuro(c.owed_cents)}</span>
            </label>
          </li>
        ))}
      </ul>
      {disabledWhy ? (
        <p className="text-sm font-semibold">{disabledWhy}</p>
      ) : (
        <details className="rounded-xl border border-icci-line px-4 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Record the repayment ({formatEuro(total)})</summary>
          <div className="grid gap-3 pb-3 pt-2 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Date paid</span>
              <Input name="paid_on" type="date" required max={today} defaultValue={today} className="mt-1" />
            </label>
            <label className="block">
              <span className={label}>How</span>
              <Select name="method" required defaultValue="bank_transfer" className="mt-1">
                {Object.entries(METHOD_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className={label}>
                Reference <span className="font-normal text-icci-ink-60">(optional)</span>
              </span>
              <Input name="reference" maxLength={100} className="mt-1" placeholder="As on the bank statement" />
            </label>
          </div>
          <FormError message={state.error} />
          <div className="pb-3">
            <ConfirmSubmit kind="primary" label="Record repayment" title={`Record ${formatEuro(total)} paid to ${personName}?`} confirmLabel="Yes, record it" testId="record-repayment">
              {ticked.length === 1 ? "1 claim" : `${ticked.length} claims`} will show as paid back. If this is wrong, the repayment can be withdrawn with a reason.
            </ConfirmSubmit>
          </div>
        </details>
      )}
    </form>
  );
}

export function WithdrawRepaymentForm({ repaymentId, claimId }: { repaymentId: number; claimId: number }) {
  const [state, send] = useActionState(withdrawRepayment.bind(null, repaymentId, claimId), none);
  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Withdraw this repayment</summary>
      <form action={send} className="space-y-3 pt-2" data-testid="form-withdraw-repayment">
        <label className="block">
          <span className={label}>Why is it wrong?</span>
          <Textarea name="reason" required maxLength={500} dir="auto" className="mt-1 min-h-20" />
        </label>
        <FormError message={state.error} />
        <ConfirmSubmit label="Withdraw repayment" title="Withdraw this repayment?" confirmLabel="Yes, withdraw" testId="withdraw-repayment">
          Every claim it covered will be awaiting repayment again. The repayment stays in the record, marked withdrawn.
        </ConfirmSubmit>
      </form>
    </details>
  );
}
