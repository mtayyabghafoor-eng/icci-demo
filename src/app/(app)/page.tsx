// The home page (PLAN.md 5.7, docs/UI-PLAN.md 5.2): a greeting over the
// Centre photograph, then the counters that need attention (red first, then
// amber), quick actions, and the all-clear counters in a quieter row. Each
// counter opens its list. Designed for a PC first; everything stacks on a
// phone. The numbers come from the database (public.home_counters).
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
  CircleCheck,
  ClipboardCheck,
  FileSignature,
  Inbox,
  MapPin,
  PackagePlus,
  Printer,
  QrCode,
  ScanLine,
  ShieldCheck,
  TriangleAlert,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Suspense } from "react";
import { Card, CardTitle, CounterCard, Notice, QuickAction, Skeleton } from "@/components/ui";
import { requireAdmin, type CurrentAdmin } from "@/lib/auth/current-admin";
import {
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
  const { attention, clear } = splitCards([...counterCards(data), ...(lib ? libraryCards(lib) : [])]);
  return (
    <>
      <Greeting me={me} line={attentionSentence(attention.length)} />

      <div className="mt-8 grid gap-8 xl:grid-cols-[1fr_340px]">
        <section aria-labelledby="attention-title">
          <h2 id="attention-title" className="mb-4 text-lg font-bold text-icci-green-dark">
            Needs attention
          </h2>
          {attention.length > 0 ? (
            <CardGrid cards={attention} />
          ) : (
            <div
              data-testid="all-clear"
              className="flex items-center gap-4 rounded-2xl border border-[var(--icci-ok-text)]/20 bg-[var(--icci-ok-fill)] p-5"
            >
              <CircleCheck aria-hidden size={32} className="shrink-0 text-[var(--icci-ok-text)]" />
              <div>
                <p className="font-bold text-[var(--icci-ok-text)]">All clear</p>
                <p className="text-[15px]">Nothing is low, missing, overdue or waiting for you.</p>
              </div>
            </div>
          )}
        </section>

        <Card className="self-start">
          <CardTitle>Quick actions</CardTitle>
          <div className="-mx-3 flex flex-col">
            <QuickAction href="/items/new" icon={PackagePlus} label="Register an item" hint="Add details to a new label" />
            <QuickAction href="/places" icon={MapPin} label="Register a room" hint="Open the room, then scan its items" />
            <QuickAction href="/tickets/new" icon={Wrench} label="Report a problem" hint="A leak, a broken light, a fault" />
            <QuickAction href="/stock/count" icon={ClipboardCheck} label="Weekly count" hint="Count a store room's shelves" />
            <QuickAction href="/scan" icon={QrCode} label="Move or report an asset" hint="Open its label, then choose" />
            <QuickAction href="/stocktake" icon={ScanLine} label="Stocktake" hint="Check a room against the records" />
            <QuickAction href="/people/vetting" icon={ShieldCheck} label="Garda vetting" hint="Who is due, expired or missing" />
            <QuickAction href="/policies/grid" icon={FileSignature} label="Policy grid" hint="Who has signed each policy" />
            <QuickAction href="/renewals" icon={CalendarClock} label="Renewals" hint="What is overdue or due soon" />
            <QuickAction href="/labels" icon={Printer} label="Print labels" hint="A4 sheets of new labels" />
          </div>
        </Card>
      </div>

      {clear.length > 0 && (
        <section aria-labelledby="clear-title" className="mt-10">
          <h2 id="clear-title" className="mb-4 text-lg font-bold text-icci-green-dark">
            All clear
          </h2>
          <CardGrid cards={clear} quiet />
        </section>
      )}
    </>
  );
}

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
