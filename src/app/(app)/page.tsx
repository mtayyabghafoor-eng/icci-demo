// The home page (PLAN.md 5.7, docs/UI-PLAN.md 5.2). Each counter opens its
// list; the numbers come from the database (public.home_counters).
// E1 (docs/ROUND-E-PLAN.md, owner 27 Nov 2026: "a lot of bombardment of
// information"): a short greeting; only the urgent (red) things in full;
// quick actions as plain buttons; approvals in a white card; and everything
// else (jobs, backlogs, plain totals) as small quiet numbers, never red or
// amber. On a phone: Urgent, Quick actions, approvals, Everything else.
import type { Metadata } from "next";
import Image from "next/image";
import {
  BookDown,
  BookOpen,
  BookPlus,
  BookUp,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  FileSignature,
  Inbox,
  MapPin,
  PackagePlus,
  Printer,
  QrCode,
  ScanLine,
  Shapes,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  type LucideIcon,
  SlidersHorizontal,
  Table2,
  Receipt,
  ReceiptText,
  FileSpreadsheet,
  Presentation,
  HandCoins,
} from "lucide-react";
import { Suspense } from "react";
import { ApprovalsBox, AttentionRow, CounterCard, HomeAction, Notice, QuickAction, QuietCounter, Skeleton } from "@/components/ui";
import { requireAdmin, type CurrentAdmin } from "@/lib/auth/current-admin";
import { GlobalSearch } from "@/components/shell/global-search";
import { maySearch } from "@/lib/search/everything";
import { searchHint } from "@/lib/search/hint";
import { ExpenseLinkNote } from "./expenses/link-note";
import {
  approvalsTotal,
  counterCards,
  expenseCards,
  greeting,
  longDate,
  MAY_SEE_COUNTERS,
  homeSections,
  stocktakeLink,
  urgentSentence,
  type ExpenseCounters,
  type HomeCounters,
} from "@/lib/home/counters";
import { formatEuro } from "@/lib/items/rules";
import { libraryCards, type Counters as LibraryCounters } from "@/lib/library/lists";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Home | ICCI Control Dashboard" };

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Loading />}>
        <HomeContent />
      </Suspense>
    </main>
  );
}

function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div aria-hidden className="h-40 animate-pulse rounded-3xl bg-icci-panel" />
      <Skeleton lines={4} label="Loading the counters" />
    </div>
  );
}

const ICON: Record<string, LucideIcon> = {
  "low-stock": ChartColumn,
  "missing-damaged": TriangleAlert,
  "corrections-for-me": ClipboardCheck,
  "disposals-for-me": Inbox,
  "stocktake-for-me": ScanLine,
  vetting: ShieldCheck,
  signoffs: FileSignature,
  renewals: CalendarClock,
  "rota-today": CalendarDays,
  "library-overdue": BookOpen,
  tickets: Wrench,
  "expenses-for-me": Receipt,
  "awaiting-repayment": HandCoins,
};

