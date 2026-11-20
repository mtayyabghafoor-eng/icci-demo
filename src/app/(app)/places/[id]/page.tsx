// One place (slice P1.12): its number, where it is, the places inside it and
// what is there. Rename, print its label (and the labels of everything inside
// it), add the next kind of place inside, switch off or back on. Scanning a
// place label (/p/PL-0001) opens this page.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pencil, Plus, Printer, ScanLine } from "lucide-react";
import { Button, Card, CardTitle, FactGrid, LinkButton, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { KIND_LABEL, type ItemKind } from "@/lib/items/rules";
import { CHILD_KIND, KIND_WORD, placeCode } from "@/lib/places/rules";
import type { StockStatus } from "@/lib/stock/rules";
import { createClient } from "@/lib/supabase/server";
import { ItemStatus, Notice, StatusBadge } from "../../items/ui";
import { allPlaces, childrenOf, lineOf, UUID } from "../data";
import { SwitchPlace } from "../forms";
import { startRoomRegister } from "./register/actions";
import { MAY_SEE_PLACES } from "../page";

export const metadata: Metadata = { title: "Place | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Place added. Print its label from here when you are ready.",
  saved: "Changes saved.",
  "switched-off": "Switched off. Its history stays, and it can be switched back on.",
  "switched-on": "Switched back on.",
};

const SHOWN_ITEMS = 100;

export default function PlacePage(props: PageProps<"/places/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/places/[id]">["params"]; searchParams: PageProps<"/places/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!MAY_SEE_PLACES.includes(me.roleCode) || !UUID.test(id)) notFound();
  const supabase = await createClient();
  const all = await allPlaces(supabase);
  const byId = new Map(all.map((p) => [p.id, p]));
  const place = byId.get(id);
  if (!place) notFound();

  const line = lineOf(id, byId);
  const inside = childrenOf(id, all, true);
  const child = CHILD_KIND[place.kind];
  const kindWord = KIND_WORD[place.kind];

  const { data: items, count } = await supabase
    .from("items")
    .select("id, label_serial, kind, name, condition", { count: "exact" })
    .eq("location_id", id)
    .or("condition.is.null,condition.neq.disposed")
    .order("name")
    .limit(SHOWN_ITEMS);
  const consumables = (items ?? []).filter((i) => i.kind === "consumable").map((i) => i.id);
  const { data: levels } = consumables.length
    ? await supabase.from("stock_levels").select("item_id, status").in("item_id", consumables)
    : { data: [] };
  const stock = new Map((levels ?? []).map((l) => [l.item_id as string, l.status as StockStatus]));
  const done = typeof query.done === "string" ? DONE[query.done] : undefined;

  return (
    <>
      <PageHeader
        crumbs={[{ href: "/places", label: "Places" }, ...line.slice(0, -1).map((p) => ({ href: `/places/${p.id}`, label: p.name }))]}
        title={place.name}
        subtitle={
          <>
            {kindWord} · <span className="font-mono" data-testid="place-code">{placeCode(place.code)}</span>
          </>
        }
        status={!place.active ? <StatusBadge word="Switched off" tone="grey" /> : undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <LinkButton href={`/places/${id}/labels`} icon={Printer} kind="outline">
              {inside.some((p) => p.active) ? "Print labels" : "Print label"}
            </LinkButton>
            <LinkButton href={`/places/${id}/edit`} icon={Pencil} kind="outline">
              Rename
            </LinkButton>
          </div>
        }
      />
      {done && <Notice>{done}</Notice>}

      <div className="mt-4 space-y-4">
        {place.notes && (
          <Card>
            <FactGrid facts={[{ label: "Notes", value: <span className="whitespace-pre-line">{place.notes}</span> }]} />
          </Card>
        )}

        {child && (
          <Card>
            <CardTitle
              action={
                place.active ? (
                  <LinkButton href={`/places/new?inside=${id}`} icon={Plus} kind="secondary">
                    Add a {KIND_WORD[child].toLowerCase()}
                  </LinkButton>
                ) : undefined
              }
            >
              {KIND_WORD[child]}s inside
            </CardTitle>
            {inside.length === 0 ? (
              <p className="text-icci-ink-60">None yet.</p>
            ) : (
              <ul className="divide-y divide-icci-line" data-testid="places-inside">
                {inside.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <Link href={`/places/${p.id}`} className="font-semibold">
                      {p.name}
                    </Link>
                    <span className="font-mono text-sm text-icci-ink-60">{placeCode(p.code)}</span>
                    {!p.active && <StatusBadge word="Switched off" tone="grey" />}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        <Card>
          <CardTitle
            action={
              place.active ? (
                <div className="flex flex-wrap gap-2">
                  <form action={startRoomRegister.bind(null, id)}>
                    <Button type="submit" icon={ScanLine} kind="secondary">
                      Register items in this room
                    </Button>
                  </form>
                  <LinkButton href={`/items/new?location=${id}`} icon={Plus} kind="outline">
                    Register an item here
                  </LinkButton>
                </div>
              ) : undefined
            }
          >
            What is here
          </CardTitle>
          {!items?.length ? (
            <p className="text-icci-ink-60" data-testid="nothing-here">
              Nothing is recorded in this {kindWord.toLowerCase()} itself{inside.length ? " (look in the places inside it)" : ""}.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-icci-line" data-testid="items-here">
                {items.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                    <span className="min-w-0">
                      <Link href={`/items/${i.id}`} className="font-semibold">
                        {i.name}
                      </Link>{" "}
                      <span className="text-sm text-icci-ink-60">
                        · {KIND_LABEL[i.kind as ItemKind]} · <span className="font-mono">{i.label_serial}</span>
                      </span>
                    </span>
                    <ItemStatus kind={i.kind} condition={i.condition} stock={stock.get(i.id)} />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                {(count ?? 0) > SHOWN_ITEMS ? `Showing the first ${SHOWN_ITEMS} of ${count}. ` : ""}
                <Link href={`/items?location=${id}`}>See these and everything inside it in the Items list</Link>
              </p>
            </>
          )}
        </Card>

        <Card>
          <CardTitle>{place.active ? "Switch off" : "Switched off"}</CardTitle>
          <SwitchPlace placeId={id} active={place.active} />
        </Card>
      </div>
    </>
  );
}
