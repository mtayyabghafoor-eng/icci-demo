// Today's rota (slice P3.3): who is on each slot today, in time order,
// grouped as Prayers, Jumu'ah, Shifts, On call. Slots not filled are amber.
// The Home page counter opens this list. Super Admin and Centre Admin only.
// Slice P3.4: who is on funeral call today, with their phone number, at the
// top (owner's choice, 18 Nov 2026). The phone number is shown here, to
// admins only; it is never on the printed rota.
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { CalendarDays, Phone } from "lucide-react";
import { requireAdmin } from "@/lib/auth/current-admin";
import { fullDayLabel, MAY_SEE_ROTA, SLOT_GROUP_LABEL, SLOT_GROUPS } from "@/lib/rota/rules";
import { timeText } from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";
import { todayInDublin } from "@/lib/vetting/rules";
import { CannotSeeRota } from "../cannot-see";
import { ENTRY_COLUMNS, loadPlaces, loadSlotTypes, peopleNames, type RotaEntry } from "../week-data";

export const metadata: Metadata = { title: "Today's rota | ICCI Control Dashboard" };

export default function TodayRotaPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content />
      </Suspense>
    </main>
  );
}

async function Content() {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Today's Rota" />
        <CannotSeeRota />
      </>
    );
  }
  const today = todayInDublin();
  const supabase = await createClient();
  const { data } = await supabase.from("rota_entries").select(ENTRY_COLUMNS).eq("assignment_date", today).order("start_min", { nullsFirst: false }).order("id");
  const entries = (data ?? []) as RotaEntry[];
  const [types, names, places] = await Promise.all([
    loadSlotTypes(supabase),
    peopleNames(supabase, entries.flatMap((e) => (e.person_id ? [e.person_id] : []))),
    loadPlaces(supabase, entries.flatMap((e) => (e.location_id ? [e.location_id] : []))),
  ]);
  const typeName = new Map(types.map((t) => [t.id, t.name]));
  const placeName = new Map(places.map((p) => [p.id, p.label]));
  const unfilled = entries.filter((e) => !e.person_id).length;
  const onCall = entries.filter((e) => e.slot_group === "on_call");
  const phones = await onCallPhones(supabase, onCall.flatMap((e) => (e.person_id ? [e.person_id] : [])));
  const header = (
    <PageHeader
      title="Today's Rota"
      subtitle={fullDayLabel(today)}
      actions={
        <LinkButton kind="outline" href={`/rota?week=${today}`}>
          Open this week
        </LinkButton>
      }
    />
  );

  if (entries.length === 0) {
    return (
      <>
        {header}
        <EmptyState icon={CalendarDays} title="Nothing on the rota today." action={<LinkButton href={`/rota?week=${today}`}>Open this week</LinkButton>}>
          This week&rsquo;s rota may not have been started yet.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}
      {onCall.length > 0 && (
        <Card tone="gold" padded={false} className="mb-4 p-4">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-icci-green-dark">On call today</h2>
          <ul className="mt-1 divide-y divide-icci-gold-300" data-testid="on-call-today">
            {onCall.map((e) => {
              const person = e.person_id ? names.get(e.person_id) : null;
              const phone = e.person_id ? phones.get(e.person_id) : null;
              return (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
                  <span>
                    <span className="font-semibold">{typeName.get(e.slot_type_id)}</span>
                    <span className="ml-2 text-[15px] text-icci-ink-60">{timeText(e.slot_group, e.starts_at, e.ends_at)}</span>
                  </span>
                  {person ? (
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="font-semibold" dir="auto">
                        {person}
                      </span>
                      {phone ? (
                        <a href={`tel:${phone.replace(/[^+\d]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 font-semibold" data-testid="on-call-phone">
                          <Phone aria-hidden size={16} />
                          {phone}
                        </a>
                      ) : (
                        <span className="text-[15px] text-icci-ink-60">No phone number in the directory</span>
                      )}
                    </span>
                  ) : (
                    <Link href={`/rota/slot/${e.id}`} className="font-semibold text-[var(--icci-warn-text)]">
                      Nobody on call yet. Put someone on →
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="mb-4 text-[15px] text-icci-ink-60" data-testid="today-summary">
        {entries.length - unfilled} of {entries.length} slots filled{unfilled > 0 && ` · ${unfilled} not filled yet`}
      </p>
      <div className="space-y-4">
        {SLOT_GROUPS.map((g) => {
          const inGroup = entries.filter((e) => e.slot_group === g);
          if (inGroup.length === 0) return null;
          return (
            <Card key={g} padded={false} className="p-4">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-icci-ink-60">{SLOT_GROUP_LABEL[g]}</h2>
              <ul className="mt-1 divide-y divide-icci-line">
                {inGroup.map((e) => {
                  const person = e.person_id ? names.get(e.person_id) : null;
                  return (
                    <li key={e.id} data-testid="today-slot">
                      <Link href={`/rota/slot/${e.id}`} className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 py-2 text-icci-text no-underline hover:text-icci-green">
                        <span>
                          <span className="font-semibold">{typeName.get(e.slot_type_id)}</span>
                          <span className="ml-2 text-[15px] text-icci-ink-60">
                            {timeText(e.slot_group, e.starts_at, e.ends_at)}
                            {e.location_id && ` · ${placeName.get(e.location_id)}`}
                          </span>
                        </span>
                        <span className={cx("font-semibold", !person && "text-[var(--icci-warn-text)]")} dir="auto">
                          {person ?? "Not filled yet"}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          );
        })}
      </div>
    </>
  );
}

/** Phone numbers of the people on call today (admins only; never printed). */
async function onCallPhones(supabase: Awaited<ReturnType<typeof createClient>>, ids: string[]): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data } = await supabase.from("people").select("id, phone").in("id", [...new Set(ids)]);
  return new Map(((data ?? []) as { id: string; phone: string | null }[]).flatMap((p) => (p.phone ? [[p.id, p.phone] as [string, string]] : [])));
}