async function HomeContent() {
  const me = await requireAdmin();
  if (me.roleCode === "library_operator") return <LibraryHome me={me} />;
  if (!MAY_SEE_COUNTERS.includes(me.roleCode)) {
    // P5.1 and P5.3: Finance's Home: its expense counters and actions.
    return <FinanceHome me={me} />;
  }

  const supabase = await createClient();
  // Round C2: every counter is asked for at the same time (each worked out
  // in one pass by the database, migration 0057). The library and expense
  // counters stay separate calls, so a problem there never hides the rest.
  const [{ data, error }, { data: lib }, { count: registered }, { count: notCounted }, { data: exp }, { count: peopleCount }, { count: bookCount }] = await Promise.all([
    supabase.rpc("home_counters").single<HomeCounters>(),
    supabase.rpc("library_counters").single<LibraryCounters>(),
    // UI-9: two plain counts the admins can already read: items still with the
    // Centre, and consumables never counted (named on the Low stock line).
    supabase.from("items").select("id", { count: "exact", head: true }).or("condition.is.null,condition.neq.disposed"),
    supabase.from("stock_levels").select("item_id", { count: "exact", head: true }).eq("status", "not_counted"),
    // P5.3: expense claims.
    supabase.rpc("expense_counters").single<ExpenseCounters>(),
    // D1: plain facts, now in the quiet row (E1).
    supabase.from("people").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("library_books").select("id", { count: "exact", head: true }),
  ]);
  if (error || !data) {
    return (
      <>
        <Greeting me={me} line="Here is how the Centre stands today." />
        <div className="mt-6">
          <Notice tone="error" title="The counters could not be loaded.">
            Please reload the page.
          </Notice>
        </div>
      </>
    );
  }

  const stocktakeHref = stocktakeLink(data.stocktake_diffs_for_me > 0 ? await stocktakesWaitingFor(me.id) : []);
  const cards = [...counterCards(data, notCounted ?? 0, stocktakeHref), ...(lib ? libraryCards(lib) : []), ...(exp ? expenseCards(exp, formatEuro) : [])];
  // E1 (owner, 27 Nov 2026): only red things in full; everything else quiet.
  // D1: approval queues live only in their own box, never twice.
  const { urgent, quiet } = homeSections(cards);
  const approvals = approvalsTotal(data) + (exp?.for_me ?? 0);
  const queues = [
    { href: "/expenses", label: "Expense claims", count: exp?.for_me ?? 0 },
    { href: "/stock/approvals", label: "Stock corrections", count: data.corrections_for_me },
    { href: "/assets/approvals", label: "Disposals", count: data.disposals_for_me },
    { href: stocktakeHref, label: "Stocktake differences", count: data.stocktake_diffs_for_me },
  ].filter((q) => q.count > 0);
  return (
    <>
      <Greeting me={me} line={urgentSentence(urgent.length)} />

      {/*
        E1: the reading order is the phone order (Urgent, Quick actions,
        approvals, Everything else). On a wide PC, Urgent and Everything else
        make the left column, with the actions and approvals on the right.
      */}
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-rows-[auto_1fr] xl:gap-6">
        <section aria-labelledby="urgent-title" className="self-start overflow-hidden rounded-2xl border border-icci-line bg-white shadow-card xl:col-start-1 xl:row-start-1">
          <div className="flex items-center gap-3 border-b border-icci-line px-4 py-3.5 md:px-5">
            <h2 id="urgent-title" className="text-lg font-bold text-icci-green-dark">
              Urgent
            </h2>
          </div>
          {urgent.length > 0 ? (
            <ul className="divide-y divide-icci-line">
              {urgent.map((c) => (
                <li key={c.id}>
                  <AttentionRow href={c.href} icon={ICON[c.id] ?? Inbox} title={c.title} count={c.count} detail={c.detail} tone={c.tone} testId={`counter-${c.id}`} />
                </li>
              ))}
            </ul>
          ) : (
            <div data-testid="all-clear" className="flex items-center gap-4 px-4 py-5 md:px-5">
              <CircleCheck aria-hidden size={28} className="shrink-0 text-[var(--icci-ok-text)]" />
              <div>
                <p className="font-bold text-[var(--icci-ok-text)]">Nothing urgent</p>
                <p className="text-[15px]">Vetting, renewals and repairs are all in hand.</p>
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-5 self-start xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:gap-6">
        <section aria-labelledby="actions-title" className="rounded-2xl border border-icci-line bg-white p-4 shadow-card md:p-5">
          <h2 id="actions-title" className="mb-3 text-lg font-bold text-icci-green-dark">
            Quick actions
          </h2>
          <div className="grid grid-cols-2 gap-2">
            <HomeAction href="/items/new" icon={PackagePlus} label="Register an item" primary />
            <HomeAction href="/places" icon={MapPin} label="Register a room" />
            <HomeAction href="/tickets/new" icon={Wrench} label="Report a problem" />
            <HomeAction href="/scan" icon={QrCode} label="Move or report an asset" />
          </div>
          <details className="group mt-2">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-xl px-3 font-semibold text-icci-green hover:bg-icci-green-50 [&::-webkit-details-marker]:hidden">
              More actions
              <ChevronDown aria-hidden size={18} className="transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <div className="-mx-1 mt-1 flex flex-col">
              <QuickAction href="/expenses/new" icon={ReceiptText} label="New expense claim" hint="Money spent, with its receipt" />
              <QuickAction href="/assets/overview" icon={Shapes} label="What we own" hint="How many of each, and how many work" />
              <QuickAction href="/stock/count" icon={ClipboardCheck} label="Weekly count" hint="Count a store room's shelves" />
              <QuickAction href="/stocktake" icon={ScanLine} label="Stocktake" hint="Check a room against the records" />
              <QuickAction href="/people/vetting" icon={ShieldCheck} label="Garda vetting" hint="Who is due, expired or missing" />
              <QuickAction href="/policies/grid" icon={FileSignature} label="Policy grid" hint="Who has signed each policy" />
              <QuickAction href="/renewals" icon={CalendarClock} label="Renewals" hint="What is overdue or due soon" />
              <QuickAction href="/labels" icon={Printer} label="Print labels" hint="A4 sheets of new labels" />
            </div>
          </details>
        </section>

        <ApprovalsBox total={approvals} queues={queues} testId="headline-approvals" />
        </div>

        <section aria-labelledby="else-title" className="self-start xl:col-start-1 xl:row-start-2">
          <h2 id="else-title" className="mb-3 text-lg font-bold text-icci-green-dark">
            Everything else
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))]">
            {quiet.map((c) => (
              <li key={c.id}>
                <QuietCounter
                  href={c.href}
                  label={CHIP[c.id] ?? c.title}
                  count={c.count}
                  clear={c.tone === "green"}
                  spoken={`${c.title}: ${c.count}. ${c.detail}`}
                  testId={`counter-${c.id}`}
                />
              </li>
            ))}
            <li>
              <QuietCounter href="/items" label="Items registered" count={registered ?? 0} testId="headline-items" countTestId="headline-count" />
            </li>
            <li>
              <QuietCounter href="/people" label="People" count={peopleCount ?? 0} testId="headline-people" countTestId="headline-count" />
            </li>
            <li>
              <QuietCounter href="/library" label="Library books" count={bookCount ?? 0} testId="headline-books" countTestId="headline-count" />
            </li>
          </ul>
        </section>
      </div>
    </>
  );
}

