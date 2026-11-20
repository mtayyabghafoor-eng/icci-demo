// Slot types (slice P3.1): the kinds of slot a rota week is built from, in
// four groups (prayers, Jumu'ah, shifts, on call). Super Admin and Centre
// Admin can add one, rename it, move it up or down within its group, tick
// "needs Garda vetting" (the rota will warn when someone without valid
// vetting is put on it) and switch it off. Never deleted. PC first.
import type { Metadata } from "next";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Suspense } from "react";
import { Card, CardTitle, Notice, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { MAY_SEE_ROTA, SLOT_GROUP_LABEL, SLOT_GROUPS, SLOT_TYPE_COLUMNS, timeTakenText, type SlotType } from "@/lib/rota/rules";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "../../items/ui";
import { moveSlotType, setSlotTypeActive } from "../actions";
import { CannotSeeRota } from "../cannot-see";
import { AddSlotTypeForm, EditSlotTypeForm } from "./forms";

export const metadata: Metadata = { title: "Slot types | ICCI Control Dashboard" };

const DONE: Record<string, string> = {
  added: "Slot type added at the end of its group.",
  saved: "Changes saved.",
  moved: "Order changed.",
  "switched-off": "Switched off. It stays on the list below, but can no longer be put on a rota.",
  "switched-on": "Switched back on.",
  "not-allowed": "Your account is not allowed to do this.",
};

export default function SlotTypesPage(props: PageProps<"/rota/slot-types">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <PageHeader
        title="Slot Types"
        subtitle="The slots a rota week is built from. Ticking “Needs Garda vetting” makes the rota warn when someone without valid vetting is put on that slot."
      />
      <Suspense fallback={<p className="mt-6">Loading…</p>}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/rota/slot-types">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) return <CannotSeeRota />;
  const { done } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("rota_slot_types").select(SLOT_TYPE_COLUMNS).order("display_order");
  const all = (data ?? []) as SlotType[];
  const off = all.filter((t) => !t.active).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      {typeof done === "string" && DONE[done] && (
        <div className="mb-4">
          <Notice tone={done === "not-allowed" ? "error" : "success"} floating testId="notice">
            {DONE[done]}
          </Notice>
        </div>
      )}

      <Card>
        <CardTitle>Add a slot type</CardTitle>
        <AddSlotTypeForm />
      </Card>

      {SLOT_GROUPS.map((g) => {
        const inGroup = all.filter((t) => t.active && t.slot_group === g);
        return (
          <section key={g} className="mt-8" aria-labelledby={`group-${g}`} data-testid={`slot-group-${g}`}>
            <h2 id={`group-${g}`} className="text-lg font-bold text-icci-green-dark">
              {SLOT_GROUP_LABEL[g]}
            </h2>
            {inGroup.length === 0 ? (
              <p className="mt-2 text-icci-ink-60">None switched on.</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {inGroup.map((t, i) => (
                  <SlotCard key={t.id} t={t} first={i === 0} last={i === inGroup.length - 1} />
                ))}
              </ol>
            )}
          </section>
        );
      })}

      {off.length > 0 && (
        <details className="mt-8">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Switched off ({off.length})</summary>
          <ul className="mt-2 space-y-3" data-testid="slot-types-off">
            {off.map((t) => (
              <SlotCard key={t.id} t={t} first last />
            ))}
          </ul>
        </details>
      )}
      <p className="mt-6 text-sm">Slot types are never deleted. Switch one off when it is no longer used.</p>
    </>
  );
}

function SlotCard({ t, first, last }: { t: SlotType; first: boolean; last: boolean }) {
  const button = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] border px-3 py-2 font-semibold transition-colors duration-150";
  const quiet = `${button} border-[#c9d3cf] bg-white text-icci-text hover:border-icci-green hover:bg-icci-green-50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-[#c9d3cf] disabled:hover:bg-white`;
  return (
    <li
      id={`slot-${t.id}`}
      data-testid="slot-type"
      className={`rounded-2xl border p-4 shadow-card md:p-5 ${t.active ? "border-icci-line bg-white" : "border-dashed border-icci-text/40 bg-[#F0F0EE]"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          <span className="block font-semibold" dir="auto" data-testid="slot-name">
            {t.name}
          </span>
          <span className="block text-sm">
            {!t.active && `${SLOT_GROUP_LABEL[t.slot_group]} · `}
            {timeTakenText(t.prayer_time)}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge {...(t.needs_vetting ? { word: "Needs Garda vetting", tone: "amber" as const } : { word: "No vetting needed", tone: "grey" as const })} />
          {t.active && (
            <>
              <form action={moveSlotType.bind(null, t.id, "up")}>
                <button type="submit" className={quiet} disabled={first} aria-label={`Move ${t.name} up`}>
                  <ArrowUp aria-hidden size={18} />
                </button>
              </form>
              <form action={moveSlotType.bind(null, t.id, "down")}>
                <button type="submit" className={quiet} disabled={last} aria-label={`Move ${t.name} down`}>
                  <ArrowDown aria-hidden size={18} />
                </button>
              </form>
            </>
          )}
          <form action={setSlotTypeActive.bind(null, t.id, !t.active)}>
            {t.active ? (
              <button type="submit" className={quiet}>
                Switch off
              </button>
            ) : (
              <button type="submit" className={`${button} border-icci-green-dark bg-icci-green-dark text-white shadow-sm hover:bg-icci-green-900`}>
                Switch back on
              </button>
            )}
          </form>
        </span>
      </div>
      <details className="mt-2">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-icci-green">Change name or vetting</summary>
        <EditSlotTypeForm slot={t} />
      </details>
    </li>
  );
}
