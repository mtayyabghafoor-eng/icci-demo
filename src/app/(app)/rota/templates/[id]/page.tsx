// One rota template (slice P3.4): its slots, by day for a week template, or
// as one list for an Eid (one-day) template. Add a slot (several days at
// once if wanted) or switch one off; nothing is deleted or typed over, so a
// change is "switch off, add the new one". Super Admin and Centre Admin only.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_ROTA, SLOT_GROUPS, type SlotType } from "@/lib/rota/rules";
import { dayName, DAY_NAMES, KIND_TEXT, TEMPLATE_COLUMNS, TEMPLATE_SLOT_COLUMNS, templateSlotText, type RotaTemplate, type TemplateSlot } from "@/lib/rota/templates";
import { slotOptionLabel } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";
import { StatusBadge } from "../../../items/ui";
import { CannotSeeRota } from "../../cannot-see";
import { loadPlaces, loadSlotTypes } from "../../week-data";
import { setTemplateSlotActive } from "../actions";
import { AddTemplateSlotForm } from "./forms";

export const metadata: Metadata = { title: "Rota template | ICCI Control Dashboard" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function TemplatePage(props: PageProps<"/rota/templates/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ params, searchParams }: { params: PageProps<"/rota/templates/[id]">["params"]; searchParams: PageProps<"/rota/templates/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Rota Template" />
        <CannotSeeRota />
      </>
    );
  }
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const crumbs = [{ href: "/rota/templates", label: "Templates" }];
  const supabase = await createClient();
  const { data } = UUID.test(id) ? await supabase.from("rota_templates").select(TEMPLATE_COLUMNS).eq("id", id).maybeSingle() : { data: null };
  const template = data as RotaTemplate | null;
  if (!template) {
    return (
      <>
        <PageHeader title="Rota Template" crumbs={crumbs} />
        <p>This template could not be found.</p>
      </>
    );
  }

  const [{ data: s }, types, places] = await Promise.all([
    supabase.from("rota_template_slots").select(TEMPLATE_SLOT_COLUMNS).eq("template_id", id).order("day_of_week", { nullsFirst: true }).order("start_time", { nullsFirst: true }).order("id"),
    loadSlotTypes(supabase),
    loadPlaces(supabase),
  ]);
  const slots = (s ?? []) as TemplateSlot[];
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const placeName = new Map(places.map((p) => [p.id, p.label]));
  const groupIndex = (t?: SlotType) => (t ? SLOT_GROUPS.indexOf(t.slot_group) * 1000 + t.display_order : 99999);
  const sorted = (list: TemplateSlot[]) => [...list].sort((a, b) => groupIndex(typeOf.get(a.slot_type_id)) - groupIndex(typeOf.get(b.slot_type_id)));
  const on = slots.filter((x) => x.active && typeOf.get(x.slot_type_id)?.active);
  const off = slots.filter((x) => !x.active || !typeOf.get(x.slot_type_id)?.active);
  const sections = template.kind === "week" ? DAY_NAMES.map((name, i) => ({ title: name, list: sorted(on.filter((x) => x.day_of_week === i + 1)) })) : [{ title: "On the day of Eid", list: sorted(on) }];
  const order = (g: string) => SLOT_GROUPS.indexOf(g as (typeof SLOT_GROUPS)[number]);
  const slotOptions = types
    .filter((t) => t.active && !(template.kind === "day" && t.slot_group === "jumuah"))
    .sort((a, b) => order(b.slot_group) - order(a.slot_group) || a.display_order - b.display_order)
    .map((t) => ({ value: t.id, label: slotOptionLabel(t.name, t.slot_group, t.prayer_time), group: t.slot_group }));
  const done = typeof query.done === "string" ? query.done : undefined;
  const count = typeof query.count === "string" && /^\d+$/.test(query.count) ? Number(query.count) : 1;
  const DONE: Record<string, { text: string; tone: "success" | "error" }> = {
    added: { text: count > 1 ? `${count} slots added to the template.` : "Slot added to the template.", tone: "success" },
    "switched-off": { text: "Switched off. Weeks filled from now on leave it out; weeks already filled keep it.", tone: "success" },
    "switched-on": { text: "Switched back on.", tone: "success" },
    "not-allowed": { text: "Your account is not allowed to do this.", tone: "error" },
  };

  return (
    <>
      <PageHeader
        title={template.name}
        crumbs={[...crumbs, { label: template.name }]}
        status={<StatusBadge word={KIND_TEXT[template.kind]} tone={template.kind === "day" ? "amber" : "grey"} />}
        subtitle={template.description ?? undefined}
      />
      {done && DONE[done] && (
        <div className="mb-4">
          <Notice tone={DONE[done].tone} testId="notice">
            {DONE[done].text}
          </Notice>
        </div>
      )}
      {template.kind === "day" && (
        <div className="mb-4">
          <Notice tone="info">The date of Eid moves every year, so this template has no days. When you use it on a week you pick which day is Eid; use it as well as the week&rsquo;s own template.</Notice>
        </div>
      )}

      <div className={cx("grid gap-4", template.kind === "week" && "md:grid-cols-2")} data-testid="template-days">
        {sections.map((sec) => (
          <Card key={sec.title} padded={false} className="p-4">
            <h2 className="text-lg font-bold text-icci-green-dark">{sec.title}</h2>
            {sec.list.length === 0 ? (
              <p className="mt-2 text-icci-ink-60">Nothing extra. The prayers come by themselves.</p>
            ) : (
              <ul className="mt-1 divide-y divide-icci-line">
                {sec.list.map((x) => (
                  <SlotRow key={x.id} x={x} type={typeOf.get(x.slot_type_id)} place={x.location_id ? placeName.get(x.location_id) : undefined} />
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardTitle>Add a slot to this template</CardTitle>
        <AddTemplateSlotForm templateId={template.id} kind={template.kind} slots={slotOptions} places={places.map((p) => ({ value: p.id, label: p.label }))} />
      </Card>

      {off.length > 0 && (
        <details className="mt-6">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Switched off ({off.length})</summary>
          <ul className="mt-2 divide-y divide-icci-line rounded-2xl border border-dashed border-icci-text/40 bg-[#F0F0EE] px-4" data-testid="template-slots-off">
            {off.map((x) => (
              <SlotRow key={x.id} x={x} type={typeOf.get(x.slot_type_id)} place={x.location_id ? placeName.get(x.location_id) : undefined} showDay={template.kind === "week"} />
            ))}
          </ul>
        </details>
      )}
      <p className="mt-6 text-sm">Template slots are never deleted. To change one, switch it off and add the new one.</p>
    </>
  );
}

function SlotRow({ x, type, place, showDay = false }: { x: TemplateSlot; type: SlotType | undefined; place?: string; showDay?: boolean }) {
  const typeOff = type && !type.active;
  const label = type ? templateSlotText(type.name, type.slot_group, x) : "Unknown slot";
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid="template-slot">
      <span>
        <span className="block font-semibold" dir="auto">
          {showDay && x.day_of_week ? `${dayName(x.day_of_week)}: ` : ""}
          {label}
        </span>
        {(place || x.note || typeOff) && (
          <span className="block text-[15px] text-icci-ink-60" dir="auto">
            {[place, x.note, typeOff ? "Its slot type is switched off" : null].filter(Boolean).join(" · ")}
          </span>
        )}
      </span>
      {!typeOff && (
        <form action={setTemplateSlotActive.bind(null, x.template_id, x.id, !x.active)}>
          <button
            type="submit"
            aria-label={`${x.active ? "Switch off" : "Switch back on"}: ${x.day_of_week ? `${dayName(x.day_of_week)}, ` : ""}${label}`}
            className="inline-flex min-h-11 items-center rounded-[10px] border border-[#c9d3cf] bg-white px-3 py-2 text-[15px] font-semibold hover:border-icci-green hover:bg-icci-green-50"
          >
            {x.active ? "Switch off" : "Switch back on"}
          </button>
        </form>
      )}
    </li>
  );
}