/** P5.3: Finance's Home: what waits for them, who is owed, and their pages. E1: the same calm parts as the Centre's Home. */
async function FinanceHome({ me }: { me: CurrentAdmin }) {
  const supabase = await createClient();
  const { data: e } = await supabase.rpc("expense_counters").single<ExpenseCounters>();
  return (
    <>
      <Greeting me={me} line="Here is where the Centre's expenses stand." />
      <div className="mt-5">
        <ExpenseLinkNote />
      </div>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <section aria-labelledby="finance-actions-title" className="self-start rounded-2xl border border-icci-line bg-white p-4 shadow-card md:p-5">
          <h2 id="finance-actions-title" className="mb-3 text-lg font-bold text-icci-green-dark">
            Quick actions
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            <HomeAction href="/expenses/new" icon={ReceiptText} label="New claim" hint="With its receipt" primary />
            <HomeAction href="/expenses" icon={Receipt} label="Expenses" hint="Waiting, owed, all" />
            <HomeAction href="/expenses/export" icon={FileSpreadsheet} label="Monthly export" hint="For the bookkeeper" />
            <HomeAction href="/board-report" icon={Presentation} label="Board report" hint="A month on one page" />
            <HomeAction href="/assets/register" icon={Table2} label="Asset register" hint="Values by place" />
            <HomeAction href="/expenses/settings" icon={SlidersHorizontal} label="Expense settings" hint="Categories, funds, amounts" />
          </div>
        </section>
        {e ? (
          <div className="flex flex-col gap-5 self-start">
            <ApprovalsBox total={e.for_me} queues={e.for_me > 0 ? [{ href: "/expenses", label: "Expense claims", count: e.for_me }] : []} testId="headline-expenses-for-me" />
            <ul className="grid grid-cols-2 gap-3" aria-label="At a glance">
              <li>
                <QuietCounter href="/expenses" label="Claims waiting" count={e.waiting} testId="headline-expenses-waiting" countTestId="headline-count" />
              </li>
              <li>
                <QuietCounter
                  href="/expenses?tab=repay"
                  label={e.owed_people === 0 ? "Nobody to repay" : `To repay: ${formatEuro(e.owed_cents)}`}
                  count={e.owed_people}
                  clear={e.owed_people === 0}
                  spoken={e.owed_people === 0 ? "Nobody awaiting repayment" : `${e.owed_people} awaiting repayment: ${formatEuro(e.owed_cents)}`}
                  testId="headline-owed"
                  countTestId="headline-count"
                />
              </li>
            </ul>
          </div>
        ) : (
          <Notice tone="error" title="The counters could not be loaded.">
            Please reload the page.
          </Notice>
        )}
      </div>
    </>
  );
}

/**
 * A5: the sent stocktakes with a difference waiting for this admin, by the
 * same rule as the Home counter: they did not start, send or scan it, and
 * did not record the difference. Newest first.
 */
