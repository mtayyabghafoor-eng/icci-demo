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
  PackageX,
  Printer,
  QrCode,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { ActionTile, AttentionRow, Card, CardTitle, ClearChip, CounterCard, HeadlineCard, Notice, QuickAction, Skeleton } from "@/components/ui";
import { requireAdmin, type CurrentAdmin } from "@/lib/auth/current-admin";
import {
  approvalsTotal,
  attentionSentence,
  counterCards,
  greeting,
  longDate,
  MAY_SEE_COUNTERS,
  splitCards,
  type CounterCard as Counter,
  type HomeCounters,
} from "@/lib/home/counters";
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
};

async function HomeContent() {
  const me = await requireAdmin();
  if (me.roleCode === "library_operator") return <LibraryHome me={me} />;
  if (!MAY_SEE_COUNTERS.includes(me.roleCode)) {
    return (
      <>
        <Greeting me={me} line="Welcome to the ICCI Control Dashboard." />
        <Card className="mt-6">
          <p data-testid="no-counters">Nothing for your role yet. Expenses arrive in a later phase.</p>
        </Card>
      </>
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("home_counters").single<HomeCounters>();
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

  // P4.5: the library's own counter (a separate call, so a library problem never hides the rest).
  const { data: lib } = await supabase.rpc("library_counters").single<LibraryCounters>();
  // UI-9: two plain counts the admins can already read: items still with the
  // Centre, and consumables never counted (named on the Low stock line).
  const [{ count: registered }, { count: notCounted }] = await Promise.all([
    supabase.from("items").select("id", { count: "exact", head: true }).or("condition.is.null,condition.neq.disposed"),
    supabase.from("stock_levels").select("item_id", { count: "exact", head: true }).eq("status", "not_counted"),
  ]);
  const cards = [...counterCards(data, notCounted ?? 0), ...(lib ? libraryCards(lib) : [])];
  const { attention, clear } = splitCards(cards);
  const approvals = approvalsTotal(data);
  const approvalQueues = cards.filter((c) => c.id.endsWith("-for-me") && c.count > 0);
  const missing = data.damaged + data.missing;
  return (
    <>
      <Greeting me={me} line={attentionSentence(attention.length)} />

      <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-label="At a glance">
        <li>
          <HeadlineCard href="/items" icon={Package} label="Items registered" count={registered ?? 0} tone="neutral" testId="headline-items" />
        </li>
        <li>
          <HeadlineCard
            href="/stock"
            icon={TriangleAlert}
            label="Low stock"
            count={data.low_stock}
            tone={data.out_of_stock > 0 ? "red" : data.low_stock > 0 ? "amber" : "neutral"}
            testId="headline-low-stock"
          />
        </li>
        <li>
          <HeadlineCard href="/assets" icon={PackageX} label="Missing or damaged" count={missing} tone={missing > 0 ? "red" : "neutral"} testId="headline-missing" />
        </li>
        <li>
          <HeadlineCard
            href={approvalQueues.length === 1 ? approvalQueues[0].href : "#attention-title"}
            icon={ClipboardCheck}
            label="For you to approve"
            count={approvals}
            tone={approvals > 0 ? "gold" : "neutral"}
            testId="headline-approvals"
          />
        </li>
      </ul>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_380px]">
        <section aria-labelledby="attention-title" className="self-start overflow-hidden rounded-2xl border border-icci-line bg-white shadow-card">
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
            <ul className="divide-y divide-icci-line">
              {attention.map((c) => (
                <li key={c.id}>
                  <AttentionRow
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
          ) : (
            <div data-testid="all-clear" className="flex items-center gap-4 p-5">
              <CircleCheck aria-hidden size={32} className="shrink-0 text-[var(--icci-ok-text)]" />
              <div>
                <p className="font-bold text-[var(--icci-ok-text)]">All clear</p>
                <p className="text-[15px]">Nothing is low, missing, overdue or waiting for you.</p>
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-6 self-start">
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
                <QuickAction href="/stock/count" icon={ClipboardCheck} label="Weekly count" hint="Count a store room's shelves" />
                <QuickAction href="/stocktake" icon={ScanLine} label="Stocktake" hint="Check a room against the records" />
                <QuickAction href="/people/vetting" icon={ShieldCheck} label="Garda vetting" hint="Who is due, expired or missing" />
                <QuickAction href="/policies/grid" icon={FileSignature} label="Policy grid" hint="Who has signed each policy" />
                <QuickAction href="/renewals" icon={CalendarClock} label="Renewals" hint="What is overdue or due soon" />
                <QuickAction href="/labels" icon={Printer} label="Print labels" hint="A4 sheets of new labels" />
              </div>
            </details>
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
};

/** The Library Operator's Home: library cards and the three library actions only. */
async function LibraryHome({ me }: { me: CurrentAdmin }) {
  const supabase = await createClient();
  const { data: lib } = await supabase.rpc("library_counters").single<LibraryCounters>();
  const { attention, clear } = splitCards(lib ? libraryCards(lib) : []);
  return (
    <>
      <Greeting me={me} line={lib ? attentionSentence(attention.length) : "Welcome to the library."} />
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
      <div className="px-6 py-7 text-white md:px-10 md:py-10">
        <h1 className="text-[13px] font-bold uppercase tracking-[0.16em] text-[#e9e1cf]">Home</h1>
        <p className="page-title mt-2 text-[30px] text-white! md:text-[44px]">
          {greeting(me.serverNow)}, {me.displayName}
        </p>
        <p className="mt-2 text-[15px] text-white/85">
          {longDate(me.serverNow)}. <span data-testid="attention-line">{line}</span>
        </p>
      </div>
    </section>
  );
}
