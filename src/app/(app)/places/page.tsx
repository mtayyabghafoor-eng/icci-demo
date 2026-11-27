// Places (slice P1.12): every building, with its rooms, store rooms and
// shelves underneath, each with its place number (PL-0001). Super Admins and
// Centre Admins add, rename and switch off places from here.
import type { Metadata } from "next";
import Link from "next/link";
import { PlaceFinder } from "./place-finder";
import { Suspense } from "react";
import { MapPin, Plus } from "lucide-react";
import { Card, EmptyState, LinkButton, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { KIND_WORD, placeCode } from "@/lib/places/rules";
import { createClient } from "@/lib/supabase/server";
import { allPlaces, childrenOf, type Place } from "./data";

export const metadata: Metadata = { title: "Places | ICCI Control Dashboard" };

export const MAY_SEE_PLACES = ["super_admin", "centre_admin"];

export default function PlacesPage(props: PageProps<"/places">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/places">["searchParams"] }) {
  const me = await requireAdmin();
  const showOff = (await searchParams).off === "1";
  const header = (
    <PageHeader
      title="Places"
      subtitle="Buildings, rooms, store rooms and shelves. Each has a number for its place label."
      actions={MAY_SEE_PLACES.includes(me.roleCode) ? <LinkButton href="/places/new" icon={Plus}>Add a building</LinkButton> : undefined}
    />
  );
  if (!MAY_SEE_PLACES.includes(me.roleCode)) {
    return (
      <>
        {header}
        <p data-testid="places-not-allowed">Your account cannot see places. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const all = await allPlaces(await createClient());
  const buildings = childrenOf(null, all, showOff);
  const offCount = all.filter((p) => !p.active).length;
  return (
    <>
      {header}
      {offCount > 0 && (
        <p className="mb-4 text-sm">
          {showOff ? (
            <Link href="/places" className="inline-flex min-h-11 items-center">Hide switched-off places</Link>
          ) : (
            <Link href="/places?off=1" className="inline-flex min-h-11 items-center">
              Show {offCount} switched-off {offCount === 1 ? "place" : "places"}
            </Link>
          )}
        </p>
      )}
      {buildings.length === 0 ? (
        <EmptyState icon={MapPin} title="No places yet">
          Start by adding a building.
        </EmptyState>
      ) : (
        <>
          <PlaceFinder />
          <div className="space-y-4" data-testid="places-tree">
            {buildings.map((b) => (
              <div key={b.id} data-building>
                <Card>
                  <Branch place={b} all={all} showOff={showOff} depth={0} />
                </Card>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

function Branch({ place, all, showOff, depth }: { place: Place; all: Place[]; showOff: boolean; depth: number }) {
  const inside = childrenOf(place.id, all, showOff);
  return (
    <div data-branch className={depth > 0 ? "border-l-2 border-icci-line pl-4" : undefined}>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5" data-testid="place-row" data-code={placeCode(place.code)}>
        <span className="text-[12.5px] font-bold uppercase tracking-wider text-icci-ink-60">{KIND_WORD[place.kind]}</span>
        <Link href={`/places/${place.id}`} className={depth === 0 ? "text-lg font-bold" : "font-semibold"}>
          {place.name}
        </Link>
        <span className="font-mono text-sm text-icci-ink-60">{placeCode(place.code)}</span>
        {!place.active && <StatusBadge word="Switched off" tone="grey" />}
      </p>
      {inside.length > 0 && (
        <div className="ml-1 space-y-0.5">
          {inside.map((c) => (
            <Branch key={c.id} place={c} all={all} showOff={showOff} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
