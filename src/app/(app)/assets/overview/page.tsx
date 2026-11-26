// What we own (slice P1.18, PLAN.md 5.1): how many of each kind of thing the
// Centre has and how many work, for the whole campus or one place. The main
// categories are tiles with their picture; opening one lists its
// sub-categories. Every number opens the Items list showing exactly those
// items. "Working" means Good or Fair (owner's choice, 21 Nov 2026).
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, fieldClass, PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { addCounts, isEmptyCount, NO_COUNT } from "@/lib/categories/counts";
import { categoryGroups } from "@/lib/categories/rules";
import { locationOptions } from "@/lib/items/rules";
import { createClient } from "@/lib/supabase/server";
import { CountLinks } from "../../categories/count-links";
import { allCategories, categoryCounts, MAY_SEE_CATEGORIES, UUID } from "../../categories/data";
import { CategoryBadge } from "../../categories/category-icon";
import { CategoryTile, CountLine } from "../../categories/tile";
import { loadLookups } from "../../items/data";

export const metadata: Metadata = { title: "What we own | ICCI Control Dashboard" };

export default function OverviewPage(props: PageProps<"/assets/overview">) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
      <Suspense fallback={<Skeleton lines={6} label="Counting" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

async function Content({ searchParams }: { searchParams: PageProps<"/assets/overview">["searchParams"] }) {
  const me = await requireAdmin();
  const params = await searchParams;
  if (!MAY_SEE_CATEGORIES.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="What We Own" />
        <p data-testid="overview-not-allowed">Your account cannot see the inventory. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const place = UUID.test(one(params.place)) ? one(params.place) : null;
  const mainId = UUID.test(one(params.main)) ? one(params.main) : null;
  const supabase = await createClient();
  const [all, lookups] = await Promise.all([allCategories(supabase), loadLookups(supabase)]);
  const groups = categoryGroups(all, { showOff: true });
  const counts = await categoryCounts(supabase, groups, place);
  const countOf = (id: string) => counts.get(id) ?? NO_COUNT;
  const main = mainId ? groups.find((g) => g.main.id === mainId) : undefined;
  const placeName = place ? lookups.locationName.get(place) : null;
  const href = (extra: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ place, ...extra })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/assets/overview?${s}` : "/assets/overview";
  };
  const campus = groups.reduce((sum, g) => addCounts(sum, countOf(g.main.id)), NO_COUNT);

  return (
    <>
      <PageHeader
        crumbs={main ? [{ href: href({}), label: "What we own" }] : undefined}
        title={
          main ? (
            <span className="flex items-center gap-3">
              <CategoryBadge icon={main.main.icon} size="lg" />
              {main.main.name}
            </span>
          ) : (
            "What We Own"
          )
        }
        subtitle={`${placeName ? `In ${placeName}` : "The whole campus"}. Working means Good or Fair. Disposed items are left out.`}
      />

      <form method="get" className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]" aria-label="Choose a place">
        {mainId && <input type="hidden" name="main" value={mainId} />}
        <label>
          <span className="font-semibold">Place</span>
          <select name="place" defaultValue={place ?? ""} className={fieldClass}>
            <option value="">The whole campus</option>
            {locationOptions(lookups.locations).map((l) => (
              <option key={l.id} value={l.id}>
                {l.path}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className="inline-flex min-h-11 items-center rounded-[10px] bg-icci-green-dark px-4 font-semibold text-white! no-underline">
            Show
          </button>
          {place && (
            <Link href={href({ place: null, main: mainId })} className="inline-flex min-h-11 items-center px-2 font-semibold">
              Whole campus
            </Link>
          )}
        </div>
      </form>

      {!main ? (
        <>
          <p className="mb-4" data-testid="campus-count">
            <strong>Altogether:</strong> <CountLine count={campus} />
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="overview-tiles" aria-label="Main categories">
            {groups
              .filter((g) => g.main.active || !isEmptyCount(countOf(g.main.id)))
              .map((g) => (
                <li key={g.main.id}>
                  <CategoryTile href={href({ main: g.main.id })} icon={g.main.icon} name={g.main.name} active={g.main.active}>
                    <CountLine count={countOf(g.main.id)} />
                  </CategoryTile>
                </li>
              ))}
          </ul>
        </>
      ) : (
        <>
          <Card>
            <p data-testid="main-count">
              <CountLine count={countOf(main.main.id)} />
            </p>
            <CountLinks count={countOf(main.main.id)} category={main.main.id} place={place} />
          </Card>
          <ul className="mt-4 space-y-3" data-testid="overview-subs">
            {main.subs
              .filter((s) => s.active || !isEmptyCount(countOf(s.id)))
              .map((s) => (
                <li key={s.id} data-testid="overview-sub">
                  <Card>
                    <h2 className="text-[17px] font-bold text-icci-green-dark">{s.name}</h2>
                    <p className="mt-1 text-sm text-icci-ink-60">
                      <CountLine count={countOf(s.id)} />
                    </p>
                    <CountLinks count={countOf(s.id)} category={s.id} place={place} />
                  </Card>
                </li>
              ))}
          </ul>
        </>
      )}
    </>
  );
}
