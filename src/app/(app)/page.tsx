// The home page (PLAN.md 5.7, docs/UI-PLAN.md 5.2): a greeting over the
// Centre photograph, then the counters that need attention (red first, then
// amber), quick actions, and the all-clear counters in a quieter row. Each
// counter opens its list. Designed for a PC first; everything stacks on a
// phone. The numbers come from the database (public.home_counters).
// UI-9 (calmer Home): four headline numbers, Needs attention as slim rows,
// the all-clear counters as green chips, and four big actions with the
// rest behind "More actions".
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
  Package,
  PackagePlus,
  Users,
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
  HandCoins,
  FileSpreadsheet,
  Presentation,
} from "lucide-react";
import { Suspense } from "react";
import { ActionTile, ApprovalsBox, AttentionRow, Card, CardTitle, ClearChip, CounterCard, GlanceStrip, HeadlineCard, Notice, QuickAction, Skeleton } from "@/components/ui";
import { requireAdmin, type CurrentAdmin } from "@/lib/auth/current-admin";
import { GlobalSearch } from "@/components/shell/global-search";
import { maySearch } from "@/lib/search/everything";
import { searchHint } from "@/lib/search/hint";
import { ExpenseLinkNote } from "./expenses/link-note";
import {
  APPROVAL_IDS,
  approvalsTotal,
  attentionSentence,
  counterCards,
  expenseCards,
  greeting,
  longDate,
  MAY_SEE_COUNTERS,
  splitCards,
  stocktakeLink,
  type CounterCard as Counter,
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
    // D1: two plain facts for the strip under the greeting.
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
  // D1 (owner, 27 Nov 2026): approval queues live only in their own box,
  // never twice; the list splits into Urgent (red) and To do (amber).
  const { attention, clear } = splitCards(cards.filter((c) => !APPROVAL_IDS.includes(c.id)));
  const urgent = attention.filter((c) => c.tone === "red");
  const toDo = attention.filter((c) => c.tone !== "red");
  const approvals = approvalsTotal(data) + (exp?.for_me ?? 0);
  const queues = [
    { href: "/expenses", label: "Expense claims", count: exp?.for_me ?? 0 },
    { href: "/stock/approvals", label: "Stock corrections", count: data.corrections_for_me },
    { href: "/assets/approvals", label: "Disposals", count: data.disposals_for_me },
    { href: stocktakeHref, label: "Stocktake differences", count: data.stocktake_diffs_for_me },
  ].filter((q) => q.count > 0);
  const row = (c: Counter) => (
    <li key={c.id}>
      <AttentionRow href={c.href} icon={ICON[c.id] ?? Inbox} title={c.title} count={c.count} detail={c.detail} tone={c.tone} testId={`counter-${c.id}`} />
    </li>
  );
  return (
    <>
      <Greeting me={me} line={attentionSentence(urgent.length, toDo.length)} />

      <GlanceStrip
        facts={[
          { href: "/items", icon: Package, label: "Items registered", count: registered ?? 0, testId: "headline-items" },
          { href: "/people", icon: Users, label: "People", count: peopleCount ?? 0, testId: "headline-people" },
          { href: "/library", icon: BookOpen, label: "Library books", count: bookCount ?? 0, testId: "headline-books" },
        ]}
      />

      {/* D1: on a phone, approvals and the quick actions come before the list; on a PC they sit on the right. */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-6 self-start xl:order-2">
          <ApprovalsBox total={approvals} queues={queues} testId="headline-approvals" />

          <section aria-labelledby="actions-title" className="rounded-2xl border border-icci-line bg-white p-4 shadow-card md:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span aria-hidden className="h-6 w-1 rounded-full bg-icci-gold" />
              <h2 id="actions-title" className="text-lg font-bold text-icci-green-dark">
                Quick actions
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ActionTile href="/items/new" icon={PackagePlus} label="Register an item" hint="A new label" primary />
              <ActionTile href="/places" icon={MapPin} label="Register a room" hint="Scan a room's items" />
              <ActionTile href="/tickets/new" icon={Wrench} label="Report a problem" hint="A leak, a fault" />
              <ActionTile href="/scan" icon={QrCode} label="Move or report an asset" hint="Open its label" />
            </div>
            <details className="group mt-3">
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
        </div>

        <div className="flex flex-col gap-6 self-start xl:order-1">
          <section aria-labelledby="attention-title" className="overflow-hidden rounded-2xl border border-icci-line bg-white shadow-card">
            <div className="flex items-center gap-3 border-b border-icci-line px-4 py-4 md:px-5">
              <span aria-hidden className="h-6 w-1 rounded-full bg-icci-gold" />
              <h2 id="attention-title" className="scroll-mt-24 text-lg font-bold text-icci-green-dark">
                Needs attention
              </h2>
              {attention.length > 0 && (
                <span className="ml-auto rounded-full bg-icci-panel px-2.5 py-0.5 text-sm font-semibold text-icci-green-dark">{attention.length}</span>
              )}
            </div>
            {attention.length > 0 ? (
              <>
                {urgent.length > 0 && (
                  <>
                    <h3 className="bg-icci-green-50 px-4 py-1.5 text-[13px] font-bold uppercase tracking-wider text-icci-ink-60 md:px-5">Urgent</h3>
                    <ul className="divide-y divide-icci-line">{urgent.map(row)}</ul>
                  </>
                )}
                {toDo.length > 0 && (
                  <>
                    <h3 className="border-t border-icci-line bg-icci-green-50 px-4 py-1.5 text-[13px] font-bold uppercase tracking-wider text-icci-ink-60 md:px-5">To do</h3>
                    <ul className="divide-y divide-icci-line">{toDo.map(row)}</ul>
                  </>
                )}
              </>
            ) : (
              <div data-testid="all-clear" className="flex items-center gap-4 p-5">
                <CircleCheck aria-hidden size={32} className="shrink-0 text-[var(--icci-ok-text)]" />
                <div>
                  <p className="font-bold text-[var(--icci-ok-text)]">All clear</p>
                  <p className="text-[15px]">Nothing is low, missing or overdue.</p>
                </div>
              </div>
            )}
          </section>

          {clear.length > 0 && (
            <section aria-labelledby="clear-title" className="rounded-2xl border border-icci-line bg-white p-4 shadow-card md:p-5">
              <h2 id="clear-title" className="mb-3 flex items-center gap-2 font-bold text-[var(--icci-ok-text)]">
                <CircleCheck aria-hidden size={18} />
                All clear
              </h2>
              <ul className="flex flex-wrap gap-2">
                {clear.map((c) => (
                  <li key={c.id}>
                    <ClearChip href={c.href} title={CHIP[c.id] ?? c.title} count={c.count} testId={`counter-${c.id}`} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

/** P5.3: Finance's Home: what waits for them, who is owed, and their pages. */
async function FinanceHome({ me }: { me: CurrentAdmin }) {
  const supabase = await createClient();
  const { data: e } = await supabase.rpc("expense_counters").single<ExpenseCounters>();
  return (
    <>
      <Greeting me={me} line="Here is where the Centre's expenses stand." />
      <div className="mt-6">
        <ExpenseLinkNote />
      </div>
      {e ? (
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3" aria-label="At a glance">
          <li>
            <HeadlineCard
              href={e.for_me > 0 ? "/expenses" : undefined}
              icon={ClipboardCheck}
              label="For you to approve"
              count={e.for_me}
              tone={e.for_me > 0 ? "gold" : "neutral"}
              testId="headline-expenses-for-me"
            />
          </li>
          <li>
            <HeadlineCard href="/expenses" icon={Receipt} label="Claims waiting" count={e.waiting} tone="neutral" testId="headline-expenses-waiting" />
          </li>
          <li className="col-span-2 xl:col-span-1">
            <HeadlineCard
              href="/expenses?tab=repay"
              icon={HandCoins}
              label={e.owed_people === 0 ? "Nobody awaiting repayment" : `Awaiting repayment: ${formatEuro(e.owed_cents)}`}
              count={e.owed_people}
              tone={e.owed_people > 0 ? "red" : "neutral"}
              testId="headline-owed"
            />
          </li>
        </ul>
      ) : (
        <div className="mt-6">
          <Notice tone="error" title="The counters could not be loaded.">
            Please reload the page.
          </Notice>
        </div>
      )}
      <section className="mt-6" aria-label="Actions">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <ActionTile href="/expenses/new" icon={ReceiptText} label="New claim" hint="With its receipt" primary />
          <ActionTile href="/expenses" icon={Receipt} label="Expenses" hint="Waiting, owed, all" />
          <ActionTile href="/expenses/export" icon={FileSpreadsheet} label="Monthly export" hint="For the bookkeeper" />
          <ActionTile href="/board-report" icon={Presentation} label="Board report" hint="A month on one page" />
          <ActionTile href="/assets/register" icon={Table2} label="Asset register" hint="Values by place" />
          <ActionTile href="/expenses/settings" icon={SlidersHorizontal} label="Expense settings" hint="Categories, funds, amounts" />
        </div>
      </section>
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

/** UI-9: short names for the all-clear chips. */
const CHIP: Record<string, string> = {
  "low-stock": "Low stock",
  "missing-damaged": "Missing or damaged",
  "corrections-for-me": "Stock corrections",
  "disposals-for-me": "Disposals",
  "stocktake-for-me": "Stocktake differences",
  vetting: "Garda vetting",
  signoffs: "Policy sign-offs",
  renewals: "Renewals",
  "rota-today": "Today's rota",
  tickets: "Maintenance tickets",
  "library-overdue": "Library returns",
  "expenses-for-me": "Expense claims",
  "awaiting-repayment": "Repayments",
};

/** The Library Operator's Home: library cards and the three library actions only. */
async function LibraryHome({ me }: { me: CurrentAdmin }) {
  const supabase = await createClient();
  const { data: lib } = await supabase.rpc("library_counters").single<LibraryCounters>();
  const { attention, clear } = splitCards(lib ? libraryCards(lib) : []);
  return (
    <>
      <Greeting me={me} line={lib ? attentionSentence(attention.filter((c) => c.tone === "red").length, attention.filter((c) => c.tone !== "red").length) : "Welcome to the library."} />
      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
        <section aria-labelledby="library-title">
          <h2 id="library-title" className="mb-4 text-lg font-bold text-icci-green-dark">
            The library today
          </h2>
          {lib ? (
            <CardGrid cards={[...attention, ...clear]} />
          ) : (
            <Notice tone="error" title="The library counters could not be loaded.">
              Please reload the page.
            </Notice>
          )}
          <p className="mt-4 text-[15px]" data-testid="no-counters">
            You are signed in to the library. Open Library in the menu to find or add books.
          </p>
        </section>
        <Card className="self-start">
          <CardTitle>Quick actions</CardTitle>
          <div className="-mx-3 flex flex-col">
            <QuickAction href="/library/lend" icon={BookUp} label="Lend a book" hint="Scan it, then pick the borrower" />
            <QuickAction href="/library/return" icon={BookDown} label="Return a book" hint="Scan it, one tap" />
            <QuickAction href="/library/new" icon={BookPlus} label="Add a book" hint="Scan a new label, then the ISBN" />
          </div>
        </Card>
      </div>
    </>
  );
}

function CardGrid({ cards, quiet = false }: { cards: Counter[]; quiet?: boolean }) {
  return (
    <ul className={quiet ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-3" : "grid gap-4 sm:grid-cols-2"}>
      {cards.map((c) => (
        <li key={c.id}>
          <CounterCard
            href={c.href}
            icon={ICON[c.id] ?? Inbox}
            title={c.title}
            count={c.count}
            detail={c.detail}
            tone={c.tone}
            testId={`counter-${c.id}`}
          />
        </li>
      ))}
    </ul>
  );
}

/** The greeting band over the Centre photograph. */
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
      <div className="px-6 py-6 text-white md:px-10 md:py-8">
        <h1 className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#e9e1cf]">Home</h1>
        <p className="page-title mt-2 text-[30px] text-white! md:text-[40px]">
          {greeting(me.serverNow)}, {me.displayName}
        </p>
        <p className="mt-2 text-[15px] text-white/85">
          {longDate(me.serverNow)}. <span data-testid="attention-line">{line}</span>
        </p>
      </div>
    </section>
    {/* D8: on a phone, the search box sits right under the greeting. */}
    {maySearch(me.roleCode) && (
      <div className="md:hidden" data-testid="home-search">
        <GlobalSearch placeholder={searchHint(me.roleCode)} big />
      </div>
    )}
    </>
  );
}
