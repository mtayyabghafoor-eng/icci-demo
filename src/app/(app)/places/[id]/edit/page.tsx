// Rename a place, or change its notes (slice P1.12). Its kind and number
// never change. Once its label is printed, a new name shows only on a reprint.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { KIND_WORD, placeCode } from "@/lib/places/rules";
import { createClient } from "@/lib/supabase/server";
import { allPlaces, lineOf, UUID } from "../../data";
import { PlaceForm } from "../../forms";
import { MAY_SEE_PLACES } from "../../page";

export const metadata: Metadata = { title: "Rename a place | ICCI Control Dashboard" };

export default function EditPlacePage(props: PageProps<"/places/[id]/edit">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/places/[id]/edit">["params"] }) {
  const me = await requireAdmin();
  const { id } = await params;
  if (!MAY_SEE_PLACES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const all = await allPlaces(await createClient());
  const byId = new Map(all.map((p) => [p.id, p]));
  const place = byId.get(id);
  if (!place) notFound();
  const line = lineOf(id, byId);
  const kindWord = KIND_WORD[place.kind];
  return (
    <>
      <PageHeader
        crumbs={[{ href: "/places", label: "Places" }, ...line.map((p) => ({ href: `/places/${p.id}`, label: p.name }))]}
        title={`Rename This ${kindWord}`}
        subtitle={`${placeCode(place.code)} · the number stays the same. If its label is already up, print a new one after renaming.`}
      />
      <PlaceForm place={place} kindWord={kindWord} cancelHref={`/places/${id}`} />
    </>
  );
}
