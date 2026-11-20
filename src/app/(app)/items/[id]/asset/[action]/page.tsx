// Move, Report damage, Mark missing, Mark repaired, Mark found, Dispose:
// one phone-first screen for one fixed asset.
import { titleCase } from "@/lib/ui/text";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { actionsFor, ASSET_ACTIONS, isAssetAction } from "@/lib/assets/rules";
import { requireAdmin } from "@/lib/auth/current-admin";
import { locationOptions } from "@/lib/items/rules";
import { allRows } from "@/lib/supabase/all-rows";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { AssetEventForm } from "../../../../assets/forms";
import { loadLookups, type ItemRow } from "../../../data";
import { ItemStatus } from "../../../ui";

export const metadata: Metadata = { title: "Asset | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AssetActionPage(props: PageProps<"/items/[id]/asset/[action]">) {
  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <Suspense fallback={<p>Loading item…</p>}>
        <Content params={props.params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: { params: PageProps<"/items/[id]/asset/[action]">["params"] }) {
  const { id, action } = await params;
  if (!UUID.test(id) || !isAssetAction(action)) notFound();

  const supabase = await createClient();
  const me = await requireAdmin();
  const [{ data }, pending, lookups, people] = await Promise.all([
    supabase.from("items").select("id, name, kind, label_serial, location_id, condition").eq("id", id).maybeSingle(),
    supabase.from("asset_events").select("id").eq("item_id", id).eq("status", "pending").limit(1),
    loadLookups(supabase),
    // Switched-on people for "Reported by", every one of them (past 1,000 too).
    allRows<{ id: string; full_name: string; app_user_id: string | null }>((from, to) =>
      supabase.from("people").select("id, full_name, app_user_id").eq("active", true).order("full_name").order("id").range(from, to),
    ),
  ]);
  const myPersonId = people.find((p) => p.app_user_id === me.id)?.id ?? null;
  const item = data as Pick<ItemRow, "id" | "name" | "kind" | "label_serial" | "location_id" | "condition"> | null;
  if (!item || item.kind !== "fixed_asset") notFound();

  const allowed = actionsFor(item.condition, Boolean(pending.data?.length)).includes(action);
  const places = locationOptions(lookups.locations).filter((p) => p.id !== item.location_id);

  return (
    <>
      <p className="text-sm">
        <Link className="back-link" href={`/items/${item.id}`}>← Back to the item</Link>
      </p>
      <h1 className="page-title text-[28px] md:text-[34px] mt-2">{titleCase(ASSET_ACTIONS[action].title)}</h1>
      <p className="mt-2 text-lg font-semibold">{item.name}</p>
      <p className="text-sm">
        {item.label_serial} · {lookups.locationName.get(item.location_id)}
      </p>
      <p className="mt-2">
        <ItemStatus kind={item.kind} condition={item.condition} />
      </p>
      {allowed ? (
        <AssetEventForm itemId={item.id} action={action} places={places} people={people} myPersonId={myPersonId} today={todayInDublin()} />
      ) : (
        <p className="mt-4 rounded-xl bg-icci-green-50 px-4 py-3">
          This cannot be done to the asset as it is now. Go back to the item to see what can.
        </p>
      )}
    </>
  );
}
