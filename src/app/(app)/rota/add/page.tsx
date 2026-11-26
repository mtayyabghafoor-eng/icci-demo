// Add a slot to a rota week (slice P3.2): mostly shifts and on call, which a
// new week does not have; an extra prayer slot is possible too. The person
// is picked afterwards, on the slot itself. Not for a week that has ended.
import type { Metadata } from "next";
import { Suspense } from "react";
import { CannotSee, Card, Notice, PageHeader, Skeleton } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { fullDayLabel, MAY_SEE_ROTA, SLOT_GROUPS } from "@/lib/rota/rules";
import { readWeek, slotOptionLabel, weekDays, weekEnded, weekTitle } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { loadPlaces, loadSlotTypes } from "../week-data";
import { AddSlotForm } from "./add-form";

export const metadata: Metadata = { title: "Add a rota slot | ICCI Control Dashboard" };

export default function AddSlotPage(props: PageProps<"/rota/add">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/rota/add">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Add a Slot" />
        <CannotSee area="rota" />
      </>
    );
  }
  const today = todayInDublin();
  const monday = readWeek((await searchParams).week, today);
  const crumbs = [{ href: `/rota?week=${monday}`, label: weekTitle(monday) }, { label: "Add a slot" }];
  const supabase = await createClient();
  const { data: week } = await supabase.from("rota_weeks").select("id").eq("week_start", monday).maybeSingle();
  if (!week || weekEnded(monday, today)) {
    return (
      <>
        <PageHeader title="Add a Slot" crumbs={crumbs} />
        <Notice tone="warning">{week ? "This week has ended, so no slots can be added." : "Start this week's rota first."}</Notice>
      </>
    );
  }
  const [types, places] = await Promise.all([loadSlotTypes(supabase), loadPlaces(supabase)]);
  const order = (g: string) => SLOT_GROUPS.indexOf(g as (typeof SLOT_GROUPS)[number]);
  const slots = types
    .filter((t) => t.active)
    .sort((a, b) => order(b.slot_group) - order(a.slot_group) || a.display_order - b.display_order) // shifts and on call first
    .map((t) => ({ value: t.id, label: slotOptionLabel(t.name, t.slot_group, t.prayer_time), group: t.slot_group }));

  return (
    <>
      <PageHeader title="Add a Slot" crumbs={crumbs} subtitle="The person is picked afterwards, by clicking the new slot on the week." />
      <Card>
        <AddSlotForm
          weekId={week.id}
          monday={monday}
          days={weekDays(monday).map((d) => ({ value: d, label: fullDayLabel(d) }))}
          slots={slots}
          places={places.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Card>
    </>
  );
}
