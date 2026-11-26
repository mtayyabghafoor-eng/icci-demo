// Register a room (slice P1.13, PLAN.md 5.1): on a phone, after scanning a
// place label, scan new item labels one after another. The place is fixed
// and the kind and category are copied from the last item here, so each
// item needs only its name (and an optional photo). While this is open, a
// label scanned with the phone's own camera app comes back here (see
// /l/[serial] and src/lib/places/room-register.ts).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Check } from "lucide-react";
import { Button, Card, CardTitle, Notice, PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { categoryGroups, type CategoryRow } from "@/lib/categories/rules";
import { parseLabelNumber } from "@/lib/items/rules";
import { roomDefaults, roomListSince, stockAllowedIn, type LastItem } from "@/lib/places/room-register";
import { KIND_WORD } from "@/lib/places/rules";
import { createClient } from "@/lib/supabase/server";
import { allPlaces, lineOf, UUID } from "../../data";
import { MAY_SEE_PLACES } from "../../page";
import { finishRoomRegister } from "./actions";
import { RoomForm } from "./room-form";

export const metadata: Metadata = { title: "Register a Room | ICCI Control Dashboard" };

const SHOWN = 50;

export default function RoomRegisterPage(props: PageProps<"/places/[id]/register">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/places/[id]/register">["params"];
  searchParams: PageProps<"/places/[id]/register">["searchParams"];
}) {
  const me = await requireAdmin();
  if (!MAY_SEE_PLACES.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Register a Room" />
        <p data-testid="room-not-allowed">Your account cannot register items. Only a Super Admin or Centre Admin can.</p>
      </>
    );
  }
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const all = await allPlaces(supabase);
  const byId = new Map(all.map((p) => [p.id, p]));
  const place = byId.get(id);
  if (!place) notFound();
  const line = lineOf(id, byId);
  const header = (
    <PageHeader
      crumbs={[{ href: "/places", label: "Places" }, ...line.map((p) => ({ href: `/places/${p.id}`, label: p.name }))]}
      title="Register a Room"
      subtitle={
        <span data-testid="room-place">
          {KIND_WORD[place.kind]}: <strong className="text-icci-text">{line.map((p) => p.name).join(" › ")}</strong>
        </span>
      }
    />
  );
  if (!place.active) {
    return (
      <>
        {header}
        <Notice tone="warning">This place is switched off. Switch it back on before registering items here.</Notice>
      </>
    );
  }

  const scanned = parseLabelNumber(typeof query.label === "string" ? query.label : "");
  const done = parseLabelNumber(typeof query.done === "string" ? query.done : "");
  const since = roomListSince();

  const [cats, last, mine, inUse] = await Promise.all([
    supabase.from("item_categories").select("id, name, parent_id, active").order("name"),
    supabase
      .from("items")
      .select("kind, category_id, unit, minimum_level")
      .eq("location_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("items")
      .select("id, label_serial, name")
      .eq("location_id", id)
      .eq("created_by", me.id)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(SHOWN),
    scanned ? supabase.from("items").select("id, name, location_id").eq("label_serial", scanned).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const used = inUse.data as { id: string; name: string; location_id: string } | null;
  const defaults = roomDefaults((last.data as LastItem | null) ?? null, place.kind);
  const registered = mine.data ?? [];
  const finish = finishRoomRegister.bind(null, id);

  return (
    <>
      {header}
      <div className="space-y-4">
        {done && (
          // UI-9: a clear green confirmation that stays on the screen while the next label is scanned.
          <div
            role="status"
            data-testid="registered-banner"
            className="flex items-center gap-3 rounded-2xl border border-[var(--icci-ok-text)]/30 bg-[var(--icci-ok-fill)] px-4 py-3.5 text-[var(--icci-ok-text)] shadow-card"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--icci-ok-text)] text-white">
              <Check aria-hidden size={22} strokeWidth={3} />
            </span>
            <p className="text-[15px] leading-snug text-icci-text">
              <strong className="font-mono text-[var(--icci-ok-text)]">{done}</strong> registered here. Scan the next label.
            </p>
          </div>
        )}
        {used && (
          <Notice tone="warning" testId="label-in-use">
            {scanned} is already on <Link href={`/items/${used.id}`}>{used.name}</Link>, recorded in{" "}
            {lineOf(used.location_id, byId)
              .map((p) => p.name)
              .join(" › ")}
            . Use a new label for the next item.
          </Notice>
        )}
        <Card>
          <RoomForm
            key={`${done ?? ""}-${scanned ?? ""}`}
            placeId={id}
            label={used ? "" : (scanned ?? "")}
            defaults={defaults}
            categoryGroups={categoryGroups((cats.data ?? []) as CategoryRow[], { pickable: true })}
            stockAllowed={stockAllowedIn(place.kind)}
          />
        </Card>

        <Card>
          <CardTitle>Registered here by you today</CardTitle>
          {registered.length === 0 ? (
            <p className="text-icci-ink-60">Nothing yet. Each item you save appears here.</p>
          ) : (
            <ul data-testid="registered-here" className="divide-y divide-icci-line">
              {registered.map((i) => (
                <li key={i.id} className="flex items-center gap-2 py-2">
                  <Check aria-hidden size={18} className="shrink-0 text-icci-green" />
                  <Link href={`/items/${i.id}`} className="font-semibold">
                    {i.name}
                  </Link>
                  <span className="ml-auto whitespace-nowrap font-mono text-sm text-icci-ink-60">{i.label_serial}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <form action={finish}>
          <Button type="submit" kind="outline" size="lg" className="w-full">
            Finish registering here
          </Button>
        </form>
      </div>
    </>
  );
}
