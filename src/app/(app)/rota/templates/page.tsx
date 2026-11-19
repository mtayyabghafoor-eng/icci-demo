// Rota templates (slice P3.4): the four templates (Normal week, Ramadan, Eid
// al-Fitr, Eid al-Adha), each with the extra slots it adds to a week:
// shifts, on call and extra people on a prayer. The prayers and Jumu'ah
// come by themselves in every week. Open one to add or switch off its
// slots; "Use a template" is on the Rota week. Super Admin and Centre Admin
// only.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_ROTA, type SlotGroup } from "@/lib/rota/rules";
import { groupCounts, KIND_TEXT, slotsText, TEMPLATE_COLUMNS, type RotaTemplate } from "@/lib/rota/templates";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "../../items/ui";
import { CannotSeeRota } from "../cannot-see";

export const metadata: Metadata = { title: "Rota templates | ICCI Control Dashboard" };

export default function TemplatesPage() {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <PageHeader
        title="Rota Templates"
        subtitle="Each template adds empty slots to a week: shifts, on call and extra people on a prayer. The five prayers and Jumu'ah come by themselves in every week."
      />
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) return <CannotSeeRota />;
  const supabase = await createClient();
  const [{ data: t }, { data: s }, { data: types }] = await Promise.all([
    supabase.from("rota_templates").select(TEMPLATE_COLUMNS).eq("active", true).order("display_order").order("name"),
    supabase.from("rota_template_slots").select("template_id, slot_type_id, people_count").eq("active", true),
    supabase.from("rota_slot_types").select("id, slot_group, active"),
  ]);
  const templates = (t ?? []) as RotaTemplate[];
  const typeOf = new Map(((types ?? []) as { id: string; slot_group: SlotGroup; active: boolean }[]).map((x) => [x.id, x]));
  const slots = ((s ?? []) as { template_id: string; slot_type_id: string; people_count: number }[]).flatMap((x) => {
    const type = typeOf.get(x.slot_type_id);
    return type?.active ? [{ ...x, group: type.slot_group }] : [];
  });

  return (
    <>
      <div className="mb-4">
        <Notice tone="info">
          To use one, open the week on the{" "}
          <Link href="/rota" className="font-semibold">
            Rota week
          </Link>{" "}
          page and choose &ldquo;Use a template&rdquo;. A template only fills a week that nobody is on yet, so it never changes names already given.
        </Notice>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2" data-testid="template-list">
        {templates.map((template) => {
          const own = slots.filter((x) => x.template_id === template.id);
          const total = own.reduce((n, x) => n + x.people_count, 0);
          return (
            <li key={template.id} data-testid="template-card">
              <Card className="h-full">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-icci-green-dark">
                    <Link href={`/rota/templates/${template.id}`} className="text-icci-green-dark">
                      {template.name}
                    </Link>
                  </h2>
                  <StatusBadge word={KIND_TEXT[template.kind]} tone={template.kind === "day" ? "amber" : "grey"} />
                </div>
                {template.description && <p className="mt-2 text-[15px]">{template.description}</p>}
                <p className="mt-2 text-[15px] text-icci-ink-60" data-testid="template-count">
                  Adds {slotsText(total)}
                  {template.kind === "day" ? " on the day" : " to the week"}
                  {own.length > 0 && ` (${groupCounts(own)})`}.
                </p>
                <p className="mt-3">
                  <Link href={`/rota/templates/${template.id}`} className="font-semibold">
                    See and edit its slots →
                  </Link>
                </p>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
