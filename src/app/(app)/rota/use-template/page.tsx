// Use a template on a week (slice P3.4). Lists the four templates with what
// each adds; "Use" adds the empty slots and goes back to the week. Only for
// a week that nobody is on yet (so names already given are never changed),
// and not for a week that has ended. One week template per week; an Eid
// template asks which day is Eid. Super Admin and Centre Admin only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CannotSee, Card, Notice, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { fullDayLabel, MAY_SEE_ROTA, type SlotGroup } from "@/lib/rota/rules";
import { groupCounts, KIND_TEXT, slotsText, TEMPLATE_COLUMNS, TEMPLATE_USE_COLUMNS, type RotaTemplate, type TemplateUse } from "@/lib/rota/templates";
import { readWeek, weekDays, weekEnded, weekTitle } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { todayInDublin } from "@/lib/vetting/rules";
import { UseTemplateForm } from "./use-form";

export const metadata: Metadata = { title: "Use a rota template | ICCI Control Dashboard" };

export default function UseTemplatePage(props: PageProps<"/rota/use-template">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/rota/use-template">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Use a Template" />
        <CannotSee area="rota" />
      </>
    );
  }
  const today = todayInDublin();
  const monday = readWeek((await searchParams).week, today);
  const back = `/rota?week=${monday}`;
  const crumbs = [{ href: back, label: weekTitle(monday) }, { label: "Use a template" }];
  const supabase = await createClient();
  const { data: week } = await supabase.from("rota_weeks").select("id").eq("week_start", monday).maybeSingle();
  if (!week || weekEnded(monday, today)) {
    return (
      <>
        <PageHeader title="Use a Template" crumbs={crumbs} />
        <Notice tone="info">{week ? "This week has ended, so a template can no longer be used on it." : "Start this week's rota first."}</Notice>
        <p className="mt-4">
          <Link href={back} className="font-semibold">
            ← Back to the week
          </Link>
        </p>
      </>
    );
  }

  const [{ data: t }, { data: s }, { data: types }, { data: u }, { count: filled }] = await Promise.all([
    supabase.from("rota_templates").select(TEMPLATE_COLUMNS).eq("active", true).order("display_order").order("name"),
    supabase.from("rota_template_slots").select("template_id, slot_type_id, people_count").eq("active", true),
    supabase.from("rota_slot_types").select("id, slot_group, active"),
    supabase.from("rota_template_uses").select(TEMPLATE_USE_COLUMNS).eq("week_id", week.id).order("used_at"),
    supabase.from("rota_entries").select("id", { count: "exact", head: true }).eq("week_id", week.id).not("person_id", "is", null),
  ]);
  const templates = (t ?? []) as RotaTemplate[];
  const uses = (u ?? []) as TemplateUse[];
  const typeOf = new Map(((types ?? []) as { id: string; slot_group: SlotGroup; active: boolean }[]).map((x) => [x.id, x]));
  const slots = ((s ?? []) as { template_id: string; slot_type_id: string; people_count: number }[]).flatMap((x) => {
    const type = typeOf.get(x.slot_type_id);
    return type?.active ? [{ ...x, group: type.slot_group }] : [];
  });
  const nameOf = new Map(templates.map((x) => [x.id, x.name]));
  const weekTemplateUsed = uses.find((x) => templates.find((tt) => tt.id === x.template_id)?.kind === "week");
  const days = weekDays(monday).map((d) => ({ value: d, label: fullDayLabel(d) }));
  const someoneOn = (filled ?? 0) > 0;

  return (
    <>
      <PageHeader title="Use a Template" crumbs={crumbs} subtitle={weekTitle(monday)} />
      <div className="mb-4 space-y-3">
        {someoneOn ? (
          <Notice tone="warning" testId="template-blocked">
            People are already on this week&rsquo;s slots, so a template cannot be used: it only fills a week that nobody is on yet. Add any extra slots by hand with &ldquo;Add a slot&rdquo;.
          </Notice>
        ) : (
          <Notice tone="info">A template adds empty slots to this week. You then click each slot to put a person on it. The prayers and Jumu&rsquo;ah are already there.</Notice>
        )}
        {uses.length > 0 && (
          <p className="text-[15px]" data-testid="template-uses">
            Already used on this week:{" "}
            {uses.map((x) => `${nameOf.get(x.template_id) ?? "a template"}${x.on_day ? ` (${fullDayLabel(x.on_day)})` : ""}`).join(", ")}.
          </p>
        )}
      </div>

      <ul className="grid gap-4 sm:grid-cols-2">
        {templates.map((template) => {
          const own = slots.filter((x) => x.template_id === template.id);
          const total = own.reduce((n, x) => n + x.people_count, 0);
          const usedHere = uses.some((x) => x.template_id === template.id);
          const reason = someoneOn
            ? "Not available: people are already on this week."
            : total === 0
              ? "This template has no slots switched on."
              : template.kind === "week" && weekTemplateUsed
                ? `Not available: this week already has the ${nameOf.get(weekTemplateUsed.template_id)} template.`
                : usedHere
                  ? "Already used on this week."
                  : null;
          return (
            <li key={template.id} data-testid="use-template-card">
              <Card className="h-full">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 dir="auto" className="text-lg font-bold text-icci-green-dark">{template.name}</h2>
                  <StatusBadge word={KIND_TEXT[template.kind]} tone={template.kind === "day" ? "amber" : "grey"} />
                </div>
                <p className="mt-2 text-[15px] text-icci-ink-60">
                  Adds {slotsText(total)}
                  {template.kind === "day" ? " on the day of Eid" : " to the week"}
                  {own.length > 0 && ` (${groupCounts(own)})`}.{" "}
                  <Link href={`/rota/templates/${template.id}`}>See its slots</Link>
                </p>
                <UseTemplateForm weekId={week.id} monday={monday} templateId={template.id} name={template.name} days={template.kind === "day" ? days : []} disabledReason={reason} />
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
