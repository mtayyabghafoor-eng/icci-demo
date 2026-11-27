// One rota slot (slice P3.2): what it is, its warnings, and the person
// picker. Search the people directory; each name shows their Garda vetting
// on that day (green, grey or red) and what else they are on that day.
// "Put on this slot", "Take off" and "Remove this slot" each add an entry
// (nothing is typed over). Read-only once the week has ended.
// A7: with someone on it, "Also put them on" ticks the same slot on the
// other days of the week that are still empty.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CircleAlert, TriangleAlert } from "lucide-react";
import { Suspense } from "react";
import { BackLink, buttonClass, CannotSee, Card, CardTitle, ConfirmSubmit, FactGrid, fieldClass, Notice, PageHeader, Skeleton, StatusBadge } from "@/components/ui";
import { requireAdmin } from "@/lib/auth/current-admin";
import { fullDayLabel, MAY_SEE_ROTA, shortDayLabel, SLOT_GROUP_LABEL } from "@/lib/rota/rules";
import {
  timeText,
  VETTING_ON_DAY,
  vettingOnDay,
  WARNING_COLUMNS,
  warningText,
  warningTone,
  weekEnded,
  weekTitle,
  type RotaWarning,
  type VettingRecord,
} from "@/lib/rota/week";
import { createClient } from "@/lib/supabase/server";
import { cx } from "@/lib/ui/text";
import { todayInDublin } from "@/lib/vetting/rules";
import { ENTRY_COLUMNS, loadPlaces, loadSlotTypes, peopleNames, type RotaEntry } from "../../week-data";
import { assignMore, assignPerson, removeSlot } from "../../week-actions";
import { TickAll } from "./tick-all";

export const metadata: Metadata = { title: "Rota slot | ICCI Control Dashboard" };

const PROBLEM: Record<string, string> = {
  ended: "That week has ended. Its rota can no longer be changed.",
  "switched-off": "That person, place or slot type is switched off, so it cannot be used.",
  changed: "This slot was changed by someone else meanwhile. Go back to the week and open it again.",
  "not-allowed": "Your account is not allowed to do this.",
  other: "That could not be saved. Please try again.",
};

/** How many names the picker shows at once. */
const SHOWN = 25;
const READ = 300;

export default function RotaSlotPage(props: PageProps<"/rota/slot/[id]">) {
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
      <Suspense fallback={<Skeleton />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </main>
  );
}

type Row = { id: number; week_id: string; assignment_date: string; slot_type_id: string; person_id: string | null; removed_at: string | null };

