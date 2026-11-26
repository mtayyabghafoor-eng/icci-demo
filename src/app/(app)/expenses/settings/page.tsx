// Expense settings (slice P5.1; docs/PHASE-5.md, owner approved 25 Nov
// 2026): the two amounts that decide when a claim needs a second approver,
// the spend categories and the funds. Super Admin, Centre Admin and Finance
// read it; Super Admin and Finance keep the two lists; only a Super Admin
// changes the amounts. Nothing is deleted: entries are switched off. PC first.
import type { Metadata } from "next";
import { Card, CardTitle, Notice, PageHeader, PageShell, StatusPill, buttonClass } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import {
  MAY_CHANGE_EXPENSE_AMOUNTS,
  MAY_HANDLE_EXPENSES,
  MAY_KEEP_EXPENSE_LISTS,
  SETTING_KEYS,
  SETTING_TEXT,
  type ExpenseCategory,
  type ExpenseFund,
  type Setting,
} from "@/lib/expenses/rules";
import { formatDate, formatEuro } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { messageTone } from "@/lib/ui/messages";
import { setListEntryActive } from "./actions";
import { AddCategoryForm, AddFundForm, AmountForm, RenameForm } from "./forms";
import { ExpenseLinkNote } from "../link-note";

export const metadata: Metadata = { title: "Expense settings | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  "category-added": "Category added.",
  "fund-added": "Fund added.",
  renamed: "Name changed.",
  "switched-off": "Switched off. It stays on the list, but can no longer be picked for a new claim.",
  "switched-on": "Switched back on.",
  "amount-saved": "Amount saved.",
  "not-allowed": "Your account is not allowed to do this.",
};

export default function ExpenseSettingsPage(props: PageProps<"/expenses/settings">) {
  return (
    <PageShell>
      <PageHeader
        title="Expense Settings"
        subtitle="When a claim needs a second approver, what money is spent on, and which fund pays."
      />
      <Content searchParams={props.searchParams} />
    </PageShell>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/expenses/settings">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_HANDLE_EXPENSES.includes(me.roleCode)) {
    return (
      <p className="rounded-xl border border-[var(--icci-none-text)]/20 bg-[var(--icci-none-fill)] px-4 py-3" data-testid="cannot-see-expenses">
        Your account cannot see expenses. Only a Super Admin, Centre Admin or Finance can.
      </p>
    );
  }
  const { done } = await searchParams;
  const supabase = await createClient();
  const [cats, funds, settings] = await Promise.all([
    supabase.from("expense_categories").select("id, name, active").order("name"),
    supabase.from("expense_funds").select("id, name, restricted, active").order("name"),
    supabase.from("app_settings").select("key, amount_cents, updated_at"),
  ]);
  if (cats.error || funds.error || settings.error) {
    return (
      <Notice tone="error" title="The settings could not be loaded.">
        Please try again.
      </Notice>
    );
  }
  const keepsLists = MAY_KEEP_EXPENSE_LISTS.includes(me.roleCode);
  const changesAmounts = MAY_CHANGE_EXPENSE_AMOUNTS.includes(me.roleCode);
  const byKey = new Map((settings.data as Setting[]).map((s) => [s.key, s]));

  return (
    <div className="space-y-6">
      {typeof done === "string" && DONE[done] && (
        <Notice tone={messageTone(done)} floating testId="notice">
          {DONE[done]}
        </Notice>
      )}

      <ExpenseLinkNote />

      <Card>
        <CardTitle>Second approver</CardTitle>
        <ul className="space-y-5" data-testid="expense-amounts">
          {SETTING_KEYS.map((key) => {
            const s = byKey.get(key);
            const text = SETTING_TEXT[key];
            return (
              <li key={key} data-testid={`setting-${key}`}>
                <p className="font-semibold">
                  {text.title}: <span data-testid="setting-amount">{s ? formatEuro(s.amount_cents) : "Not set"}</span>
                </p>
                <p className="text-sm text-icci-ink-60">
                  {text.help}
                  {s && ` Last changed ${formatDate(s.updated_at)}.`}
                </p>
                {changesAmounts && s && (
                  <details className="mt-1">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Change this amount</summary>
                    <AmountForm settingKey={key} label={text.title} euros={(s.amount_cents / 100).toFixed(2)} />
                  </details>
                )}
              </li>
            );
          })}
        </ul>
        {!changesAmounts && <p className="mt-4 text-sm">Only a Super Admin can change these amounts.</p>}
      </Card>

      <ListCard
        kind="category"
        title="Spend categories"
        intro="What the money was spent on. The bookkeeper may want these to match their own list."
        entries={cats.data as ExpenseCategory[]}
        keepsLists={keepsLists}
        addForm={<AddCategoryForm />}
      />

      <ListCard
        kind="fund"
        title="Funds"
        intro="Which fund pays for a claim. The approver chooses it. The app only records the fund; it does not keep a balance."
        entries={funds.data as ExpenseFund[]}
        keepsLists={keepsLists}
        addForm={<AddFundForm />}
      />

      {!keepsLists && <p className="text-sm">Only a Super Admin or Finance can change the categories and funds.</p>}
      <p className="text-sm">Categories and funds are never deleted. Switch one off when it is no longer used; old claims keep it.</p>
    </div>
  );
}

function ListCard({
  kind,
  title,
  intro,
  entries,
  keepsLists,
  addForm,
}: {
  kind: "category" | "fund";
  title: string;
  intro: string;
  entries: Array<ExpenseCategory | ExpenseFund>;
  keepsLists: boolean;
  addForm: React.ReactNode;
}) {
  const on = entries.filter((e) => e.active);
  const off = entries.filter((e) => !e.active);
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <p className="-mt-2 mb-4 text-icci-ink-60">{intro}</p>
      {keepsLists && <div className="mb-5">{addForm}</div>}
      <ul className="divide-y divide-icci-line" data-testid={`${kind}-list`}>
        {on.map((e) => (
          <Entry key={e.id} kind={kind} entry={e} keepsLists={keepsLists} />
        ))}
      </ul>
      {off.length > 0 && (
        <details className="mt-4">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Switched off ({off.length})</summary>
          <ul className="divide-y divide-icci-line" data-testid={`${kind}-list-off`}>
            {off.map((e) => (
              <Entry key={e.id} kind={kind} entry={e} keepsLists={keepsLists} />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function Entry({ kind, entry, keepsLists }: { kind: "category" | "fund"; entry: ExpenseCategory | ExpenseFund; keepsLists: boolean }) {
  const fund = "restricted" in entry ? entry : null;
  return (
    <li id={`${kind}-${entry.id}`} data-testid={`${kind}-entry`} className="py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex flex-wrap items-center gap-2">
          <span className={entry.active ? "font-semibold" : "font-semibold text-icci-ink-60"} dir="auto" data-testid="entry-name">
            {entry.name}
          </span>
          {fund && <StatusPill tone="grey">{fund.restricted ? "Restricted" : "Unrestricted"}</StatusPill>}
          {!entry.active && <StatusPill tone="grey">Switched off</StatusPill>}
        </span>
        {keepsLists && (
          <form action={setListEntryActive.bind(null, kind, entry.id, !entry.active)}>
            <button type="submit" className={buttonClass(entry.active ? "danger" : "primary")} aria-label={`${entry.active ? "Switch off" : "Switch back on"} ${entry.name}`}>
              {entry.active ? "Switch off" : "Switch back on"}
            </button>
          </form>
        )}
      </div>
      {keepsLists && entry.active && (
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Rename</summary>
          <RenameForm kind={kind} id={entry.id} name={entry.name} />
        </details>
      )}
    </li>
  );
}