async function stocktakesWaitingFor(me: string): Promise<number[]> {
  const supabase = await createClient();
  const { data: diffs } = await supabase.from("stocktake_differences").select("stocktake_id, created_by").eq("status", "pending");
  const rows = (diffs ?? []) as { stocktake_id: number; created_by: string | null }[];
  const ids = [...new Set(rows.filter((d) => d.created_by !== me).map((d) => d.stocktake_id))];
  if (ids.length === 0) return [];
  const [{ data: sts }, { data: scans }] = await Promise.all([
    supabase.from("stocktakes").select("id, created_by, submitted_by").in("id", ids),
    supabase.from("stocktake_scans").select("stocktake_id").in("stocktake_id", ids).eq("created_by", me),
  ]);
  const scanned = new Set(((scans ?? []) as { stocktake_id: number }[]).map((x) => x.stocktake_id));
  return ((sts ?? []) as { id: number; created_by: string | null; submitted_by: string | null }[])
    .filter((st) => st.created_by !== me && st.submitted_by !== me && !scanned.has(st.id))
    .map((st) => st.id)
    .sort((a, b) => b - a);
}

/** UI-9: short names for the counters; E1: used in the quiet "Everything else" row. */
const CHIP: Record<string, string> = {
  "low-stock": "Low stock",
  "missing-damaged": "Missing or damaged",
  "corrections-for-me": "Stock corrections",
  "disposals-for-me": "Disposals",
  "stocktake-for-me": "Stocktake differences",
  vetting: "Vetting due soon",
  signoffs: "Policies to sign",
  renewals: "Renewals due soon",
  "rota-today": "Empty rota slots today",
  tickets: "Open tickets",
  "library-overdue": "Library returns",
  "expenses-for-me": "Expense claims",
  "awaiting-repayment": "People to repay",
};

/**
 * The Library Operator's Home. E1: the volunteer's two jobs, Lend and
 * Return, come first as two big buttons; then the overdue card.
 */
async function LibraryHome({ me }: { me: CurrentAdmin }) {
  const supabase = await createClient();
  const { data: lib } = await supabase.rpc("library_counters").single<LibraryCounters>();
  const line = !lib ? "Welcome to the library." : lib.books_overdue === 0 ? "No book is overdue." : lib.books_overdue === 1 ? "1 book is overdue." : `${lib.books_overdue} books are overdue.`;
  return (
    <>
      <Greeting me={me} line={line} />
      <section aria-label="Library desk" className="mt-5 grid gap-3 sm:grid-cols-2">
        <HomeAction href="/library/lend" icon={BookUp} label="Lend a book" hint="Scan it, then pick the borrower" primary large />
        <HomeAction href="/library/return" icon={BookDown} label="Return a book" hint="Scan it, one tap" large />
      </section>
      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <section aria-labelledby="library-title" className="self-start">
          <h2 id="library-title" className="mb-3 text-lg font-bold text-icci-green-dark">
            The library today
          </h2>
          {lib ? (
            <ul className="grid gap-4">
              {libraryCards(lib).map((c) => (
                <li key={c.id}>
                  <CounterCard href={c.href} icon={ICON[c.id] ?? Inbox} title={c.title} count={c.count} detail={c.detail} tone={c.tone} testId={`counter-${c.id}`} />
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="error" title="The library counters could not be loaded.">
              Please reload the page.
            </Notice>
          )}
          <p className="mt-4 text-[15px]" data-testid="no-counters">
            You are signed in to the library. Find any book with the search box.
          </p>
        </section>
        <div className="self-start">
          <HomeAction href="/library/new" icon={BookPlus} label="Add a book" hint="Scan a new label, then the ISBN" />
        </div>
      </div>
    </>
  );
}

/** The greeting band over the Centre photograph. E1: about half as tall, with no "HOME" label over it (the breadcrumb says Home). */
function Greeting({ me, line }: { me: CurrentAdmin; line: string }) {
  return (
    <>
    <section className="relative isolate overflow-hidden rounded-3xl shadow-card" data-testid="greeting">
      <Image
        src="/brand/centre-front-1800.webp"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 950px, 100vw"
        className="-z-20 object-cover object-[50%_45%]"
      />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-icci-green-900/92 via-icci-green-dark/78 to-icci-green-dark/25" />
      <div className="px-5 py-4 text-white md:px-8 md:py-5">
        <h1 className="sr-only">Home</h1>
        <p className="page-title text-[26px] text-white! md:text-[32px]">
          {greeting(me.serverNow)}, {me.displayName}
        </p>
        <p className="mt-1 text-[15px] text-white/90">
          {longDate(me.serverNow)} · <span data-testid="attention-line">{line}</span>
        </p>
      </div>
    </section>
    {/* D8: on a phone, the search box sits right under the greeting. */}
    {maySearch(me.roleCode) && (
      <div className="mt-4 md:hidden" data-testid="home-search">
        <GlobalSearch placeholder={searchHint(me.roleCode)} big />
      </div>
    )}
    </>
  );
}