async function Content({ params, searchParams }: { params: PageProps<"/rota/slot/[id]">["params"]; searchParams: PageProps<"/rota/slot/[id]">["searchParams"] }) {
  const me = await requireAdmin();
  if (!MAY_SEE_ROTA.includes(me.roleCode)) {
    return (
      <>
        <PageHeader title="Rota Slot" />
        <CannotSee area="rota" />
      </>
    );
  }
  const { id: rawId } = await params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").replace(/[%_\\,()]/g, " ").trim().slice(0, 100);
  const problem = typeof sp.problem === "string" ? PROBLEM[sp.problem] : undefined;
  // D5: a role filter on the picker.
  const roleFilter = typeof sp.role === "string" && /^[0-9a-f-]{36}$/.test(sp.role) ? sp.role : "";

  const supabase = await createClient();
  const { data: rowData } = await supabase
    .from("rota_assignments")
    .select("id, week_id, assignment_date, slot_type_id, person_id, removed_at")
    .eq("id", id)
    .maybeSingle();
  if (!rowData) notFound();
  const row = rowData as Row;
  const { data: week } = await supabase.from("rota_weeks").select("week_start, status").eq("id", row.week_id).single();
  const monday = week!.week_start as string;
  const back = `/rota?week=${monday}`;
  // E3: one trail only. The top bar already says "Rota › Rota week", so the
  // page gives "← Back to the week" there instead of a second breadcrumb.
  const backLink = <BackLink href={back}>{`Back to the week of ${weekTitle(monday).replace(/^Week of /, "")}`}</BackLink>;

  if (row.removed_at) {
    return (
      <>
        {backLink}
        <PageHeader title="Rota Slot" />
        <Notice tone="warning" title="This slot has changed" testId="slot-changed">
          Someone was put on, taken off, or the slot was removed after this page was opened.{" "}
          <Link href={back} className="font-semibold">
            Back to the week
          </Link>
        </Notice>
      </>
    );
  }

  const today = todayInDublin();
  const locked = weekEnded(monday, today);
  const day = row.assignment_date;
  const [{ data: entryData }, { data: warnData }, types, { data: sameSlotData }] = await Promise.all([
    supabase.from("rota_entries").select(ENTRY_COLUMNS).eq("id", id).single(),
    supabase.from("rota_warnings").select(WARNING_COLUMNS).eq("assignment_id", id),
    loadSlotTypes(supabase),
    supabase.from("rota_entries").select(ENTRY_COLUMNS).eq("week_id", row.week_id).eq("slot_type_id", row.slot_type_id).neq("id", id).order("assignment_date").order("id"),
  ]);
  const entry = entryData as RotaEntry;
  const emptyElsewhere = ((sameSlotData ?? []) as RotaEntry[]).filter((e) => !e.person_id);
  const justAssigned = sp.done === "assigned";
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const type = typeOf.get(row.slot_type_id)!;
  const warnings = (warnData ?? []) as RotaWarning[];

  // The picker: switched-on people, by name.
  // D5: up to 300 are read so the people ready for this slot can be put first.
  let peopleQuery = supabase.from("people").select("id, full_name, person_role_id").eq("active", true).order("full_name").limit(READ + 1);
  if (q) peopleQuery = peopleQuery.ilike("full_name", `%${q}%`);
  if (roleFilter) peopleQuery = peopleQuery.eq("person_role_id", roleFilter);
  const { data: peopleData } = await peopleQuery;
  const found = (peopleData ?? []) as { id: string; full_name: string; person_role_id: string }[];
  const candidates = found.slice(0, READ);
  const ids = candidates.map((p) => p.id);
  const [{ data: roles }, { data: vetting }, { data: sameDay }, current, places] = await Promise.all([
    supabase.from("person_roles").select("id, name, needs_vetting"),
    ids.length
      ? supabase.from("vetting_records").select("person_id, kind, happened_on, expires_on").in("person_id", ids).is("withdrawn_at", null)
      : Promise.resolve({ data: [] }),
    supabase.from("rota_entries").select(ENTRY_COLUMNS).eq("assignment_date", day).not("person_id", "is", null),
    peopleNames(supabase, row.person_id ? [row.person_id] : []),
    entry.location_id ? loadPlaces(supabase, [entry.location_id]) : Promise.resolve([]),
  ]);
  const roleOf = new Map(((roles ?? []) as { id: string; name: string; needs_vetting: boolean }[]).map((r) => [r.id, r]));
  const recordsOf = new Map<string, VettingRecord[]>();
  for (const v of (vetting ?? []) as (VettingRecord & { person_id: string })[]) recordsOf.set(v.person_id, [...(recordsOf.get(v.person_id) ?? []), v]);
  const busyOf = new Map<string, string[]>();
  for (const e of (sameDay ?? []) as RotaEntry[]) {
    if (e.id === id || !e.person_id) continue;
    const what = `${typeOf.get(e.slot_type_id)?.name ?? "a slot"} ${timeText(e.slot_group, e.starts_at, e.ends_at)}`;
    busyOf.set(e.person_id, [...(busyOf.get(e.person_id) ?? []), what]);
  }
  const otherEntries = new Map(((sameDay ?? []) as RotaEntry[]).map((e) => [e.id, e]));
  // D5: ready first (vetting fine for this day and not on another slot that
  // day), then everyone else, each part by name. Anyone can still be picked.
  const vetOf = (p: { id: string; person_role_id: string }) =>
    VETTING_ON_DAY[vettingOnDay(recordsOf.get(p.id) ?? [], day, type.needs_vetting, roleOf.get(p.person_role_id)?.needs_vetting ?? false)];
  const ready = (p: { id: string; person_role_id: string }) => !busyOf.has(p.id) && vetOf(p).tone !== "red" && vetOf(p).tone !== "amber";
  const ordered = [...candidates.filter(ready), ...candidates.filter((p) => !ready(p))];
  const shown = ordered.slice(0, SHOWN);
  const readyCount = shown.filter(ready).length;
  const roleChoices = ((roles ?? []) as { id: string; name: string }[]).sort((a, b) => a.name.localeCompare(b.name));
  const personName = row.person_id ? current.get(row.person_id) : null;

  return (
    <>
      {backLink}
      <PageHeader
        title={`${type.name}, ${fullDayLabel(day)}`}
        status={personName ? <StatusBadge word={`On it: ${personName}`} tone="green" /> : <StatusBadge word="Not filled yet" tone="amber" />}
      />
      {justAssigned && personName && (
        <div className="mb-4">
          <Notice tone="success" floating testId="notice">
            Saved. {personName} is on the slot.
          </Notice>
        </div>
      )}
      {problem && (
        <div className="mb-4">
          <Notice tone="error" testId="problem">
            {problem}
          </Notice>
        </div>
      )}
      {locked && (
        <div className="mb-4">
          <Notice tone="info">This week has ended, so this slot can no longer be changed.</Notice>
        </div>
      )}

      <Card>
        <FactGrid
          facts={[
            { label: "Group", value: SLOT_GROUP_LABEL[type.slot_group] },
            { label: "Time", value: timeText(entry.slot_group, entry.starts_at, entry.ends_at) },
            { label: "Person", value: <span data-testid="slot-person-now">{personName ?? "Not filled yet"}</span> },
            { label: "Garda vetting", value: type.needs_vetting ? "Needed for this slot" : "Needed only if the person's role needs it" },
            ...(entry.location_id ? [{ label: "Place", value: places.find((p) => p.id === entry.location_id)?.label ?? "" }] : []),
            ...(entry.note ? [{ label: "Note", value: <span dir="auto">{entry.note}</span> }] : []),
          ]}
        />
        {warnings.length > 0 && (
          <ul className="mt-5 space-y-1.5" aria-label="Warnings">
            {warnings.map((w, i) => {
              const red = warningTone(w.kind) === "red";
              const Icon = red ? CircleAlert : TriangleAlert;
              const other = w.other_assignment_id ? otherEntries.get(w.other_assignment_id) : undefined;
              const otherText = other ? `${typeOf.get(other.slot_type_id)?.name ?? "another slot"} at ${timeText(other.slot_group, other.starts_at, other.ends_at)}` : undefined;
              return (
                <li key={i} data-testid="slot-warning" className={cx("flex items-start gap-2 font-semibold", red ? "text-icci-error" : "text-[var(--icci-warn-text)]")}>
                  <Icon aria-hidden size={18} className="mt-0.5 shrink-0" />
                  {warningText(w, otherText)}
                </li>
              );
            })}
            <li className="text-sm text-icci-ink-60">Warnings do not stop anything. They are there so nobody is put on a slot by mistake.</li>
          </ul>
        )}
        {!locked && (
          <div className="mt-5 flex flex-wrap gap-2">
            {row.person_id && (
              <form action={assignPerson.bind(null, id, monday, null)}>
                <button type="submit" className={buttonClass("secondary")}>
                  Take {personName ?? "them"} off this slot
                </button>
              </form>
            )}
            <form action={removeSlot.bind(null, id, monday)}>
              <ConfirmSubmit label="Remove this slot from the week" title="Remove this slot from the week?" confirmLabel="Yes, remove it">
                {row.person_id ? `${personName ?? "The person on it"} comes off it too. ` : ""}It stays in the rota&rsquo;s history, but it
                cannot be put back: add a new slot instead.
              </ConfirmSubmit>
            </form>
          </div>
        )}
      </Card>

      {!locked && row.person_id && emptyElsewhere.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardTitle>Also put {personName ?? "them"} on</CardTitle>
            <p className="-mt-2 mb-3 text-[15px]">
              {type.name} on other days this week that nobody is on yet. Tick the days, then save. Warnings show on the week afterwards.
            </p>
            <form action={assignMore.bind(null, monday, row.person_id)} aria-label="Also put this person on">
              <div className="flex flex-wrap gap-2" data-testid="more-days">
                {emptyElsewhere.map((e) => (
                  <label
                    key={e.id}
                    className="flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-icci-line bg-white px-3 has-[:checked]:border-icci-green has-[:checked]:bg-icci-green-50"
                  >
                    <input type="checkbox" name="slots" value={e.id} className="h-5 w-5" />
                    <span>
                      <span className="font-semibold">{shortDayLabel(e.assignment_date)}</span>
                      <span className="ml-1.5 text-sm text-icci-ink-60">{timeText(e.slot_group, e.starts_at, e.ends_at)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="submit" className={buttonClass("primary")}>
                  Put {personName ?? "them"} on the ticked days
                </button>
                {emptyElsewhere.length > 1 && <TickAll />}
              </div>
            </form>
          </Card>
        </div>
      )}
      {!locked && (
        <div className="mt-6">
          <Card>
            <CardTitle>{row.person_id ? "Swap for someone else" : "Pick a person"}</CardTitle>
            <form method="get" className="flex flex-wrap items-end gap-3" role="search" aria-label="Search people">
              <label className="min-w-56 flex-1">
                <span className="font-semibold">Name</span>
                <input name="q" defaultValue={q} maxLength={100} className={fieldClass} dir="auto" placeholder="Type part of a name" />
              </label>
              <label className="min-w-48">
                <span className="font-semibold">Role</span>
                <select name="role" defaultValue={roleFilter} className={fieldClass}>
                  <option value="">Any role</option>
                  {roleChoices.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={buttonClass("secondary")}>
                Search
              </button>
            </form>
            <p className="mt-4 text-[15px] text-icci-ink-60" data-testid="picker-ready">
              {readyCount === 0
                ? "Nobody here is free with valid vetting for this day. You can still pick anyone; the warning shows on the week."
                : `Ready for this slot first: ${readyCount} with vetting in order and free that day.`}
            </p>
            <ul className="mt-2 divide-y divide-icci-line" data-testid="person-picker">
              {shown.length === 0 && <li className="py-3 text-icci-ink-60">No switched-on person matches that name.</li>}
              {shown.map((p, i) => {
                const role = roleOf.get(p.person_role_id);
                const vet = VETTING_ON_DAY[vettingOnDay(recordsOf.get(p.id) ?? [], day, type.needs_vetting, role?.needs_vetting ?? false)];
                const busy = busyOf.get(p.id);
                const onIt = p.id === row.person_id;
                return (
                  <li
                    key={p.id}
                    data-testid="picker-person"
                    data-ready={i < readyCount ? "yes" : undefined}
                    className={cx("flex flex-wrap items-center justify-between gap-3 py-3", i === readyCount && readyCount > 0 && "border-t-2! border-icci-gold-300!")}
                  >
                    <span className="min-w-0">
                      <span className="block font-semibold" dir="auto">
                        {p.full_name}
                      </span>
                      <span className="block text-sm text-icci-ink-60">{role?.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge {...vet} />
                        {busy && (
                          <span className="text-sm font-semibold text-[var(--icci-warn-text)]" data-testid="picker-busy">
                            Already on: {busy.join("; ")}
                          </span>
                        )}
                      </span>
                    </span>
                    {onIt ? (
                      <StatusBadge word="On this slot" tone="green" />
                    ) : (
                      <form action={assignPerson.bind(null, id, monday, p.id)}>
                        <button type="submit" className={buttonClass(i < readyCount ? "outline" : "ghost")} aria-label={`Put ${p.full_name} on this slot`}>
                          Put on this slot
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {found.length > SHOWN && <p className="mt-3 text-sm text-icci-ink-60">More people match. Type more of the name to narrow the list.</p>}
          </Card>
        </div>
      )}
    </>
  );
}
