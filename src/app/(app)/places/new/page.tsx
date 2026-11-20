// Add a place (slice P1.12): a building, or ?inside=<place> for the next kind
// down (a room in a building, a store room in a room, a shelf in a store room).
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { CHILD_KIND, KIND_WORD } from "@/lib/places/rules";
import { createClient } from "@/lib/supabase/server";
import { allPlaces, lineOf, UUID } from "../data";
import { PlaceForm } from "../forms";
import { MAY_SEE_PLACES } from "../page";

export const metadata: Metadata = { title: "Add a place | ICCI Control Dashboard" };

export default function NewPlacePage(props: PageProps<"/places/new">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/places/new">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_PLACES.includes(me.roleCode)) {
    return <p data-testid="places-not-allowed">Your account cannot add places. Only a Super Admin or Centre Admin can.</p>;
  }
  const inside = (await searchParams).inside;
  const parentId = typeof inside === "string" && UUID.test(inside) ? inside : null;
  if (!parentId) {
    return (
      <>
        <PageHeader crumbs={[{ href: "/places", label: "Places" }]} title="Add a Building" />
        <PlaceForm kindWord="Building" cancelHref="/places" />
      </>
    );
  }
  const all = await allPlaces(await createClient());
  const byId = new Map(all.map((p) => [p.id, p]));
  const parent = byId.get(parentId);
  const kind = parent ? CHILD_KIND[parent.kind] : null;
  if (!parent || !kind || !parent.active) {
    return (
      <>
        <PageHeader crumbs={[{ href: "/places", label: "Places" }]} title="Add a Place" />
        <p>Nothing can be added there. It may be a shelf, or switched off.</p>
      </>
    );
  }
  const line = lineOf(parentId, byId);
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/places", label: "Places" }, ...line.map((p) => ({ href: `/places/${p.id}`, label: p.name }))]}
        title={`Add a ${KIND_WORD[kind]}`}
        subtitle={`Inside ${line.map((p) => p.name).join(" › ")}`}
      />
      <PlaceForm parentId={parentId} kindWord={KIND_WORD[kind]} cancelHref={`/places/${parentId}`} />
    </>
  );
}
