// D8 (owner, 27 Nov 2026): every result for a search, grouped by kind
// (items, people, policies, books, companies, places, vehicles). On a phone
// this is where the top bar's search button leads, with a big box at the top.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, SearchX } from "lucide-react";
import { Card, CardTitle, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { GlobalSearch } from "@/components/shell/global-search";
import { requireAdmin } from "@/lib/auth/current-admin";
import { maySearch, searchEverything } from "@/lib/search/everything";
import { searchHint } from "@/lib/search/hint";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Search | ICCI Control Dashboard" };

const EACH = 20;

export default function SearchPage(props: PageProps<"/search">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Skeleton />}>
        <Results searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Results({ searchParams }: { searchParams: PageProps<"/search">["searchParams"] }) {
  const me = await requireAdmin();
  const params = await searchParams;
  const raw = (typeof params.q === "string" ? params.q : "").slice(0, 80).trim();
  if (!maySearch(me.roleCode)) {
    return (
      <>
        <PageHeader title="Search" />
        <p data-testid="search-not-allowed">Your account has nothing to search here.</p>
      </>
    );
  }
  const answer = raw ? await searchEverything(await createClient(), raw, me.roleCode, EACH) : null;
  return (
    <>
      <PageHeader title={raw ? `Search: “${raw}”` : "Search"} subtitle="Items, people, policies, books, companies, places and vehicles, or a label number." />
      <div className="mb-6">
        <GlobalSearch placeholder={searchHint(me.roleCode)} big />
      </div>
      {answer && (
        <div className="flex flex-col gap-5" data-testid="search-page-results">
          {answer.jump && (
            <Link
              href={answer.jump.href}
              className="flex min-h-12 items-center justify-between gap-3 rounded-2xl border border-icci-green/30 bg-icci-green-50 px-5 py-3 font-semibold text-icci-green-dark no-underline hover:border-icci-green"
            >
              {answer.jump.text}
              <ArrowRight aria-hidden size={18} />
            </Link>
          )}
          {answer.groups.map((g) => (
            <Card key={g.key}>
              <CardTitle
                action={
                  g.more && g.allHref ? (
                    <Link href={g.allHref} className="text-[15px] font-semibold">
                      See all in {g.title}
                    </Link>
                  ) : undefined
                }
              >
                {g.title}
              </CardTitle>
              <ul className="-my-1 divide-y divide-icci-line" data-testid={`search-group-${g.key}`}>
                {g.hits.map((h) => (
                  <li key={h.href}>
                    <Link href={h.href} className="flex min-h-12 flex-col justify-center py-2 no-underline hover:bg-icci-green-50/60">
                      <span className="font-semibold text-icci-ink">{h.title}</span>
                      {h.detail && <span className="text-sm text-icci-ink-60">{h.detail}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
              {g.more && !g.allHref && <p className="mt-3 text-sm text-icci-ink-60">Showing the first {EACH}. Type more of the name to narrow it down.</p>}
            </Card>
          ))}
          {answer.groups.length === 0 && !answer.jump && (
            <EmptyState icon={SearchX} title="Nothing found">
              {answer.q.length < 2 ? "Type at least two letters." : "Check the spelling, or try a shorter word, such as part of a name."}
            </EmptyState>
          )}
        </div>
      )}
    </>
  );
}
